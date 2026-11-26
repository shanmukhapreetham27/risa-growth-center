/**
 * Data dictionary (SPEC §4.7, §6.2 data_dictionary()) and the gaps list (SPEC §6.4).
 * One module so Settings and the Phase 3 copilot tool say the same thing.
 */
import type { Queryable } from "./db/client";

export type Classification = "sourced" | "simulated" | "assumption" | "app";

export const VIEWS: Record<string, { description: string; classification: Classification; table: string }> = {
  v_event: { table: "event", classification: "sourced", description: "Festival name, history window and festival start and end (12 Apr 10:00 to 13 Apr 20:00 IST)." },
  v_targets: { table: "targets", classification: "sourced", description: "Target versions: launch plan (40 qualified, 20 partnerships) and the revised plan from 15 Mar (55, 28); app versions added in Settings." },
  v_brands: { table: "brands", classification: "sourced", description: "Brands (prospects) with industry, owner and created time." },
  v_contacts: { table: "contacts", classification: "sourced", description: "Sponsor contacts per brand." },
  v_campaigns: { table: "sponsor_campaigns", classification: "sourced", description: "The six sponsor campaigns (channel, objective, audience, owner, planned dates) plus the app's status column." },
  v_interactions: { table: "sponsor_interactions", classification: "sourced", description: "Outreach events per brand and campaign (deduplicated on interaction_id: 953 raw rows, 950 unique)." },
  v_qualification_history: { table: "brand_qualification_history", classification: "sourced", description: "Versioned brand qualification status (deduplicated on history_id: 434 raw, 433 unique)." },
  v_opportunities: { table: "opportunities", classification: "sourced", description: "Partner opportunities: brand, contact, originating campaign, cash or in kind." },
  v_opportunity_history: { table: "opportunity_history", classification: "sourced", description: "Versioned stage, proposed and confirmed value and owner (deduplicated on history_id: 230 raw, 228 unique)." },
  v_activations: { table: "sponsor_activations", classification: "sourced", description: "Links between sponsors and attendee campaigns; an association, not proof of incremental visitors." },
  v_payments: { table: "payment_installments", classification: "simulated", description: "Advance and balance installments per confirmed cash deal (fixed seed), app installments and recorded payments." },
  v_budgets: { table: "campaign_budgets", classification: "simulated", description: "Planned budget per campaign." },
  v_spend: { table: "campaign_spend", classification: "simulated", description: "Monthly posted spend per campaign plus entries added in the app." },
  v_tasks: { table: "tasks", classification: "simulated", description: "Six simulated seed tasks plus tasks created by users or the copilot." },
};

export const ASSUMPTIONS = [
  { key: "stage_weights", label: "Stage weights", use: "Weighted open pipeline and the pipeline part of projected cash" },
  { key: "collection_rate", label: "Collection rate", use: "Projected cash before festival (share of unpaid confirmed cash and weighted cash pipeline expected to arrive)" },
  { key: "stale_days", label: "Stale days", use: "An open opportunity is stale when its latest version is older than this" },
  { key: "cash_goal_inr", label: "Team cash goal", use: "Cash collected vs goal on Overview (strategy base case ₹24.46L)" },
] as const;

/** What this data cannot tell you (SPEC §6.4). */
export const GAPS = [
  { gap: "No bank receipts in the source", detail: "Payments and installments are simulated (data/simulated, source = 'simulated')." },
  { gap: "No spend or budget in the source", detail: "Campaign budgets and spend are simulated." },
  { gap: "No loss or withdrawal reasons", detail: "opportunity_history records the stage only; there is no reason field (for example why Cobalt Learning withdrew)." },
  { gap: "No sponsor satisfaction or ROI", detail: "Nothing records how sponsors rated the festival or what return they got." },
  { gap: "Activations do not prove incremental visitors", detail: "sponsor_activations links a sponsor to an attendee campaign; it does not measure footfall caused by the sponsor." },
  { gap: "No contract terms in the source", detail: "Payment terms are the simulated advance and balance rule, not real contracts." },
  { gap: "No data for a next edition or another city", detail: "The dataset covers CampusFest 2025 only (15 Jan to 20 Apr 2025)." },
  { gap: "No footfall per sponsor", detail: "There is no visitor count per sponsor or per activation." },
] as const;

export interface DictionaryColumn {
  view: string;
  column: string;
  data_type: string;
}

export interface FieldGuideRow {
  source_table: string | null;
  field: string | null;
  data_type: string | null;
  meaning: string | null;
}

export async function loadDataDictionary(sql: Queryable) {
  const [columns, fieldGuide] = await Promise.all([
    sql<DictionaryColumn[]>`
      select table_name as view, column_name as column, data_type from information_schema.columns
      where table_schema = 'public' and table_name like 'v\\_%' order by table_name, ordinal_position`,
    sql<FieldGuideRow[]>`select source_table, field, data_type, meaning from field_guide order by ingest_row`,
  ]);
  const byView = new Map<string, DictionaryColumn[]>();
  for (const c of columns) byView.set(c.view, [...(byView.get(c.view) ?? []), c]);
  return {
    views: Object.entries(VIEWS).map(([view, info]) => ({ view, ...info, columns: (byView.get(view) ?? []).map((c) => `${c.column} (${c.data_type})`) })),
    fieldGuide,
    assumptions: ASSUMPTIONS,
    gaps: GAPS,
  };
}
