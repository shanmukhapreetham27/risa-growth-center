/**
 * SPEC §7 tests/metrics.test.ts: on a freshly reset test branch, every metric in reference_metrics.json
 * equals the engine's value exactly (snapshots at every reference date, both campaign tables, owner,
 * industry, edge cases, budgets and decisions). Expected values are read from the file, never edited.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "../lib/db/client";
import { rawVsUnique } from "../lib/db/stats";
import {
  budgets,
  byIndustry,
  byOwner,
  campaignDecisions,
  computeSnapshot,
  type Dataset,
  dateRange,
  edgeCases,
  loadDataset,
  type Snapshot,
} from "../lib/engine";
import { reference as ref, resetTestDb, testSql } from "./helpers";

let sql: Sql;
let data: Dataset;
let raw: Awaited<ReturnType<typeof rawVsUnique>>;
const memo = new Map<string, Snapshot>();
const snap = (date: string, campaignId?: string) => {
  const k = `${date}|${campaignId ?? ""}`;
  if (!memo.has(k)) memo.set(k, computeSnapshot(data, date, { campaignId }));
  return memo.get(k)! as unknown as Record<string, unknown>;
};

beforeAll(async () => {
  sql = testSql();
  await resetTestDb(sql);
  data = await loadDataset(sql);
  raw = await rawVsUnique(sql);
});
afterAll(async () => {
  await sql?.end();
});

describe("runtime", () => {
  it("runs with TZ=UTC (the engine must not depend on the machine time zone)", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("UTC");
    expect(new Date(0).getTimezoneOffset()).toBe(0);
  });
  it("uses the reference assumptions after reset", () => {
    expect(data.settings.stage_weights).toEqual(ref.assumptions.stage_weights);
    expect(data.settings.collection_rate).toBe(ref.assumptions.collection_rate);
    expect(data.settings.stale_days).toBe(ref.assumptions.stale_days);
    expect(data.event.event_starts_at).toBe(Date.parse("2025-04-12T10:00:00+05:30"));
  });
});

const flat = <T>(o: Record<string, Record<string, T>>) =>
  Object.entries(o).flatMap(([a, m]) => Object.entries(m).map(([k, v]) => [a, k, v] as [string, string, T]));

describe("snapshots (every metric, every reference date)", () => {
  it.each(flat(ref.snapshots))("%s %s = %j", (date, metric, expected) => {
    expect(snap(date)[metric]).toEqual(expected);
  });
});

describe("by_campaign_final (2025-04-20)", () => {
  it.each(flat(ref.by_campaign_final))("%s %s = %j", (c, metric, expected) => {
    expect(snap("2025-04-20", c)[metric]).toEqual(expected);
  });
});

describe("by_campaign_2025-03-15", () => {
  it.each(flat(ref["by_campaign_2025-03-15"]))("%s %s = %j", (c, metric, expected) => {
    expect(snap("2025-03-15", c)[metric]).toEqual(expected);
  });
});

describe("by_owner_final", () => {
  it("has exactly the reference owners", () => {
    expect(Object.keys(byOwner(data, "2025-04-20")).sort()).toEqual(Object.keys(ref.by_owner_final).sort());
  });
  it.each(flat(ref.by_owner_final))("%s %s = %j", (owner, field, expected) => {
    expect(byOwner(data, "2025-04-20")[owner]?.[field as "opportunities"]).toEqual(expected);
  });
});

describe("by_industry_final", () => {
  it("has exactly the reference industries", () => {
    expect(Object.keys(byIndustry(data, "2025-04-20")).sort()).toEqual(Object.keys(ref.by_industry_final).sort());
  });
  it.each(flat(ref.by_industry_final))("%s %s = %j", (industry, field, expected) => {
    expect(byIndustry(data, "2025-04-20")[industry]?.[field as "opportunities"]).toEqual(expected);
  });
});

describe("edge_cases", () => {
  const { raw_vs_unique, ...rest } = ref.edge_cases;
  it.each(Object.entries(rest))("%s = %j", (k, expected) => {
    expect((edgeCases(data) as unknown as Record<string, unknown>)[k]).toEqual(expected);
  });
  it.each(Object.entries(raw_vs_unique))("raw_vs_unique %s = %j", (k, expected) => {
    expect(raw[k as keyof typeof raw]).toEqual(expected);
  });
});

describe("budgets_simulated", () => {
  it.each(Object.entries(ref.budgets_simulated))("%s = %j", (c, expected) => {
    const b = budgets(data, "2025-04-20")[c];
    expect({ planned: b.planned, spent_to_2025_04_20: b.spent }).toEqual(expected);
  });
});

describe("decisions (SPEC §5)", () => {
  it.each(Object.entries(ref.decisions_final))("2025-04-20 %s = %s", (c, expected) => {
    expect(campaignDecisions(data, "2025-04-20").find((d) => d.sponsor_campaign_id === c)?.decision.badge).toBe(expected);
  });
  it.each(Object.entries(ref["decisions_2025-03-15"]))("2025-03-15 %s = %s", (c, expected) => {
    expect(campaignDecisions(data, "2025-03-15").find((d) => d.sponsor_campaign_id === c)?.decision.badge).toBe(expected);
  });
  it("names the rule that fired and gives CHANGE reasons", () => {
    const d = campaignDecisions(data, "2025-04-20");
    for (const x of d) expect(x.decision.rule).toMatch(new RegExp(`^Rule \\d ${x.decision.badge}`));
    for (const x of d.filter((y) => y.decision.badge === "CHANGE")) expect(x.decision.reasons.length).toBeGreaterThan(0);
  });
});

describe("traps (SPEC §3)", () => {
  it("Cobalt Learning counts on 10 Mar, not on 20 Apr", () => {
    expect(snap("2025-03-10").confirmed_partnerships).toBe(15);
    const cobalt = (date: string) => computeSnapshot(data, date, { campaignId: "SC03" }).confirmed_partnerships;
    expect(cobalt("2025-03-10")).toBe(1);
    expect(cobalt("2025-04-20")).toBe(0);
  });
  it("Beardo: partnerships counted by opportunity, brands separately", () => {
    expect(data.opportunities.filter((o) => o.brand_name === "Beardo")).toHaveLength(2);
    expect(snap("2025-04-20").confirmed_partnerships).toBe(24);
    expect(snap("2025-04-20").confirmed_brands).toBe(24);
  });
  it("in kind value is not cash", () => {
    const s = snap("2025-04-20");
    expect(s.confirmed_value_total_inr).toBe((s.confirmed_value_cash_inr as number) + (s.confirmed_value_in_kind_inr as number));
    expect(s.confirmed_value_in_kind_inr).toBe(240000);
  });
  it("target change on 15 Mar (launch plan before, revised plan from 09:00 IST that day)", () => {
    expect(snap("2025-03-14").confirmed_partnerships_goal).toBe(20);
    expect(snap("2025-03-15").confirmed_partnerships_goal).toBe(28);
  });
  it("daily series from 15 Jan to 20 Apr computes for every day without leaking the future", () => {
    const days = dateRange("2025-01-15", "2025-04-20");
    expect(days).toHaveLength(96);
    let prevCreated = 0;
    for (const d of days) {
      const s = computeSnapshot(data, d);
      expect(s.opportunities_created).toBeGreaterThanOrEqual(prevCreated);
      prevCreated = s.opportunities_created;
    }
  });
});
