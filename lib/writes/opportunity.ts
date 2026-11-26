/**
 * Opportunity stage and value changes (SPEC §2.4): append a new opportunity_history version and
 * apply the installment rules (create on cash confirmation, void on lost or withdrawn, rescale on a
 * confirmed value change). One transaction; every row written is audited.
 */
import type { Sql } from "../db/client";
import { DAY_MS } from "../engine/time";
import { LOST_STAGES, type Stage, STAGES } from "../engine/types";
import { type Actor, asRow, assertInt, audit, lockWrites, ms, nextAppId, simulationDate, stamp, teamMember, WriteError } from "./common";

/** §2.1 terms: balance due 22 Mar 2025 18:00 IST, or 7 days after confirmation if later. */
export const BALANCE_DUE_DEFAULT = Date.parse("2025-03-22T18:00:00+05:30");

export interface InstallmentPlan {
  installment: "advance" | "balance";
  amount_due_inr: number;
  due_at: number;
}

/** Advance = value ÷ 2 rounded down, due 7 days after confirmation; balance = the rest (SPEC §2.1). */
export function installmentTerms(total: number, confirmedAt: number): InstallmentPlan[] {
  const advance = Math.floor(total / 2);
  return [
    { installment: "advance", amount_due_inr: advance, due_at: confirmedAt + 7 * DAY_MS },
    { installment: "balance", amount_due_inr: total - advance, due_at: Math.max(BALANCE_DUE_DEFAULT, confirmedAt + 7 * DAY_MS) },
  ];
}

/** Split what is still owed over the unpaid installments: two split as §2.1, one takes it all; never below 0 (N1). */
export function splitRemaining(remaining: number, unpaidCount: number): number[] {
  const r = Math.max(0, remaining);
  if (unpaidCount === 0) return [];
  if (unpaidCount === 1) return [r];
  const first = Math.floor(r / 2);
  return [first, r - first, ...Array(unpaidCount - 2).fill(0)];
}

export interface OpportunityChange {
  opportunity_id: string;
  stage?: Stage;
  proposed_value_inr?: number;
  /** Only for partner_confirmed. Default when confirming: the proposed value (source convention). */
  confirmed_value_inr?: number;
  owner_id?: string;
}

export interface OpportunityChangeResult {
  history_id: string;
  effective_at: number;
  stage: Stage;
  installments: { created: string[]; voided: string[]; rescaled: string[] };
}

type Row = Record<string, unknown>;

export async function changeOpportunity(sql: Sql, input: OpportunityChange, actor: Actor = "user", now: number = Date.now()): Promise<OpportunityChangeResult> {
  return sql.begin(async (tx) => {
    await lockWrites(tx);
    const sim = await simulationDate(tx);
    const [opp] = await tx<Row[]>`select * from opportunities where opportunity_id = ${input.opportunity_id}`;
    if (!opp) throw new WriteError(`Opportunity ${input.opportunity_id} does not exist`);
    const [latest] = await tx<Row[]>`
      select * from v_opportunity_history where opportunity_id = ${input.opportunity_id}
      order by effective_at desc, history_id desc limit 1`;
    if (!latest) throw new WriteError(`Opportunity ${input.opportunity_id} has no history`);

    const prevStage = latest.stage as Stage;
    const stage = input.stage ?? prevStage;
    if (!STAGES.includes(stage)) throw new WriteError(`Unknown stage ${stage}`);
    const proposed = input.proposed_value_inr === undefined ? Number(latest.proposed_value_inr) : assertInt("proposed_value_inr", input.proposed_value_inr);
    let confirmed: number;
    if (stage === "partner_confirmed") {
      if (input.confirmed_value_inr !== undefined) confirmed = assertInt("confirmed_value_inr", input.confirmed_value_inr);
      else confirmed = prevStage === "partner_confirmed" ? Number(latest.confirmed_value_inr) : proposed;
    } else {
      if (input.confirmed_value_inr !== undefined && input.confirmed_value_inr !== 0)
        throw new WriteError("confirmed_value_inr applies only to stage partner_confirmed (other stages carry 0, as in the source)");
      confirmed = 0;
    }
    let owner = { owner_id: latest.owner_id as string | null, owner_name: latest.owner_name as string | null };
    if (input.owner_id !== undefined && input.owner_id !== latest.owner_id) owner = await teamMember(tx, input.owner_id);

    if (stage === prevStage && proposed === Number(latest.proposed_value_inr) && confirmed === Number(latest.confirmed_value_inr) && owner.owner_id === latest.owner_id)
      throw new WriteError("Nothing to change: the new version would equal the latest one");

    const effectiveAt = stamp(sim, [ms(latest.effective_at as Date)! + 1000, ms(opp.created_at as Date)], now);
    const historyId = await nextAppId(tx, "opportunity_history", "history_id", "APP-OH-");
    const version = {
      opportunity_name: latest.opportunity_name,
      brand_name: latest.brand_name,
      stage,
      proposed_value_inr: proposed,
      confirmed_value_inr: confirmed,
      owner_name: owner.owner_name,
      effective_at: new Date(effectiveAt),
      history_id: historyId,
      opportunity_id: input.opportunity_id,
      brand_id: latest.brand_id,
      owner_id: owner.owner_id,
      source: "app",
    };
    await tx`insert into opportunity_history ${tx(asRow(version))}`;
    await audit(tx, actor, "opportunity.change", "opportunity_history", historyId, latest, version);

    const result: OpportunityChangeResult = { history_id: historyId, effective_at: effectiveAt, stage, installments: { created: [], voided: [], rescaled: [] } };
    if (opp.support_type !== "cash") return result;

    const live = await tx<Row[]>`
      select * from payment_installments where opportunity_id = ${input.opportunity_id} and voided_at is null
      order by due_at, installment_id`;
    const unpaid = live.filter((p) => p.paid_at === null);
    const paidSum = live.filter((p) => p.paid_at !== null).reduce((a, p) => a + Number(p.amount_paid_inr), 0);

    if (LOST_STAGES.has(stage)) {
      // Lost or withdrawn: void unpaid installments at this version's time; paid ones stay (flagged in the UI).
      for (const p of unpaid) {
        const [after] = await tx<Row[]>`
          update payment_installments set voided_at = ${new Date(effectiveAt)} where installment_id = ${p.installment_id as string} returning *`;
        await audit(tx, actor, "installment.void", "payment_installments", p.installment_id as string, p, after);
        result.installments.voided.push(p.installment_id as string);
      }
      return result;
    }

    if (stage !== "partner_confirmed") return result;
    const remaining = confirmed - paidSum;

    if (prevStage !== "partner_confirmed" && unpaid.length === 0) {
      // Cash deal confirmed with no live unpaid installments: create advance + balance on §2.1 terms
      // for what is not yet paid (N2: a re-confirmed deal is billed for confirmed value − paid).
      if (remaining <= 0) return result;
      for (const plan of installmentTerms(remaining, effectiveAt)) {
        const installmentId = await nextAppId(tx, "payment_installments", "installment_id", "APP-PAY-");
        const row = {
          installment_id: installmentId,
          opportunity_id: input.opportunity_id,
          opportunity_name: latest.opportunity_name,
          brand_id: latest.brand_id,
          brand_name: latest.brand_name,
          installment: plan.installment,
          amount_due_inr: plan.amount_due_inr,
          due_at: new Date(plan.due_at),
          paid_at: null,
          amount_paid_inr: 0,
          source: "app",
          voided_at: null,
        };
        await tx`insert into payment_installments ${tx(asRow(row))}`;
        await audit(tx, actor, "installment.create", "payment_installments", installmentId, null, row);
        result.installments.created.push(installmentId);
      }
      return result;
    }

    // Still (or again) confirmed with unpaid installments: rescale them so all live installments sum to the
    // confirmed value (remaining = value − paid; two unpaid split as §2.1, one takes the remainder; N1: never < 0).
    const amounts = splitRemaining(remaining, unpaid.length);
    for (const [i, p] of unpaid.entries()) {
      if (Number(p.amount_due_inr) === amounts[i]) continue;
      const [after] = await tx<Row[]>`
        update payment_installments set amount_due_inr = ${amounts[i]} where installment_id = ${p.installment_id as string} returning *`;
      await audit(tx, actor, "installment.rescale", "payment_installments", p.installment_id as string, p, after);
      result.installments.rescaled.push(p.installment_id as string);
    }
    return result;
  });
}

