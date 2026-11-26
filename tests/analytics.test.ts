/**
 * Page analytics (SPEC §4) agree with the metric engine at every reference date, so the pages, the
 * engine and (later) the copilot never show two different numbers for the same thing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "../lib/db/client";
import {
  campaignRows,
  CHANNEL_GROUPS,
  collectionsSummary,
  computeSnapshot,
  type Dataset,
  daysToFestival,
  funnel,
  installmentRows,
  loadDataset,
  medianDaysInStage,
  pipelineRows,
  stageConversion,
  staleDeals,
  whatChanged,
} from "../lib/engine";
import { reference as ref, resetTestDb, testSql } from "./helpers";

let sql: Sql;
let data: Dataset;
const DATES = Object.keys(ref.snapshots);

beforeAll(async () => {
  sql = testSql();
  await resetTestDb(sql);
  data = await loadDataset(sql);
});
afterAll(async () => {
  await sql?.end();
});

describe("consistency with the engine at every reference date", () => {
  it.each(DATES)("%s: collections statuses match overdue and collected", (d) => {
    const s = computeSnapshot(data, d);
    const rows = installmentRows(data, d);
    const sum = collectionsSummary(rows);
    expect(sum.overdue.count).toBe(s.overdue_installments_simulated);
    expect(sum.overdue.amount).toBe(s.overdue_amount_inr_simulated);
    expect(sum.paid.amount).toBe(s.cash_collected_inr_simulated);
  });
  it.each(DATES)("%s: pipeline rows, open and stale lists match the snapshot", (d) => {
    const s = computeSnapshot(data, d);
    const rows = pipelineRows(data, d);
    expect(rows).toHaveLength(s.opportunities_created);
    expect(rows.filter((r) => ["prospecting", "contacted", "proposal_sent", "negotiating"].includes(r.stage))).toHaveLength(s.open_opportunities);
    expect(staleDeals(data, d)).toHaveLength(s.stale_open_opportunities_7d);
  });
  it.each(DATES)("%s: funnel equals the snapshot", (d) => {
    const s = computeSnapshot(data, d);
    const f = Object.fromEntries(funnel(s).map((x) => [x.key, x.value]));
    expect(f).toEqual({
      prospects: s.prospects_brands,
      contacted: s.contacted_brands,
      responded: s.responded_brands,
      conversations: s.conversation_brands,
      proposals: s.proposals,
      confirmed: s.confirmed_partnerships,
      cash: s.cash_collected_inr_simulated,
    });
  });
  it.each(DATES)("%s: warm + cold opportunities and confirmed add up to the total", (d) => {
    const s = computeSnapshot(data, d);
    const warm = computeSnapshot(data, d, { campaignIds: CHANNEL_GROUPS.warm });
    const cold = computeSnapshot(data, d, { campaignIds: CHANNEL_GROUPS.cold });
    expect(warm.confirmed_partnerships + cold.confirmed_partnerships).toBe(s.confirmed_partnerships);
    expect(warm.opportunities_created + cold.opportunities_created).toBe(s.opportunities_created);
    expect(warm.confirmed_value_cash_inr + cold.confirmed_value_cash_inr).toBe(s.confirmed_value_cash_inr);
  });
  it("campaign table rows equal the reference campaign metrics at 20 Apr", () => {
    for (const r of campaignRows(data, "2025-04-20"))
      for (const [k, v] of Object.entries(ref.by_campaign_final[r.sponsor_campaign_id])) expect((r.metrics as unknown as Record<string, unknown>)[k]).toEqual(v);
  });
});

describe("Diagnose findings (CONTEXT §3)", () => {
  it("cold channels: 33 opportunities, 0 confirmed at 20 Apr; warm 25 and 24", () => {
    const g = stageConversion(data, "2025-04-20").byGroup;
    const cold = g.find((x) => x.key === "cold")!;
    const warm = g.find((x) => x.key === "warm")!;
    expect([cold.counts.opportunities, cold.counts.confirmed]).toEqual([33, 0]);
    expect([warm.counts.opportunities, warm.counts.confirmed]).toEqual([25, 24]);
    expect(cold.bottleneck).toBe("proposals → confirmed");
  });
  it("Cobalt Learning (cold) is confirmed in the cold group on 10 Mar", () => {
    const cold = stageConversion(data, "2025-03-10").byGroup.find((x) => x.key === "cold")!;
    expect(cold.counts.confirmed).toBe(1);
  });
  it("cold deals spend longer in every open stage", () => {
    for (const m of medianDaysInStage(data, "2025-04-20")) expect(m.cold.median!).toBeGreaterThan(m.warm.median!);
  });
  it("stale list: 26 at 20 Apr, ranked by value, oldest update first, id; the six ₹90,000 deals tie", () => {
    const s = staleDeals(data, "2025-04-20");
    expect(s).toHaveLength(26);
    expect(s[0].id).toBe("O028");
    const ties = s.filter((r) => r.value === 90000);
    expect(ties.map((r) => r.id)).toEqual(["O053", "O038", "O048", "O058", "O033", "O043"]);
    expect(ties.every((r) => r.tie)).toBe(true);
    expect(s[0].tie).toBe(false);
  });
  it("what changed compares D with D - 7", () => {
    const w = whatChanged(data, "2025-03-20");
    expect(w.before).toBe("2025-03-13");
    const row = w.rows.find((r) => r.key === "confirmed_partnerships")!;
    expect(row.after).toBe(19);
    expect(row.delta).toBe(19 - computeSnapshot(data, "2025-03-13").confirmed_partnerships);
  });
  it("days to festival counts IST calendar days to 12 Apr", () => {
    expect(daysToFestival(data, "2025-04-11")).toBe(1);
    expect(daysToFestival(data, "2025-04-12")).toBe(0);
    expect(daysToFestival(data, "2025-04-20")).toBe(-8);
    expect(daysToFestival(data, "2025-01-15")).toBe(87);
  });
  it("collections never list installments of deals confirmed after D", () => {
    const early = installmentRows(data, "2025-02-24");
    const s = computeSnapshot(data, "2025-02-24");
    expect(new Set(early.map((r) => r.opportunity_id)).size).toBeLessThanOrEqual(s.confirmed_partnerships + s.lost_or_withdrawn);
    expect(early.every((r) => (r.first_confirmed_at ?? Infinity) <= Date.parse("2025-02-24T23:59:59.999+05:30"))).toBe(true);
  });
});
