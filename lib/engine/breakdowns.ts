/**
 * Owner and industry breakdowns, edge cases and budgets: port of the tail of reference_engine.py.
 * Owner = owner_name of the opportunity's latest version; industry = the brand's industry (CONTEXT §5.5).
 */
import { latestBy } from "./snapshot";
import { istEndOfDay } from "./time";
import { type Dataset, LOST_STAGES, OPEN_STAGES, type Stage } from "./types";

export interface GroupStats {
  opportunities: number;
  confirmed: number;
  confirmed_value_inr: number;
  /** Not in the reference; shown on Diagnose. */
  open: number;
  lost_or_withdrawn: number;
}

// L=latest(oh,'opportunity_id',t).merge(brands[['brand_id','industry']],on='brand_id')
function latestAll(data: Dataset, asOf: string) {
  return [...latestBy(data.oppHistory, (h) => h.opportunity_id, istEndOfDay(asOf)).values()];
}

function groupStats<T extends { stage: string; confirmed_value_inr: number }>(rows: T[], key: (r: T) => string | null): Record<string, GroupStats> {
  const out: Record<string, GroupStats> = {};
  for (const r of rows) {
    const k = key(r);
    if (k === null) continue; // pandas groupby drops null keys
    const g = (out[k] ??= { opportunities: 0, confirmed: 0, confirmed_value_inr: 0, open: 0, lost_or_withdrawn: 0 });
    g.opportunities += 1;
    if (OPEN_STAGES.has(r.stage as Stage)) g.open += 1;
    if (LOST_STAGES.has(r.stage as Stage)) g.lost_or_withdrawn += 1;
    if (r.stage === "partner_confirmed") {
      g.confirmed += 1;
      g.confirmed_value_inr += r.confirmed_value_inr;
    }
  }
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
}

// ref['by_owner_final']={o:dict(opportunities=len(g),confirmed=..., confirmed_value_inr=...) for o,g in L.groupby('owner_name')}
export function byOwner(data: Dataset, asOf: string): Record<string, GroupStats> {
  return groupStats(latestAll(data, asOf), (h) => h.owner_name);
}

// ref['by_industry_final']: same, grouped by the brand's industry (inner merge on brand_id)
export function byIndustry(data: Dataset, asOf: string): Record<string, GroupStats> {
  const industry = new Map(data.brands.map((b) => [b.brand_id, b.industry]));
  const rows = latestAll(data, asOf).filter((h) => h.brand_id !== null && industry.has(h.brand_id));
  return groupStats(rows, (h) => industry.get(h.brand_id as string) ?? null);
}

export interface EdgeCases {
  cobalt_learning_O_id: string | null;
  cobalt_confirmed_on_2025_03_10: boolean;
  cobalt_confirmed_on_2025_04_20: boolean;
  beardo_opportunities: number;
}

function confirmedOn(data: Dataset, brandName: string, asOf: string): boolean {
  const L = latestAll(data, asOf).filter((h) => h.brand_name === brandName);
  return L.length > 0 && L[0].stage === "partner_confirmed";
}

/** ref['edge_cases'] except raw_vs_unique, which needs the raw tables (counted in SQL by verify and tests). */
export function edgeCases(data: Dataset): EdgeCases {
  return {
    cobalt_learning_O_id: data.opportunities.find((o) => o.brand_name === "Cobalt Learning")?.opportunity_id ?? null,
    cobalt_confirmed_on_2025_03_10: confirmedOn(data, "Cobalt Learning", "2025-03-10"),
    cobalt_confirmed_on_2025_04_20: confirmedOn(data, "Cobalt Learning", "2025-04-20"),
    beardo_opportunities: data.opportunities.filter((o) => o.brand_name === "Beardo").length,
  };
}

export interface BudgetLine {
  sponsor_campaign_id: string;
  planned: number;
  spent: number;
}

/** Planned budget and posted spend up to the as of date, per campaign (simulated data). */
export function budgets(data: Dataset, asOf: string): Record<string, BudgetLine> {
  const t = istEndOfDay(asOf);
  const out: Record<string, BudgetLine> = {};
  for (const b of data.budgets) {
    const spent = data.spend
      .filter((s) => s.sponsor_campaign_id === b.sponsor_campaign_id && s.spent_at <= t)
      .reduce((a, s) => a + s.amount_inr, 0);
    out[b.sponsor_campaign_id] = { sponsor_campaign_id: b.sponsor_campaign_id, planned: b.planned_budget_inr, spent };
  }
  return out;
}
