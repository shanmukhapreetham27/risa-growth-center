/**
 * Record a payment (SPEC §2.4, D5): full installment amount; the user picks the payment date
 * (default: simulation date), which must be on or before the simulation date and on or after the
 * date of the deal's first confirmation; paid_at = that date 15:00 IST. The only write that does not
 * use the stamp rule. A voided installment cannot be paid (N3).
 */
import type { Sql } from "../db/client";
import { istAt, istDateOf, isIsoDate } from "../engine/time";
import { type Actor, audit, lockWrites, ms, simulationDate, WriteError } from "./common";

export interface RecordPaymentInput {
  installment_id: string;
  /** 'YYYY-MM-DD'; default = simulation date. */
  payment_date?: string;
}

export interface RecordPaymentResult {
  installment_id: string;
  paid_at: number;
  amount_paid_inr: number;
}

export async function recordPayment(sql: Sql, input: RecordPaymentInput, actor: Actor = "user"): Promise<RecordPaymentResult> {
  return sql.begin(async (tx) => {
    await lockWrites(tx);
    const sim = await simulationDate(tx);
    const [inst] = await tx<Record<string, unknown>[]>`select * from payment_installments where installment_id = ${input.installment_id}`;
    if (!inst) throw new WriteError(`Installment ${input.installment_id} does not exist`);
    if (inst.paid_at !== null) throw new WriteError(`Installment ${input.installment_id} is already paid`);
    if (inst.voided_at !== null) throw new WriteError(`Installment ${input.installment_id} is voided (deal lost or withdrawn); re-confirm the deal first`);

    const date = input.payment_date ?? sim;
    if (!isIsoDate(date)) throw new WriteError(`payment_date "${date}" is not a YYYY-MM-DD date`);
    if (date > sim) throw new WriteError(`Payment date ${date} is after the simulation date ${sim}`);
    const [fc] = await tx<{ first: Date | null }[]>`
      select min(effective_at) as first from v_opportunity_history
      where opportunity_id = ${inst.opportunity_id as string} and stage = 'partner_confirmed'`;
    const firstConfirmed = ms(fc?.first ?? null);
    if (firstConfirmed === null) throw new WriteError(`Deal ${inst.opportunity_id} was never confirmed`);
    const firstDate = istDateOf(firstConfirmed);
    if (date < firstDate) throw new WriteError(`Payment date ${date} is before the deal's first confirmation on ${firstDate}`);

    const paidAt = istAt(date, 15);
    const [after] = await tx<Record<string, unknown>[]>`
      update payment_installments set paid_at = ${new Date(paidAt)}, amount_paid_inr = amount_due_inr
      where installment_id = ${input.installment_id} returning *`;
    await audit(tx, actor, "payment.record", "payment_installments", input.installment_id, inst, after);
    return { installment_id: input.installment_id, paid_at: paidAt, amount_paid_inr: Number(after.amount_paid_inr) };
  });
}
