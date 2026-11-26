/**
 * SPEC §7 tests/tools.test.ts: each copilot read tool returns numbers identical to the engine (and so to
 * reference_metrics.json on a fresh reset); query_data runs through DATABASE_URL_READONLY_TEST; propose
 * tools write nothing until confirmed, and Confirm writes through lib/writes with actor copilot.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "../lib/db/client";
import { confirmProposal, rejectProposal } from "../lib/copilot/proposals";
import { executeTool, type ToolContext, TOOLS } from "../lib/copilot/tools";
import {
  budgets,
  byIndustry,
  byOwner,
  campaignDecisions,
  collectionsSummary,
  computeSnapshot,
  type Dataset,
  installmentRows,
  loadDataset,
  pipelineRows,
  stageConversion,
} from "../lib/engine";
import { readonlyTestSql, reference as ref, resetTestDb, testSql } from "./helpers";

let sql: Sql;
let ro: Sql;
let data: Dataset;
const ctx = (): ToolContext => ({ sql, readonlySql: ro });
type Out = Record<string, unknown> & { [k: string]: never | unknown };
async function run(name: string, input: Record<string, unknown> = {}) {
  const r = await executeTool(name, input, ctx());
  return r as { ok: boolean; content: Out };
}

beforeAll(async () => {
  sql = testSql();
  ro = readonlyTestSql();
  await resetTestDb(sql);
  data = await loadDataset(sql);
});
afterAll(async () => {
  await sql?.end();
  await ro?.end();
});

describe("tool definitions", () => {
  it("has exactly the 14 SPEC §6.2 tools with valid names and object schemas", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual(
      ["calculate", "compare_snapshots", "data_dictionary", "get_budgets", "get_campaign_decisions", "get_collections", "get_funnel", "get_opportunity_history", "get_overview", "list_opportunities", "list_tasks", "propose_campaign_status", "propose_task", "query_data"].sort(),
    );
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);
      expect(t.input_schema.type).toBe("object");
      expect(t.description?.length).toBeGreaterThan(40);
    }
  });
});

describe("read tools equal the engine", () => {
  it.each(Object.keys(ref.snapshots))("get_overview(%s) metrics = engine = reference", async (d) => {
    const r = await run("get_overview", { as_of: d });
    expect(r.ok).toBe(true);
    expect(r.content.metrics).toEqual(computeSnapshot(data, d));
    expect(r.content.metrics).toEqual(ref.snapshots[d]);
    expect(r.content.as_of).toBe(d);
  });
  it("get_overview defaults to the simulation date and reports the gap to goal from the engine", async () => {
    const r = await run("get_overview");
    expect(r.content.as_of).toBe("2025-04-20");
    expect(r.content.gap_to_goal).toMatchObject({ confirmed_partnerships_minus_goal: 24 - 28, qualified_brands_minus_goal: 60 - 55 });
    expect((r.content.targets_in_force as { target_version: string }).target_version).toBe("Sponsor revised plan");
  });
  it("get_funnel by campaign and channel group = stageConversion", async () => {
    for (const g of ["campaign", "channel_group"] as const) {
      const r = await run("get_funnel", { group_by: g, as_of: "2025-04-20" });
      const c = stageConversion(data, "2025-04-20");
      const rows = g === "campaign" ? c.byCampaign : c.byGroup;
      expect((r.content.groups as { key: string; counts: unknown; bottleneck: string }[]).map((x) => [x.key, x.counts, x.bottleneck])).toEqual(rows.map((x) => [x.key, x.counts, x.bottleneck]));
    }
  });
  it("get_funnel by owner and industry = by_owner_final / by_industry_final", async () => {
    const o = await run("get_funnel", { group_by: "owner" });
    expect(o.content.groups).toEqual(byOwner(data, "2025-04-20"));
    for (const [k, v] of Object.entries(ref.by_owner_final)) expect((o.content.groups as Record<string, Record<string, number>>)[k]).toMatchObject(v);
    const i = await run("get_funnel", { group_by: "industry" });
    expect(i.content.groups).toEqual(byIndustry(data, "2025-04-20"));
  });
  it("get_funnel for one campaign = campaign snapshot", async () => {
    const r = await run("get_funnel", { campaign_id: "SC02" });
    const steps = r.content.steps as { key: string; value: number }[];
    expect(steps.find((s) => s.key === "confirmed")?.value).toBe(ref.by_campaign_final.SC02.confirmed_partnerships);
  });
  it("compare_snapshots = engine at both dates", async () => {
    const r = await run("compare_snapshots", { date_a: "2025-03-10", date_b: "2025-04-20" });
    expect(r.content.metrics_a).toEqual(ref.snapshots["2025-03-10"]);
    expect(r.content.metrics_b).toEqual(ref.snapshots["2025-04-20"]);
    expect((r.content.change_b_minus_a as Record<string, number>).confirmed_partnerships).toBe(24 - 15);
  });
  it("list_opportunities: stale deals in tie-break order, ties reported (Q04)", async () => {
    const r = await run("list_opportunities", { stale_only: true, limit: 7 });
    const opps = r.content.opportunities as { opportunity_id: string; value_inr: number }[];
    expect(opps.map((o) => o.opportunity_id)).toEqual(["O028", "O053", "O038", "O048", "O058", "O033", "O043"]);
    expect(r.content.total_matching).toBe(26);
    expect(r.content.ties).toEqual([{ value_inr: 90000, value_display: "₹90,000", stage_group: "open", ids: ["O053", "O038", "O048", "O058", "O033", "O043"] }]);
  });
  it("list_opportunities: negotiating filter and limit cut inside a tie is flagged (Q11)", async () => {
    const r = await run("list_opportunities", { stage: "negotiating", limit: 3 });
    expect((r.content.opportunities as { opportunity_id: string }[]).map((o) => o.opportunity_id)).toEqual(["O028", "O053", "O038"]);
    expect(r.content.tie_continues_beyond_limit).toBe(true);
    const all = pipelineRows(data, "2025-04-20").filter((x) => x.stage === "negotiating");
    expect(r.content.total_matching).toBe(all.length);
  });
  it("get_opportunity_history: by id (Cobalt) and by name with two matches (Beardo)", async () => {
    const c = await run("get_opportunity_history", { opportunity_id: "O006" });
    const m = (c.content.matches as { versions: { stage: string; effective_at: string }[] }[])[0];
    expect(m.versions.map((v) => v.stage)).toEqual(["prospecting", "contacted", "proposal_sent", "negotiating", "partner_confirmed", "withdrawn"]);
    expect(m.versions.at(-1)?.effective_at.slice(0, 10)).toBe("2025-03-20");
    const b = await run("get_opportunity_history", { name: "Beardo" });
    expect(b.content.match_count).toBe(2);
  });
  it("get_campaign_decisions = SPEC §5 badges (reference)", async () => {
    for (const d of ["2025-04-20", "2025-03-15"]) {
      const r = await run("get_campaign_decisions", { as_of: d });
      const got = Object.fromEntries((r.content.campaigns as { sponsor_campaign_id: string; badge: string }[]).map((c) => [c.sponsor_campaign_id, c.badge]));
      expect(got).toEqual(d === "2025-04-20" ? ref.decisions_final : ref["decisions_2025-03-15"]);
      expect(got).toEqual(Object.fromEntries(campaignDecisions(data, d).map((c) => [c.sponsor_campaign_id, c.decision.badge])));
    }
  });
  it("get_collections = engine (overdue 3 / ₹1,57,500, collected) and lists overdue first (Q12)", async () => {
    const r = await run("get_collections", { status: "overdue" });
    expect(r.content.totals_by_status).toEqual(collectionsSummary(installmentRows(data, "2025-04-20")));
    expect((r.content.installments as { installment_id: string }[]).map((x) => x.installment_id)).toEqual(["PAY032", "PAY033", "PAY034"]);
    expect(r.content.cash_collected_inr).toBe(ref.snapshots["2025-04-20"].cash_collected_inr_simulated);
    expect(r.content.cash_collected_before_festival_inr).toBe(ref.snapshots["2025-04-20"].cash_collected_before_festival_inr_simulated);
  });
  it("get_budgets = engine budgets; cost per partnership is null when 0 confirmed (Q10)", async () => {
    const r = await run("get_budgets");
    const b = budgets(data, "2025-04-20");
    for (const c of r.content.campaigns as { sponsor_campaign_id: string; planned_budget_inr: number; spend_to_date_inr: number; confirmed_partnerships: number; cost_per_confirmed_partnership_inr: number | null }[]) {
      expect([c.planned_budget_inr, c.spend_to_date_inr]).toEqual([b[c.sponsor_campaign_id].planned, b[c.sponsor_campaign_id].spent]);
      expect([ref.budgets_simulated[c.sponsor_campaign_id].planned, ref.budgets_simulated[c.sponsor_campaign_id].spent_to_2025_04_20]).toEqual([c.planned_budget_inr, c.spend_to_date_inr]);
      if (c.confirmed_partnerships === 0) expect(c.cost_per_confirmed_partnership_inr).toBeNull();
    }
  });
  it("list_tasks returns the six seed tasks with overdue flags at the simulation date", async () => {
    const r = await run("list_tasks");
    expect(r.content.count).toBe(6);
    expect((r.content.tasks as { task_id: string; overdue: boolean }[]).filter((t) => t.overdue).map((t) => t.task_id).sort()).toEqual(["TSK002", "TSK003", "TSK005", "TSK006"]);
  });
  it("data_dictionary lists 14 views, 87 field guide rows and the 8 gaps", async () => {
    const r = await run("data_dictionary");
    expect((r.content.views as unknown[]).length).toBe(14);
    expect((r.content.fieldGuide as unknown[]).length).toBe(87);
    expect((r.content.gaps as unknown[]).length).toBe(8);
  });
});

describe("query_data (DATABASE_URL_READONLY_TEST)", () => {
  it("runs a SELECT on the views as risa_readonly", async () => {
    const r = await run("query_data", { sql: "select count(*)::int as n from v_brands" });
    expect(r.ok).toBe(true);
    expect((r.content.rows as { n: number }[])[0].n).toBe(180);
    const who = await run("query_data", { sql: "select current_user as u from v_event" });
    expect((who.content.rows as { u: string }[])[0].u).toBe("risa_readonly");
  });
  it("adds LIMIT 200 and reports truncation", async () => {
    const r = await run("query_data", { sql: "select interaction_id from v_interactions" });
    expect(r.content.row_count).toBe(200);
    expect(r.content.truncated).toBe(true);
  });
  it("accepts CTEs and FROM inside extract()", async () => {
    const r = await run("query_data", { sql: "with x as (select extract(month from occurred_at at time zone 'Asia/Kolkata') as m from v_interactions) select m, count(*) from x group by m order by m" });
    expect(r.ok).toBe(true);
  });
  it.each([
    ["delete from v_tasks", /only SELECT/],
    ["select 1; select 2", /single statement/],
    ["select * from brands", /only the v_\* views/],
    ["select * from pg_catalog.pg_roles", /system catalogs/],
    ["select * from v_brands -- x", /comments/],
    ["select pg_sleep(5) from v_event", /not allowed/],
    ["with d as (delete from v_tasks returning *) select * from d", /not allowed/],
  ])("rejects %s", async (q, msg) => {
    const r = await run("query_data", { sql: q });
    expect(r.ok).toBe(false);
    expect(String((r.content as { error: string }).error)).toMatch(msg);
  });
  it("the database refuses raw tables even if the text check were bypassed", async () => {
    await expect(ro`select * from brands limit 1`).rejects.toMatchObject({ code: "42501" });
  });
});

describe("calculate", () => {
  it.each([
    ["2000000 - 1842500", 157500],
    ["550000 / 6", 91666.6666666667],
    ["round(550000 / 6)", 91667],
    ["390000 / 4", 97500],
    ["max(10,20)", 20],
  ])("%s = %s", async (e, v) => {
    const r = await run("calculate", { expression: e });
    expect(r.ok).toBe(true);
    expect((r.content as { result: number }).result).toBeCloseTo(v as number, 6);
  });
  it.each(["import('x')", "evaluate('1')", "18,42,500 - 1", "process.exit()", "1/0"])("rejects %s", async (e) => {
    const r = await run("calculate", { expression: e });
    expect(r.ok).toBe(false);
  });
});

describe("propose tools and Confirm", () => {
  it("propose_task validates and writes only a pending proposal", async () => {
    const before = await sql<{ n: number }[]>`select count(*)::int n from tasks`;
    const bad = await run("propose_task", { title: "x", owner_id: "T04", due_date: "2025-04-25" });
    expect(bad.ok).toBe(false);
    const r = await run("propose_task", { title: "Follow up top negotiating deals", owner_id: "T01", due_date: "2025-04-25", opportunity_ids: ["O028", "O053", "O038"] });
    expect(r.ok).toBe(true);
    const p = (r.content as { proposal: { proposal_id: string; status: string } }).proposal;
    expect(p).toMatchObject({ proposal_id: "P-1", status: "pending" });
    const after = await sql<{ n: number }[]>`select count(*)::int n from tasks`;
    expect(after[0].n).toBe(before[0].n);
    const audit = await sql<{ n: number }[]>`select count(*)::int n from audit_log`;
    expect(audit[0].n).toBe(0);
  });
  it("Confirm writes the task as copilot (audit actor copilot) and cannot run twice", async () => {
    const p = await confirmProposal(sql, await loadDataset(sql), "P-1");
    expect(p.status).toBe("confirmed");
    expect(p.result).toMatchObject({ record: "task", owner_name: "Riya Kapoor", due_date: "2025-04-25", opportunity_ids: ["O028", "O053", "O038"] });
    const [task] = await sql<{ created_by: string }[]>`select created_by from tasks where task_id = ${String(p.result?.task_id)}`;
    expect(task.created_by).toBe("copilot");
    const [a] = await sql<{ actor: string; action: string; after: { context: { proposal_id: string } } }[]>`select actor, action, after from audit_log order by id desc limit 1`;
    expect([a.actor, a.action, a.after.context.proposal_id]).toEqual(["copilot", "task.create", "P-1"]);
    await expect(confirmProposal(sql, await loadDataset(sql), "P-1")).rejects.toThrow(/already confirmed/);
  });
  it("propose_campaign_status → Confirm pauses SC01 with the reason in the audit row", async () => {
    const r = await run("propose_campaign_status", { sponsor_campaign_id: "SC01", status: "paused", reason: "STOP badge: 0 confirmed from 11 opportunities" });
    const id = (r.content as { proposal: { proposal_id: string } }).proposal.proposal_id;
    const [c0] = await sql<{ status: string }[]>`select status from sponsor_campaigns where sponsor_campaign_id = 'SC01'`;
    expect(c0.status).toBe("active");
    const p = await confirmProposal(sql, await loadDataset(sql), id);
    expect(p.result).toMatchObject({ status: "paused", previous_status: "active" });
    const [a] = await sql<{ actor: string; action: string; after: { context: { reason: string } } }[]>`select actor, action, after from audit_log order by id desc limit 1`;
    expect([a.actor, a.action]).toEqual(["copilot", "campaign.status"]);
    expect(a.after.context.reason).toMatch(/STOP badge/);
  });
  it("Cancel writes nothing; Confirm with edits uses the edited fields", async () => {
    const r1 = await run("propose_task", { title: "Ask Cobalt owner for the withdrawal reason", owner_id: "T01", due_date: "2025-04-22" });
    const id1 = (r1.content as { proposal: { proposal_id: string } }).proposal.proposal_id;
    const tasksBefore = (await sql<{ n: number }[]>`select count(*)::int n from tasks`)[0].n;
    expect((await rejectProposal(sql, id1)).status).toBe("rejected");
    expect((await sql<{ n: number }[]>`select count(*)::int n from tasks`)[0].n).toBe(tasksBefore);
    const r2 = await run("propose_task", { title: "Chase overdue balances", owner_id: "T02", due_date: "2025-04-22" });
    const id2 = (r2.content as { proposal: { proposal_id: string } }).proposal.proposal_id;
    const p = await confirmProposal(sql, await loadDataset(sql), id2, { owner_id: "T03", due_date: "2025-04-24" });
    expect(p.result).toMatchObject({ owner_name: "Meera Iyer", due_date: "2025-04-24" });
  });
});
