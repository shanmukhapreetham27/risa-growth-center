/**
 * Page level analytics (SPEC §4), all pure functions over the same Dataset and as of rules as the
 * metric engine. Nothing here leaks the future: every row is filtered to the as of instant.
 */
import { budgets } from "./breakdowns";
import { campaignDecisions, type Decision } from "./decisions";
import { computeSnapshot, latestBy, type Snapshot } from "./snapshot";
import { addDays, DAY_MS, istDateOf, istEndOfDay } from "./time";
import {
  COLD_CAMPAIGNS,
  type Dataset,
  type Installment,
  LOST_STAGES,
  OPEN_STAGES,
  type OppVersion,
  type Settings,
  type Stage,
  WARM_CAMPAIGNS,
} from "./types";

export type ChannelGroup = "warm" | "cold";
export const CHANNEL_GROUPS: Record<ChannelGroup, readonly string[]> = {
  warm: [...WARM_CAMPAIGNS],
  cold: [...COLD_CAMPAIGNS],
};
export const groupOf = (campaignId: string | null): ChannelGroup | null =>
  campaignId === null ? null : WARM_CAMPAIGNS.has(campaignId) ? "warm" : COLD_CAMPAIGNS.has(campaignId) ? "cold" : null;

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

// ---------------------------------------------------------------- tie break (SPEC §4)
/** Value descending, then oldest last update first, then id. Marks rows whose value equals a neighbour's. */
export function rankByTieBreak<T extends { value: number; last_update: number; id: string }>(rows: readonly T[]): (T & { tie: boolean; rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value || a.last_update - b.last_update || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sorted.map((r, i) => ({
    ...r,
    rank: i + 1,
    tie: (i > 0 && sorted[i - 1].value === r.value) || (i < sorted.length - 1 && sorted[i + 1].value === r.value),
  }));
}

export type StageGroup = "open" | "confirmed" | "closed";
export const STAGE_GROUP_ORDER: readonly StageGroup[] = ["open", "confirmed", "closed"];
export const stageGroupOf = (s: Stage): StageGroup => (OPEN_STAGES.has(s) ? "open" : s === "partner_confirmed" ? "confirmed" : "closed");

/**
 * Pipeline order (REVIEWER NOTE 05 U4): open deals first, then confirmed, then lost or withdrawn; inside
 * each group the §4 tie break. Ranks run 1..n across groups; ties are only marked inside a group.
 */
export function rankGrouped<T extends { value: number; last_update: number; id: string; stage: Stage }>(rows: readonly T[]): (T & { tie: boolean; rank: number; stage_group: StageGroup })[] {
  const out: (T & { tie: boolean; rank: number; stage_group: StageGroup })[] = [];
  for (const g of STAGE_GROUP_ORDER)
    for (const r of rankByTieBreak(rows.filter((x) => stageGroupOf(x.stage) === g))) out.push({ ...r, rank: out.length + 1, stage_group: g });
  return out;
}

// ---------------------------------------------------------------- funnel (§4.1)
export interface FunnelStep {
  key: string;
  label: string;
  unit: "brands" | "opportunities" | "inr";
  value: number;
  /** Conversion from the previous step (for cash: collected / confirmed cash). */
  conversion: number | null;
}

export function funnel(s: Snapshot): FunnelStep[] {
  const steps: Omit<FunnelStep, "conversion">[] = [
    { key: "prospects", label: "Prospects", unit: "brands", value: s.prospects_brands },
    { key: "contacted", label: "Contacted", unit: "brands", value: s.contacted_brands },
    { key: "responded", label: "Responded", unit: "brands", value: s.responded_brands },
    { key: "conversations", label: "Conversations", unit: "brands", value: s.conversation_brands },
    { key: "proposals", label: "Proposals", unit: "opportunities", value: s.proposals },
    { key: "confirmed", label: "Confirmed", unit: "opportunities", value: s.confirmed_partnerships },
  ];
  const out: FunnelStep[] = steps.map((x, i) => ({ ...x, conversion: i === 0 ? null : ratio(x.value, steps[i - 1].value) }));
  out.push({
    key: "cash",
    label: "Cash collected",
    unit: "inr",
    value: s.cash_collected_inr_simulated,
    conversion: ratio(s.cash_collected_inr_simulated, s.confirmed_value_cash_inr),
  });
  return out;
}

// ---------------------------------------------------------------- stage conversion and bottleneck (§4.2)
export interface ConversionRow {
  key: string;
  label: string;
  counts: { contacted: number; responded: number; conversations: number; opportunities: number; proposals: number; confirmed: number };
  steps: { from: string; to: string; rate: number | null }[];
  /** Step with the lowest conversion (largest drop). */
  bottleneck: string | null;
}

const STEP_KEYS = [
  ["contacted", "responded"],
  ["responded", "conversations"],
  ["conversations", "opportunities"],
  ["opportunities", "proposals"],
  ["proposals", "confirmed"],
] as const;

function conversionRow(key: string, label: string, s: Snapshot): ConversionRow {
  const counts = {
    contacted: s.contacted_brands,
    responded: s.responded_brands,
    conversations: s.conversation_brands,
    opportunities: s.opportunities_created,
    proposals: s.proposals,
    confirmed: s.confirmed_partnerships,
  };
  const steps = STEP_KEYS.map(([a, b]) => ({ from: a, to: b, rate: ratio(counts[b], counts[a]) }));
  let bottleneck: string | null = null;
  let low = Infinity;
  for (const st of steps) if (st.rate !== null && st.rate < low) {
    low = st.rate;
    bottleneck = `${st.from} → ${st.to}`;
  }
  return { key, label, counts, steps, bottleneck };
}

export function stageConversion(data: Dataset, asOf: string, settings?: Partial<Settings>) {
  return {
    byCampaign: data.campaigns.map((c) =>
      conversionRow(c.sponsor_campaign_id, c.campaign_name, computeSnapshot(data, asOf, { campaignId: c.sponsor_campaign_id, settings })),
    ),
    byGroup: (["warm", "cold"] as const).map((g) =>
      conversionRow(g, g === "warm" ? "Warm (SC02, SC04, SC05)" : "Cold (SC01, SC03, SC06)", computeSnapshot(data, asOf, { campaignIds: CHANNEL_GROUPS[g], settings })),
    ),
  };
}

// ---------------------------------------------------------------- opportunities at D (§4.4, stale list §4.2)
export interface PipelineRow {
  id: string;
  opportunity_name: string;
  brand_id: string;
  brand_name: string | null;
  stage: Stage;
  proposed_value_inr: number;
  confirmed_value_inr: number;
  /** Value used for ranking: confirmed value for confirmed deals, proposed value otherwise. */
  value: number;
  support_type: "cash" | "in_kind";
  owner_id: string | null;
  owner_name: string | null;
  sponsor_campaign_id: string | null;
  campaign_name: string | null;
  group: ChannelGroup | null;
  last_update: number;
  days_since_update: number;
  stale: boolean;
  later_versions: number;
  source: string;
}

export function pipelineRows(data: Dataset, asOf: string, settings?: Partial<Settings>): (PipelineRow & { tie: boolean; rank: number; stage_group: StageGroup })[] {
  const s = { ...data.settings, ...settings };
  const t = istEndOfDay(asOf);
  const campaigns = new Map(data.campaigns.map((c) => [c.sponsor_campaign_id, c.campaign_name]));
  const opps = new Map(data.opportunities.filter((o) => o.created_at <= t).map((o) => [o.opportunity_id, o]));
  const latest = latestBy(data.oppHistory.filter((h) => opps.has(h.opportunity_id)), (h) => h.opportunity_id, t);
  const later = new Map<string, number>();
  for (const h of data.oppHistory) if (h.effective_at > t) later.set(h.opportunity_id, (later.get(h.opportunity_id) ?? 0) + 1);
  const rows: PipelineRow[] = [];
  for (const [id, h] of latest) {
    const o = opps.get(id)!;
    rows.push({
      id,
      opportunity_name: o.opportunity_name,
      brand_id: o.brand_id,
      brand_name: o.brand_name,
      stage: h.stage,
      proposed_value_inr: h.proposed_value_inr,
      confirmed_value_inr: h.confirmed_value_inr,
      value: h.stage === "partner_confirmed" ? h.confirmed_value_inr : h.proposed_value_inr,
      support_type: o.support_type,
      owner_id: h.owner_id,
      owner_name: h.owner_name,
      sponsor_campaign_id: o.sponsor_campaign_id,
      campaign_name: o.sponsor_campaign_id ? campaigns.get(o.sponsor_campaign_id) ?? null : null,
      group: groupOf(o.sponsor_campaign_id),
      last_update: h.effective_at,
      days_since_update: Math.floor((t - h.effective_at) / DAY_MS),
      stale: OPEN_STAGES.has(h.stage) && t - h.effective_at > s.stale_days * DAY_MS,
      later_versions: later.get(id) ?? 0,
      source: o.source,
    });
  }
  return rankGrouped(rows);
}

/** Open opportunities with no update in more than stale_days, ranked by the §4 tie break (stale list, §4.2). */
export function staleDeals(data: Dataset, asOf: string, settings?: Partial<Settings>) {
  return rankByTieBreak(pipelineRows(data, asOf, settings).filter((r) => r.stale));
}

// ---------------------------------------------------------------- median days in stage (§4.2)
export interface MedianRow {
  stage: Stage;
  warm: { median: number | null; n: number };
  cold: { median: number | null; n: number };
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Days spent in each open stage, for stage spans that ended on or before D (time from first entering
 * the stage to the next version with a different stage). Consecutive versions in one stage are one span.
 */
export function medianDaysInStage(data: Dataset, asOf: string): MedianRow[] {
  const t = istEndOfDay(asOf);
  const camp = new Map(data.opportunities.filter((o) => o.created_at <= t).map((o) => [o.opportunity_id, o.sponsor_campaign_id]));
  const byOpp = new Map<string, OppVersion[]>();
  for (const h of data.oppHistory) {
    if (h.effective_at > t || !camp.has(h.opportunity_id)) continue;
    const list = byOpp.get(h.opportunity_id) ?? [];
    list.push(h);
    byOpp.set(h.opportunity_id, list);
  }
  const spans: Record<ChannelGroup, Map<Stage, number[]>> = { warm: new Map(), cold: new Map() };
  for (const [id, versions] of byOpp) {
    const g = groupOf(camp.get(id) ?? null);
    if (!g) continue;
    versions.sort((a, b) => a.effective_at - b.effective_at || (a.history_id < b.history_id ? -1 : 1));
    for (let i = 0; i < versions.length; i++) {
      if (i > 0 && versions[i - 1].stage === versions[i].stage) continue; // same span
      const start = versions[i];
      const next = versions.slice(i + 1).find((v) => v.stage !== start.stage);
      if (!next || !OPEN_STAGES.has(start.stage)) continue;
      const list = spans[g].get(start.stage) ?? [];
      list.push((next.effective_at - start.effective_at) / DAY_MS);
      spans[g].set(start.stage, list);
    }
  }
  return (["prospecting", "contacted", "proposal_sent", "negotiating"] as Stage[]).map((stage) => ({
    stage,
    warm: { median: median(spans.warm.get(stage) ?? []), n: spans.warm.get(stage)?.length ?? 0 },
    cold: { median: median(spans.cold.get(stage) ?? []), n: spans.cold.get(stage)?.length ?? 0 },
  }));
}

// ---------------------------------------------------------------- what changed (§4.2)
export const CHANGE_METRICS = [
  ["confirmed_partnerships", "Confirmed partnerships"],
  ["qualified_brands", "Qualified brands"],
  ["conversation_brands", "Conversations (brands)"],
  ["proposals", "Proposals"],
  ["open_opportunities", "Open opportunities"],
  ["stale_open_opportunities_7d", "Stale open opportunities"],
  ["open_pipeline_proposed_inr", "Open pipeline (proposed)"],
  ["weighted_open_pipeline_inr", "Weighted open pipeline"],
  ["confirmed_value_cash_inr", "Confirmed cash value"],
  ["cash_collected_inr_simulated", "Cash collected"],
  ["projected_cash_before_festival_inr", "Projected cash before festival"],
] as const;

export function whatChanged(data: Dataset, asOf: string, settings?: Partial<Settings>) {
  const before = addDays(asOf, -7);
  const a = computeSnapshot(data, before, { settings }) as unknown as Record<string, number>;
  const b = computeSnapshot(data, asOf, { settings }) as unknown as Record<string, number>;
  return {
    before,
    after: asOf,
    rows: CHANGE_METRICS.map(([key, label]) => ({ key, label, before: a[key], after: b[key], delta: b[key] - a[key] })),
  };
}

// ---------------------------------------------------------------- collections (§4.5)
export type InstallmentStatus = "paid" | "due" | "overdue" | "upcoming" | "voided";

export interface InstallmentRow extends Installment {
  status: InstallmentStatus;
  stage_at_d: Stage | null;
  first_confirmed_at: number | null;
  flags: string[];
}

/**
 * Status at D (N4): voided if voided on or before D; paid if paid on or before D; overdue if due on or
 * before D; due if due within the 7 days after D; upcoming otherwise. Only installments of deals first
 * confirmed on or before D are listed (no leaking the future).
 */
export function installmentRows(data: Dataset, asOf: string): InstallmentRow[] {
  const t = istEndOfDay(asOf);
  const latest = latestBy(data.oppHistory, (h) => h.opportunity_id, t);
  const firstConf = new Map<string, number>();
  for (const h of data.oppHistory)
    if (h.stage === "partner_confirmed" && (!firstConf.has(h.opportunity_id) || h.effective_at < firstConf.get(h.opportunity_id)!))
      firstConf.set(h.opportunity_id, h.effective_at);
  const paidByDeal = new Map<string, number>();
  for (const p of data.payments) if (p.paid_at !== null && p.paid_at <= t) paidByDeal.set(p.opportunity_id, (paidByDeal.get(p.opportunity_id) ?? 0) + p.amount_paid_inr);

  const rows: InstallmentRow[] = [];
  for (const p of data.payments) {
    const fc = firstConf.get(p.opportunity_id) ?? null;
    if (fc === null || fc > t) continue;
    const stage = latest.get(p.opportunity_id)?.stage ?? null;
    let status: InstallmentStatus;
    if (p.voided_at !== null && p.voided_at <= t) status = "voided";
    else if (p.paid_at !== null && p.paid_at <= t) status = "paid";
    else if (p.due_at <= t) status = "overdue";
    else if (p.due_at <= t + 7 * DAY_MS) status = "due";
    else status = "upcoming";
    const flags: string[] = [];
    if (status === "paid" && stage && LOST_STAGES.has(stage)) flags.push("paid on a withdrawn deal");
    else if (status === "paid" && stage && OPEN_STAGES.has(stage)) flags.push("paid on a deal no longer confirmed");
    const conf = latest.get(p.opportunity_id);
    if (conf?.stage === "partner_confirmed" && (paidByDeal.get(p.opportunity_id) ?? 0) > conf.confirmed_value_inr) flags.push("paid exceeds confirmed value");
    rows.push({ ...p, status, stage_at_d: stage, first_confirmed_at: fc, flags });
  }
  const order: Record<InstallmentStatus, number> = { overdue: 0, due: 1, upcoming: 2, paid: 3, voided: 4 };
  return rows.sort((a, b) => order[a.status] - order[b.status] || a.due_at - b.due_at || (a.installment_id < b.installment_id ? -1 : 1));
}

export function collectionsSummary(rows: InstallmentRow[]) {
  const out: Record<InstallmentStatus, { count: number; amount: number }> = {
    paid: { count: 0, amount: 0 }, due: { count: 0, amount: 0 }, overdue: { count: 0, amount: 0 }, upcoming: { count: 0, amount: 0 }, voided: { count: 0, amount: 0 },
  };
  for (const r of rows) {
    out[r.status].count += 1;
    out[r.status].amount += r.status === "paid" ? r.amount_paid_inr : r.amount_due_inr;
  }
  return out;
}

/** Earliest allowed payment date for a deal (D5): the IST date of its first confirmation. */
export const firstConfirmationDate = (row: InstallmentRow) => (row.first_confirmed_at === null ? null : istDateOf(row.first_confirmed_at));

// ---------------------------------------------------------------- campaign table (§4.1, §4.3)
export interface CampaignRow {
  sponsor_campaign_id: string;
  campaign_name: string;
  status: string;
  metrics: Snapshot;
  decision: Decision;
  meeting_rate: number | null;
  win_rate: number | null;
  budget: number | null;
  spend: number;
  cash_per_rupee_spent: number | null;
}

/** cash per ₹ spent = cash collected on the campaign's deals (simulated) / posted spend up to D (simulated). */
export function campaignRows(data: Dataset, asOf: string, settings?: Partial<Settings>): CampaignRow[] {
  const b = budgets(data, asOf);
  const camp = new Map(data.campaigns.map((c) => [c.sponsor_campaign_id, c]));
  return campaignDecisions(data, asOf, settings).map((d) => {
    const m = d.metrics;
    const closed = m.confirmed_partnerships + m.lost_or_withdrawn;
    const spend = b[d.sponsor_campaign_id]?.spent ?? 0;
    return {
      sponsor_campaign_id: d.sponsor_campaign_id,
      campaign_name: d.campaign_name,
      status: camp.get(d.sponsor_campaign_id)?.status ?? "active",
      metrics: m,
      decision: d.decision,
      meeting_rate: ratio(m.conversation_brands, m.contacted_brands),
      win_rate: ratio(m.confirmed_partnerships, closed),
      budget: b[d.sponsor_campaign_id]?.planned ?? null,
      spend,
      cash_per_rupee_spent: ratio(m.cash_collected_inr_simulated, spend),
    };
  });
}

/** Whole days from D to the festival start date (both IST dates); negative after it started. */
export function daysToFestival(data: Dataset, asOf: string): number {
  const fest = istDateOf(data.event.event_starts_at);
  return Math.round((Date.parse(`${fest}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / DAY_MS);
}
