/**
 * SPEC §7 tests/writes.test.ts on the test branch only (fresh reset, simulation date 2025-04-20):
 * (a) confirm an open deal -> 25 partnerships at 20 Apr, 10 Mar snapshot still 15
 * (b) record a payment -> cash collected rises by that amount
 * (c) reset restores the reference numbers
 * (d) confirming a cash deal creates two source='app' installments summing to its confirmed value
 * (e) withdrawing a deal voids its unpaid installments, which leave overdue
 * (f) a payment dated before 12 Apr raises cash_collected_before_festival by its amount
 * plus the other §2.4 rules (stamp rule, append only, audit, rescale, validation, other entities).
 * Tests in this file run in order and share state; (c) runs last.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "../lib/db/client";
import { computeSnapshot, DAY_MS, istAt, istStartOfDay, loadDataset, type Snapshot } from "../lib/engine";
import {
  BALANCE_DUE_DEFAULT,
  changeOpportunity,
  changeQualification,
  changeTargets,
  createOpportunity,
  createTask,
  logInteraction,
  recordPayment,
  updateCampaign,
  updateSettings,
  WriteError,
} from "../lib/writes";
import { NOON_IST, reference as ref, resetTestDb, testSql } from "./helpers";

let sql: Sql;
const snapAt = async (date: string): Promise<Snapshot> => computeSnapshot(await loadDataset(sql), date);
type Row = Record<string, unknown>;
const installments = (opp: string) => sql<Row[]>`select * from payment_installments where opportunity_id = ${opp} order by installment_id`;

beforeAll(async () => {
  sql = testSql();
  await resetTestDb(sql);
});
afterAll(async () => {
  await sql?.end();
});

describe("SPEC §7 writes (a) to (f)", () => {
  let before: Snapshot;
  let confirmedAt: number;

  it("starts from a fresh reset with simulation date 2025-04-20", async () => {
    const [s] = await sql<{ simulation_date: string }[]>`select simulation_date from settings`;
    expect(s.simulation_date).toBe("2025-04-20");
    before = await snapAt("2025-04-20");
    expect(before).toEqual(ref.snapshots["2025-04-20"]);
  });

  it("(a) confirming one open opportunity raises confirmed_partnerships to 25 at 20 Apr and leaves 10 Mar at 15", async () => {
    // O028 Cedar Pantry: cash, negotiating, proposed 110000, latest version 18 Mar.
    const r = await changeOpportunity(sql, { opportunity_id: "O028", stage: "partner_confirmed" }, "user", NOON_IST);
    confirmedAt = r.effective_at;
    expect(r.history_id).toBe("APP-OH-1");
    expect(r.effective_at).toBe(istAt("2025-04-20", 12)); // stamp rule: simulation date at the IST wall clock
    const after = await snapAt("2025-04-20");
    expect(after.confirmed_partnerships).toBe(25);
    expect(after.confirmed_value_cash_inr).toBe(before.confirmed_value_cash_inr + 110000);
    expect(after.open_opportunities).toBe(before.open_opportunities - 1);
    expect(await snapAt("2025-03-10")).toEqual(ref.snapshots["2025-03-10"]);
    expect((await snapAt("2025-03-10")).confirmed_partnerships).toBe(15);
  });

  it("(a) appends a version; source rows are untouched", async () => {
    const rows = await sql<Row[]>`select history_id, stage, confirmed_value_inr, source from opportunity_history where opportunity_id = 'O028' order by effective_at`;
    expect(rows.at(-1)).toEqual({ history_id: "APP-OH-1", stage: "partner_confirmed", confirmed_value_inr: 110000, source: "app" });
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from opportunity_history where source = 'source'`;
    expect(n).toBe(230);
  });

  it("(d) confirming a cash deal creates two source='app' installments that sum to its confirmed value", async () => {
    const rows = await installments("O028");
    expect(rows).toHaveLength(2);
    expect(rows.every((p) => p.source === "app" && p.paid_at === null && p.voided_at === null)).toBe(true);
    expect(rows.reduce((a, p) => a + Number(p.amount_due_inr), 0)).toBe(110000);
    const adv = rows.find((p) => p.installment === "advance")!;
    const bal = rows.find((p) => p.installment === "balance")!;
    expect(adv.amount_due_inr).toBe(55000);
    expect((adv.due_at as Date).getTime()).toBe(confirmedAt + 7 * DAY_MS);
    expect((bal.due_at as Date).getTime()).toBe(Math.max(BALANCE_DUE_DEFAULT, confirmedAt + 7 * DAY_MS));
  });

  it("(b) recording a payment raises cash collected by that amount", async () => {
    const pre = await snapAt("2025-04-20");
    const [adv] = await sql<Row[]>`select installment_id from payment_installments where opportunity_id = 'O028' and installment = 'advance'`;
    const r = await recordPayment(sql, { installment_id: adv.installment_id as string }); // default date = simulation date
    expect(r.paid_at).toBe(istAt("2025-04-20", 15));
    const post = await snapAt("2025-04-20");
    expect(post.cash_collected_inr_simulated).toBe(pre.cash_collected_inr_simulated + 55000);
    expect(post.cash_collected_before_festival_inr_simulated).toBe(pre.cash_collected_before_festival_inr_simulated); // 20 Apr is after the festival
  });

  it("(f) a payment dated before 12 Apr raises cash_collected_before_festival by its amount", async () => {
    // PAY032: O019 balance 47500, unpaid and overdue in the simulated data.
    const pre = await snapAt("2025-04-20");
    const pre0404 = await snapAt("2025-04-04");
    const pre0405 = await snapAt("2025-04-05");
    await recordPayment(sql, { installment_id: "PAY032", payment_date: "2025-04-05" });
    const post = await snapAt("2025-04-20");
    expect(post.cash_collected_before_festival_inr_simulated).toBe(pre.cash_collected_before_festival_inr_simulated + 47500);
    expect(post.cash_collected_inr_simulated).toBe(pre.cash_collected_inr_simulated + 47500);
    expect(post.overdue_installments_simulated).toBe(pre.overdue_installments_simulated - 1);
    expect(post.overdue_amount_inr_simulated).toBe(pre.overdue_amount_inr_simulated - 47500);
    // Snapshots see it from 5 Apr on, not before.
    expect((await snapAt("2025-04-04")).cash_collected_inr_simulated).toBe(pre0404.cash_collected_inr_simulated);
    expect((await snapAt("2025-04-05")).cash_collected_inr_simulated).toBe(pre0405.cash_collected_inr_simulated + 47500);
    const [p] = await sql<Row[]>`select paid_at, amount_paid_inr from payment_installments where installment_id = 'PAY032'`;
    expect((p.paid_at as Date).getTime()).toBe(istAt("2025-04-05", 15));
    expect(p.amount_paid_inr).toBe(47500);
  });

  it("(e) withdrawing a deal voids its unpaid installments, which then leave overdue", async () => {
    // O020: PAY033 + PAY034, both unpaid and overdue.
    const pre = await snapAt("2025-04-20");
    expect(pre.overdue_installments_simulated).toBe(2);
    const r = await changeOpportunity(sql, { opportunity_id: "O020", stage: "withdrawn" }, "user", NOON_IST);
    expect(r.installments.voided.sort()).toEqual(["PAY033", "PAY034"]);
    const rows = await installments("O020");
    expect(rows.every((p) => (p.voided_at as Date).getTime() === r.effective_at)).toBe(true);
    const post = await snapAt("2025-04-20");
    expect(post.overdue_installments_simulated).toBe(0);
    expect(post.overdue_amount_inr_simulated).toBe(0);
    expect(post.confirmed_partnerships).toBe(pre.confirmed_partnerships - 1);
    expect(post.lost_or_withdrawn).toBe(pre.lost_or_withdrawn + 1);
    // Voided on 20 Apr: still overdue in the 31 Mar snapshot (no leaking the future).
    expect((await snapAt("2025-03-31")).overdue_installments_simulated).toBe(ref.snapshots["2025-03-31"].overdue_installments_simulated);
  });
});

describe("SPEC §2.4 rules", () => {
  it("withdrawing a deal keeps paid installments (they are flagged in the UI, not voided)", async () => {
    // O001 Beardo: both installments paid.
    const r = await changeOpportunity(sql, { opportunity_id: "O001", stage: "withdrawn" }, "user", NOON_IST);
    expect(r.installments.voided).toEqual([]);
    const rows = await installments("O001");
    expect(rows.every((p) => p.voided_at === null && p.paid_at !== null)).toBe(true);
  });

  it("stamp rule: a second version of the same entity is strictly later (latest + 1 second)", async () => {
    const r1 = await changeOpportunity(sql, { opportunity_id: "O028", confirmed_value_inr: 100000 }, "user", NOON_IST);
    const r2 = await changeOpportunity(sql, { opportunity_id: "O028", proposed_value_inr: 100000 }, "user", NOON_IST);
    expect(r1.effective_at).toBeGreaterThan(istAt("2025-04-20", 12));
    expect(r2.effective_at).toBe(r1.effective_at + 1000);
    expect(r1.installments.rescaled).toHaveLength(1);
  });

  it("a confirmed value change rescales unpaid installments so all installments sum to the new value", async () => {
    const rows = await installments("O028");
    const paid = rows.filter((p) => p.paid_at !== null);
    const unpaid = rows.filter((p) => p.paid_at === null);
    expect(paid.map((p) => p.amount_due_inr)).toEqual([55000]);
    expect(unpaid.map((p) => p.amount_due_inr)).toEqual([45000]); // 100000 - 55000 paid
    expect((await snapAt("2025-04-20")).outstanding_confirmed_cash_inr_simulated).toBe(
      (await snapAt("2025-04-20")).confirmed_value_cash_inr - (await snapAt("2025-04-20")).cash_collected_inr_simulated,
    );
  });

  it("re-confirming a withdrawn deal bills confirmed value minus paid (N2); voided rows stay voided", async () => {
    const r = await changeOpportunity(sql, { opportunity_id: "O020", stage: "partner_confirmed", confirmed_value_inr: 110000 }, "user", NOON_IST);
    expect(r.installments.created).toHaveLength(2);
    const rows = await installments("O020");
    expect(rows.filter((p) => p.voided_at !== null).map((p) => p.installment_id).sort()).toEqual(["PAY033", "PAY034"]);
    expect(rows.filter((p) => p.voided_at === null).reduce((a, p) => a + Number(p.amount_due_inr), 0)).toBe(110000);
  });

  it("payment validation: date limits, voided and already paid installments are refused", async () => {
    await expect(recordPayment(sql, { installment_id: "PAY033" })).rejects.toThrow(/voided/);
    await expect(recordPayment(sql, { installment_id: "PAY032" })).rejects.toThrow(/already paid/);
    const [unpaid] = await sql<Row[]>`select installment_id from payment_installments where opportunity_id = 'O028' and paid_at is null`;
    await expect(recordPayment(sql, { installment_id: unpaid.installment_id as string, payment_date: "2025-04-21" })).rejects.toThrow(/after the simulation date/);
    await expect(recordPayment(sql, { installment_id: unpaid.installment_id as string, payment_date: "2025-04-19" })).rejects.toThrow(/before the deal's first confirmation/);
    await expect(recordPayment(sql, { installment_id: unpaid.installment_id as string, payment_date: "2025-02-30" })).rejects.toBeInstanceOf(WriteError);
  });

  it("history tables are append only (UPDATE and DELETE are rejected by the database)", async () => {
    await expect(sql`update opportunity_history set stage = 'lost' where history_id = 'OH00025'`).rejects.toThrow(/append only/);
    await expect(sql`delete from brand_qualification_history where history_id = 'BQ0296'`).rejects.toThrow(/append only/);
    await expect(sql`delete from sponsor_interactions where interaction_id = 'SI00634'`).rejects.toThrow(/append only/);
    await expect(sql`update targets set confirmed_partnerships_goal = 1`).rejects.toThrow(/append only/);
  });

  it("qualification change appends APP-BQ-1 and moves qualified_brands", async () => {
    const pre = await snapAt("2025-04-20");
    const [b] = await sql<Row[]>`
      select brand_id from v_qualification_history q
      where effective_at = (select max(effective_at) from v_qualification_history where brand_id = q.brand_id)
        and qualification_status = 'engaged' order by brand_id limit 1`;
    const r = await changeQualification(sql, { brand_id: b.brand_id as string, qualification_status: "qualified", reason: "test" }, "user", NOON_IST);
    expect(r.history_id).toBe("APP-BQ-1");
    expect((await snapAt("2025-04-20")).qualified_brands).toBe(pre.qualified_brands + 1);
    expect((await snapAt("2025-04-11")).qualified_brands).toBe(ref.snapshots["2025-04-11"].qualified_brands);
  });

  it("logging an interaction appends APP-SI-1 and counts at the simulation date", async () => {
    const pre = await snapAt("2025-04-20");
    const [b] = await sql<Row[]>`
      select brand_id from brands where brand_id not in (select brand_id from v_interactions where event_type = 'meeting_held') order by brand_id limit 1`;
    const r = await logInteraction(sql, { brand_id: b.brand_id as string, event_type: "meeting_held", sponsor_campaign_id: "SC02", outcome: "attended" }, "user", NOON_IST);
    expect(r.interaction_id).toBe("APP-SI-1");
    expect((await snapAt("2025-04-20")).conversation_brands).toBe(pre.conversation_brands + 1);
  });

  it("create opportunity with a new brand and contact in one write", async () => {
    const pre = await snapAt("2025-04-20");
    const r = await createOpportunity(
      sql,
      { brand: { new: { brand_name: "Test Brand", industry: "Media" } }, contact: { new: { contact_name: "Test Contact", job_title: "CMO" } }, support_type: "cash", sponsor_campaign_id: "SC02", proposed_value_inr: 50000, owner_id: "T01" },
      "user",
      NOON_IST,
    );
    expect(r).toMatchObject({ opportunity_id: "APP-O-1", brand_id: "APP-A-1", contact_id: "APP-SCON-1" });
    const post = await snapAt("2025-04-20");
    expect(post.opportunities_created).toBe(pre.opportunities_created + 1);
    expect(post.prospects_brands).toBe(pre.prospects_brands + 1);
    expect(post.open_pipeline_proposed_inr).toBe(pre.open_pipeline_proposed_inr + 50000);
    await expect(createOpportunity(sql, { brand: { brand_id: "A001" }, support_type: "cash", sponsor_campaign_id: "SC02", proposed_value_inr: 1, owner_id: "T04" })).rejects.toThrow(/Unknown owner/);
  });

  it("targets form adds a new version in force from the simulation date only", async () => {
    const r = await changeTargets(sql, { qualified_brands_goal: 60, confirmed_partnerships_goal: 30 }, "user", NOON_IST);
    expect(r.target_version).toBe("App plan 1");
    const s = await snapAt("2025-04-20");
    expect([s.qualified_brands_goal, s.confirmed_partnerships_goal, s.target_version]).toEqual([60, 30, "App plan 1"]);
    expect((await snapAt("2025-04-19")).confirmed_partnerships_goal).toBe(28);
  });

  it("campaign status and copilot task are normal writes, audited with the actor", async () => {
    await updateCampaign(sql, "SC01", { status: "paused" }, "copilot");
    const t = await createTask(sql, { title: "Follow up negotiating deals", owner_id: "T01", due_date: "2025-04-25", opportunity_ids: ["O053", "O038"] }, "copilot", NOON_IST);
    expect(t).toMatchObject({ created_by: "copilot", owner_name: "Riya Kapoor", opportunity_ids: ["O053", "O038"] });
    const [c] = await sql<Row[]>`select status from sponsor_campaigns where sponsor_campaign_id = 'SC01'`;
    expect(c.status).toBe("paused");
    const audits = await sql<Row[]>`select actor, action, record_id from audit_log where actor = 'copilot' order by id`;
    expect(audits).toEqual([
      { actor: "copilot", action: "campaign.status", record_id: "SC01" },
      { actor: "copilot", action: "task.create", record_id: t.task_id },
    ]);
  });

  it("every write above is in audit_log", async () => {
    const rows = await sql<{ action: string; n: number }[]>`select action, count(*)::int as n from audit_log group by action order by action`;
    const by = Object.fromEntries(rows.map((r) => [r.action, r.n]));
    expect(by["opportunity.change"]).toBeGreaterThanOrEqual(7);
    expect(by["payment.record"]).toBe(2);
    expect(by["installment.create"]).toBe(4);
    expect(by["installment.void"]).toBe(2);
    expect(by["installment.rescale"]).toBe(1);
    expect(by["qualification.change"]).toBe(1);
    expect(by["interaction.log"]).toBe(1);
    expect(by["targets.change"]).toBe(1);
  });

  it("D1: a confirmed deal moved back to an open stage voids its unpaid installments; paid ones stay", async () => {
    // O028 now: advance 55000 paid, balance 45000 unpaid (after the rescale above).
    const pre = await snapAt("2025-04-20");
    const r = await changeOpportunity(sql, { opportunity_id: "O028", stage: "negotiating" }, "user", NOON_IST);
    expect(r.installments.voided).toHaveLength(1);
    const rows = await installments("O028");
    expect(rows.filter((p) => p.voided_at === null).map((p) => [p.installment, p.paid_at !== null])).toEqual([["advance", true]]);
    const post = await snapAt("2025-04-20");
    expect(post.confirmed_partnerships).toBe(pre.confirmed_partnerships - 1);
    expect(post.cash_collected_inr_simulated).toBe(pre.cash_collected_inr_simulated); // paid cash stays collected
    // Re-confirming bills confirmed value minus what is already paid (N2).
    const again = await changeOpportunity(sql, { opportunity_id: "O028", stage: "partner_confirmed", confirmed_value_inr: 100000 }, "user", NOON_IST);
    expect(again.installments.created).toHaveLength(2);
    const live = (await installments("O028")).filter((p) => p.voided_at === null);
    expect(live.reduce((a, p) => a + Number(p.amount_due_inr), 0)).toBe(100000);
  });

  it("D2: raising the value of a fully paid deal adds one top up installment for the difference", async () => {
    const [deal] = await sql<{ opportunity_id: string }[]>`
      select opportunity_id from payment_installments where source = 'simulated' and opportunity_id not in ('O001', 'O019', 'O020')
      group by opportunity_id having bool_and(paid_at is not null) order by opportunity_id limit 1`;
    const id = deal.opportunity_id;
    const before = await installments(id);
    const total = before.reduce((a, p) => a + Number(p.amount_due_inr), 0);
    const pre = await snapAt("2025-04-20");
    const r = await changeOpportunity(sql, { opportunity_id: id, confirmed_value_inr: total + 20000 }, "user", NOON_IST);
    expect(r.installments.created).toHaveLength(1);
    const [top] = await sql<Row[]>`select * from payment_installments where installment_id = ${r.installments.created[0]}`;
    const balanceDue = (before.find((p) => p.installment === "balance")!.due_at as Date).getTime();
    expect(top).toMatchObject({ installment: "top_up", amount_due_inr: 20000, source: "app", paid_at: null });
    expect((top.due_at as Date).getTime()).toBe(Math.max(balanceDue, r.effective_at + 7 * DAY_MS));
    const post = await snapAt("2025-04-20");
    expect(post.confirmed_value_cash_inr).toBe(pre.confirmed_value_cash_inr + 20000);
    expect(post.outstanding_confirmed_cash_inr_simulated).toBe(pre.outstanding_confirmed_cash_inr_simulated + 20000);
    // Lowering it back rescales the unpaid top up to 0 (never below what is paid, N1) and adds nothing.
    const down = await changeOpportunity(sql, { opportunity_id: id, confirmed_value_inr: total }, "user", NOON_IST);
    expect(down.installments.created).toEqual([]);
    expect(down.installments.rescaled).toEqual(r.installments.created);
    const [topAfter] = await sql<Row[]>`select amount_due_inr from payment_installments where installment_id = ${r.installments.created[0]}`;
    expect(topAfter.amount_due_inr).toBe(0);
  });

  it("settings: simulation date stays inside 15 Jan to 20 Apr 2025", async () => {
    await expect(updateSettings(sql, { simulation_date: "2025-04-21" })).rejects.toThrow(/simulation_date/);
    const s = await updateSettings(sql, { simulation_date: "2025-03-10" });
    expect(s.simulation_date).toBe("2025-03-10");
    // Writes now stamp on 10 Mar, but never before the entity's latest version.
    const r = await changeOpportunity(sql, { opportunity_id: "O053", proposed_value_inr: 95000 }, "user", NOON_IST);
    expect(r.effective_at).toBe(istAt("2025-03-10", 12));
    expect(r.effective_at).toBeGreaterThan(istStartOfDay("2025-02-06"));
  });
});

describe("(c) reset", () => {
  it("restores the reference numbers and clears app rows and the audit log", async () => {
    // Precondition: the writes above moved the numbers (partnerships net back to 24: +O028 -O020 -O001 +O020).
    expect(await snapAt("2025-04-20")).not.toEqual(ref.snapshots["2025-04-20"]);
    await resetTestDb(sql);
    const data = await loadDataset(sql);
    for (const [date, expected] of Object.entries(ref.snapshots)) expect(computeSnapshot(data, date)).toEqual(expected);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from audit_log`;
    expect(n).toBe(0);
    const [{ a }] = await sql<{ a: number }[]>`select (select count(*) from opportunity_history where source = 'app') + (select count(*) from payment_installments where source = 'app') as a`;
    expect(Number(a)).toBe(0);
    expect(data.settings.simulation_date).toBe("2025-04-20");
  }, 180_000); // runs a full reset inside the test; Neon round trips vary
});
