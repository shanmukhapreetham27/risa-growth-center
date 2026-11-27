/**
 * Copilot tools (SPEC §6.2). Every read tool calls the same engine and analytics functions as the pages
 * (lib/engine), so a number in an answer equals the number on screen. All reads take an optional as_of
 * (default: the simulation date) and return it, with the origin of each figure (sourced, simulated,
 * assumption). Propose tools only create a pending proposal (lib/copilot/proposals.ts).
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Sql } from "../db/client";
import { loadDataDictionary } from "../dictionary";
import {
  budgets,
  byIndustry,
  byOwner,
  campaignRows,
  collectionsSummary,
  computeSnapshot,
  type Dataset,
  funnel,
  installmentRows,
  isIsoDate,
  istDateOf,
  istEndOfDay,
  latestBy,
  loadDataset,
  pipelineRows,
  stageConversion,
  DAY_MS,
  STAGES,
  targetInForce,
  toIstIso,
} from "../engine";
import { inr } from "../format";
import { WriteError } from "../writes";
import { calculate } from "./calculate";
import { buildRecordIndex, type RecordIndex } from "./ids";
import { createProposal, validateCampaignStatusPayload, validateTaskPayload } from "./proposals";
import { QueryRejected, queryData } from "./query-data";

export interface ToolContext {
  /** Owner-role client (app pool, or the test branch in tests and eval). */
  sql: Sql;
  /** risa_readonly client for query_data. */
  readonlySql: Sql;
  /** Loaded once per chat request, reloaded after a proposal is created. */
  data?: Dataset;
}

const asOfProp = { as_of: { type: "string", description: "Date YYYY-MM-DD (end of that day IST). Default: the app's simulation date." } } as const;

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_overview",
    description:
      "All whole-festival metrics at a date: prospects, contacted, responded, conversations, qualified brands, opportunities, proposals, confirmed partnerships and brands, confirmed value (cash, in kind, total), lost or withdrawn, open pipeline and weighted pipeline, stale open opportunities, cash collected (total and before the festival), outstanding confirmed cash, overdue installments, projected cash before the festival, and the targets in force (version and goals). Also returns the simulation date, the assumptions used and the gap to each goal. Start here for any headline number.",
    input_schema: { type: "object", properties: { ...asOfProp }, additionalProperties: false },
  },
  {
    name: "get_funnel",
    description:
      "Funnel and stage conversion. Without group_by: whole funnel (or one campaign with campaign_id) with step conversions. group_by campaign or channel_group: counts contacted, responded, conversations, opportunities, proposals, confirmed per group with conversion rates and the bottleneck (lowest conversion). Channel groups: warm = SC02, SC04, SC05; cold = SC01, SC03, SC06. group_by owner or industry: opportunities, open, confirmed, lost or withdrawn and confirmed value (cash + in kind) per owner (owner of the latest version) or brand industry.",
    input_schema: {
      type: "object",
      properties: {
        ...asOfProp,
        group_by: { type: "string", enum: ["campaign", "channel_group", "owner", "industry"] },
        campaign_id: { type: "string", description: "Sponsor campaign id, e.g. SC01" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "compare_snapshots",
    description: "All overview metrics at two dates and the change (date_b minus date_a) for each. Use for 'what changed', week over week, or before and after an event.",
    input_schema: {
      type: "object",
      properties: { date_a: { type: "string", description: "YYYY-MM-DD" }, date_b: { type: "string", description: "YYYY-MM-DD" } },
      required: ["date_a", "date_b"],
      additionalProperties: false,
    },
  },
  {
    name: "list_opportunities",
    description:
      "Opportunities at a date (latest version of each), with stage, proposed and confirmed value, owner, campaign, last update, days since update and stale flag. Returns every matching row (up to 200) plus total_matching, returned, truncated and a summary over ALL matching rows: count, total proposed / confirmed value, highest and lowest value item, oldest and newest last update (each with id, name, days and the ids tied with it), min and max ranges, and counts and values by stage, owner, campaign and channel group. Use the summary for counts, totals, oldest, newest, largest and ranges. Default order: value descending (confirmed value for confirmed deals, else proposed), then oldest last update first, then id; when no stage filter is given, open deals come first, then confirmed, then lost or withdrawn. 'Stuck' or 'stale' deals = stale_only true (open, no update in more than stale_days). For a given set of deals (for example the deals in a task), pass opportunity_ids and read the summary.",
    input_schema: {
      type: "object",
      properties: {
        ...asOfProp,
        stage: { type: "string", enum: [...STAGES, "open"], description: "A stage, or 'open' for all open stages" },
        campaign_id: { type: "string" },
        owner_id: { type: "string", description: "T01 Riya Kapoor, T02 Kabir Shah, T03 Meera Iyer, T05 Nisha Rao" },
        opportunity_ids: { type: "array", items: { type: "string" }, description: "Only these opportunities (e.g. the deals linked to a task)" },
        stale_only: { type: "boolean" },
        days_since_update_over: { type: "integer", description: "Only deals whose days_since_update is greater than this (60 for 'last updated more than 60 days ago')" },
        min_value: { type: "integer", description: "Minimum value in INR" },
        sort: { type: "string", enum: ["value", "last_update"], description: "value (default, tie break above) or last_update (oldest first)" },
        limit: { type: "integer", description: "Rows to return; default and max 200. The summary always covers all matching rows." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_opportunity_history",
    description:
      "Full version history of an opportunity (every stage and value change with its effective time), its originating campaign, support type, the brand's qualification history and its installments. Look up by opportunity_id (e.g. O006) or by name (matches opportunity or brand name; several matches are all returned, e.g. Beardo has two).",
    input_schema: {
      type: "object",
      properties: { opportunity_id: { type: "string" }, name: { type: "string" }, ...asOfProp },
      additionalProperties: false,
    },
  },
  {
    name: "get_campaign_decisions",
    description:
      "Per campaign at a date: decision badge (SCALE, CHANGE, STOP, WATCH), the rule that fired and CHANGE reasons, plus the metrics behind it (brands touched, contacted, conversations, opportunities, confirmed, lost or withdrawn, cash confirmed, meeting rate, win rate, stale share, stale open) and status, budget, spend and cash per rupee spent (simulated).",
    input_schema: { type: "object", properties: { ...asOfProp }, additionalProperties: false },
  },
  {
    name: "get_collections",
    description:
      "Payment installments at a date (all simulated: the source has no bank receipts): status paid, due (within 7 days), overdue, upcoming or voided, amounts, due and paid dates, days overdue, flags, and totals by status. Returns every matching row (up to 200) plus total_matching, returned, truncated and a summary over ALL matching rows: count, total due and paid, highest and lowest amount, earliest and latest due date (each with id, deal, name and days), min and max ranges, and counts and amounts by status, installment type, campaign and owner. Ordered overdue first by due date.",
    input_schema: {
      type: "object",
      properties: {
        ...asOfProp,
        status: { type: "string", enum: ["paid", "due", "overdue", "upcoming", "voided", "all"] },
        opportunity_id: { type: "string", description: "Only this deal's installments" },
        limit: { type: "integer", description: "Rows to return; default and max 200" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_budgets",
    description:
      "Per campaign planned budget and posted spend to a date (both simulated: the source has no spend), with confirmed partnerships, cash confirmed and cash collected, cost per confirmed partnership (null = undefined when 0 confirmed) and cash collected per rupee spent.",
    input_schema: { type: "object", properties: { ...asOfProp }, additionalProperties: false },
  },
  {
    name: "list_tasks",
    description:
      "Tasks with owner, due date, status, links and who created them (seed, user, copilot); overdue is relative to the simulation date. Returns every matching row (up to 200) plus total_matching, returned, truncated and a summary over ALL matching rows: count, overdue count, earliest and latest due date and oldest and newest created (each with task id, title and days), and counts by status, owner, campaign and creator.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "in_progress", "done", "cancelled"] },
        owner_id: { type: "string" },
        overdue_only: { type: "boolean" },
        limit: { type: "integer", description: "Rows to return; default and max 200" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "query_data",
    description:
      "Read only SQL for questions the other tools do not cover. One SELECT (or WITH ... SELECT) over the v_* views only: v_brands, v_contacts, v_campaigns, v_interactions, v_qualification_history, v_opportunities, v_opportunity_history, v_targets, v_activations, v_payments, v_budgets, v_spend, v_tasks, v_event. Timestamps are timestamptz (convert with AT TIME ZONE 'Asia/Kolkata'). Version tables hold every version: take the latest per id yourself. Max 200 rows, 3 s. Call data_dictionary first if unsure of columns.",
    input_schema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"], additionalProperties: false },
  },
  {
    name: "calculate",
    description:
      "Evaluate arithmetic exactly. Use for every number you derive (differences, sums, averages, ratios, percentages). Numbers without thousands separators (1842500, not 18,42,500). Operators + - * / % ^ ( ) and round, floor, ceil, abs, min, max, sum, mean, median, sqrt, pow.",
    input_schema: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"], additionalProperties: false },
  },
  {
    name: "data_dictionary",
    description:
      "Views and columns, which data is sourced, simulated or assumption, the source field guide (meaning of every source field), the current assumptions, and the list of things this data cannot tell (gaps). Use it to check whether a field exists before saying the data cannot answer.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "propose_task",
    description:
      "Propose a task. Creates a pending proposal only; nothing is written until the user clicks Confirm on the card. Owners: T01 Riya Kapoor, T02 Kabir Shah, T03 Meera Iyer, T05 Nisha Rao.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        owner_id: { type: "string" },
        due_date: { type: "string", description: "YYYY-MM-DD" },
        sponsor_campaign_id: { type: "string" },
        opportunity_ids: { type: "array", items: { type: "string" } },
        brand_id: { type: "string" },
        notes: { type: "string" },
      },
      required: ["title", "owner_id", "due_date"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_campaign_status",
    description: "Propose changing a sponsor campaign's status (active, paused, stopped). Creates a pending proposal only; nothing changes until the user clicks Confirm.",
    input_schema: {
      type: "object",
      properties: {
        sponsor_campaign_id: { type: "string" },
        status: { type: "string", enum: ["active", "paused", "stopped"] },
        reason: { type: "string" },
      },
      required: ["sponsor_campaign_id", "status", "reason"],
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------- helpers
type Input = Record<string, unknown>;

async function dataOf(ctx: ToolContext): Promise<Dataset> {
  ctx.data ??= await loadDataset(ctx.sql);
  return ctx.data;
}

/** Ids and names of every record, for the grounding check (E2). */
export async function recordIndexFor(ctx: ToolContext): Promise<RecordIndex> {
  return buildRecordIndex(await dataOf(ctx));
}

function asOfOf(data: Dataset, input: Input, key = "as_of"): string {
  const v = input[key];
  if (v === undefined || v === null || v === "") return data.settings.simulation_date;
  if (!isIsoDate(v)) throw new WriteError(`${key} must be a date YYYY-MM-DD`);
  return v;
}

const ORIGIN = {
  sourced: "from the CampusFest 2025 sponsor dataset (or edits made in the app)",
  simulated: "simulated: the source has no payments, bank receipts, budgets or spend",
  assumption: "assumption set in Settings (stage weights, collection rate, stale days, cash goal)",
};

const SIMULATED_KEYS = [
  "cash_collected_inr_simulated",
  "cash_collected_before_festival_inr_simulated",
  "outstanding_confirmed_cash_inr_simulated",
  "overdue_installments_simulated",
  "overdue_amount_inr_simulated",
];
const ASSUMPTION_KEYS = ["weighted_open_pipeline_inr", "stale_open_opportunities_7d"];

function moneyDisplay(o: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) if (/_inr/.test(k) && typeof v === "number") out[k] = inr(v);
  return out;
}

function header(data: Dataset, asOf: string) {
  return {
    as_of: asOf,
    as_of_meaning: `end of day ${asOf} IST`,
    simulation_date: data.settings.simulation_date,
  };
}

// ---------------------------------------------------------------- read tools
/** Opportunities confirmed at `d` that are no longer confirmed at the simulation date, and the reverse. */
function laterChanges(data: Dataset, d: string) {
  const sim = data.settings.simulation_date;
  if (d >= sim) return null;
  const at = latestBy(data.oppHistory, (h) => h.opportunity_id, istEndOfDay(d));
  const now = latestBy(data.oppHistory, (h) => h.opportunity_id, istEndOfDay(sim));
  const rows: { opportunity_id: string; brand_name: string | null; stage_at_as_of: string; stage_at_simulation_date: string; changed_at: string }[] = [];
  for (const [id, h] of at) {
    const n = now.get(id);
    if (!n || (h.stage === "partner_confirmed") === (n.stage === "partner_confirmed")) continue;
    rows.push({ opportunity_id: id, brand_name: h.brand_name, stage_at_as_of: h.stage, stage_at_simulation_date: n.stage, changed_at: toIstIso(n.effective_at) });
  }
  return { note: `confirmed status at ${d} vs at the simulation date ${sim}`, opportunities: rows };
}

/** App-made versions (source app) in force by `d`, newest first, at most 5 (edits made in the UI or by confirmed proposals). */
function appEdits(data: Dataset, d: string) {
  const t = istEndOfDay(d);
  const rows = data.oppHistory
    .filter((h) => h.source === "app" && h.effective_at <= t)
    .sort((a, b) => b.effective_at - a.effective_at)
    .map((h) => ({ history_id: h.history_id, opportunity_id: h.opportunity_id, brand_name: h.brand_name, stage: h.stage, proposed_value_inr: h.proposed_value_inr, confirmed_value_inr: h.confirmed_value_inr, effective_at: toIstIso(h.effective_at) }));
  return { opportunity_versions_from_app_edits: rows.length, latest: rows.slice(0, 5) };
}

function getOverview(data: Dataset, input: Input) {
  const d = asOfOf(data, input);
  const s = computeSnapshot(data, d);
  const tv = targetInForce(data, istEndOfDay(d));
  const festStart = data.event.event_starts_at;
  return {
    ...header(data, d),
    metrics: s,
    display_inr: moneyDisplay(s as unknown as Record<string, unknown>),
    targets_in_force: tv
      ? { target_version: tv.target_version, effective_at: toIstIso(tv.effective_at), qualified_brands_goal: tv.qualified_brands_goal, confirmed_partnerships_goal: tv.confirmed_partnerships_goal, source: tv.source }
      : null,
    gap_to_goal: tv
      ? {
          confirmed_partnerships_minus_goal: s.confirmed_partnerships - tv.confirmed_partnerships_goal,
          qualified_brands_minus_goal: s.qualified_brands - tv.qualified_brands_goal,
          cash_collected_before_festival_minus_team_cash_goal: s.cash_collected_before_festival_inr_simulated - data.settings.cash_goal_inr,
        }
      : null,
    festival: { starts_at: toIstIso(festStart), ends_at: toIstIso(data.event.event_ends_at), festival_started_by_as_of: istEndOfDay(d) >= festStart },
    changed_after_as_of: laterChanges(data, d),
    app_edits: appEdits(data, d),
    assumptions: { ...data.settings, cash_goal_note: "team cash goal = next-edition base case (assumption)" },
    origin: {
      sourced: Object.keys(s).filter((k) => !SIMULATED_KEYS.includes(k) && !ASSUMPTION_KEYS.includes(k) && k !== "projected_cash_before_festival_inr"),
      simulated: [...SIMULATED_KEYS, "projected_cash_before_festival_inr"],
      assumption: [...ASSUMPTION_KEYS, "projected_cash_before_festival_inr", "cash_goal_inr"],
      notes: ORIGIN,
    },
    stale_days_setting: data.settings.stale_days,
    definitions: {
      confirmed_partnerships: "opportunities whose latest version by the date is partner_confirmed (counted by opportunity; confirmed_brands counts brands)",
      stale_open_opportunities_7d: `open opportunities with no update in more than the stale_days setting in force, now ${data.settings.stale_days} days (assumption; the key keeps its _7d name whatever the setting)`,
      projected_cash_before_festival_inr:
        "after the festival start: cash collected before 12 Apr 10:00 IST; before it: collected + unpaid confirmed cash x collection rate + weighted open cash pipeline x collection rate",
    },
  };
}

function getFunnel(data: Dataset, input: Input) {
  const d = asOfOf(data, input);
  const groupBy = input.group_by as string | undefined;
  const camp = input.campaign_id ? String(input.campaign_id) : undefined;
  if (camp && !data.campaigns.some((c) => c.sponsor_campaign_id === camp)) throw new WriteError(`unknown campaign_id ${camp}`);
  if (!groupBy) {
    const s = computeSnapshot(data, d, { campaignId: camp });
    return { ...header(data, d), scope: camp ?? "all campaigns", steps: funnel(s), note: "brands for prospects to conversations, opportunities for proposals and confirmed, INR for cash collected (simulated)", origin: "sourced; cash collected is simulated" };
  }
  if (groupBy === "campaign" || groupBy === "channel_group") {
    const c = stageConversion(data, d);
    const rows = groupBy === "campaign" ? c.byCampaign : c.byGroup;
    return {
      ...header(data, d),
      group_by: groupBy,
      groups: rows.map((r) => ({ key: r.key, label: r.label, counts: r.counts, conversion: Object.fromEntries(r.steps.map((s) => [`${s.from}_to_${s.to}`, s.rate])), bottleneck: r.bottleneck })),
      note: "Counts are distinct brands (contacted, responded, conversations) and opportunities (opportunities, proposals, confirmed). Campaign rows do not sum to totals: 12 brands were touched by more than one campaign.",
      origin: "sourced",
    };
  }
  const stats = groupBy === "owner" ? byOwner(data, d) : byIndustry(data, d);
  return {
    ...header(data, d),
    group_by: groupBy,
    groups: stats,
    note: `${groupBy === "owner" ? "owner = owner_name of the opportunity's latest version" : "industry of the brand"}; confirmed_value_inr is cash + in kind, split in confirmed_cash(_value_inr) and confirmed_in_kind(_value_inr)`,
    origin: "sourced",
  };
}

function compareSnapshots(data: Dataset, input: Input) {
  const a = asOfOf(data, input, "date_a");
  const b = asOfOf(data, input, "date_b");
  const sa = computeSnapshot(data, a) as unknown as Record<string, unknown>;
  const sb = computeSnapshot(data, b) as unknown as Record<string, unknown>;
  const change: Record<string, number> = {};
  for (const k of Object.keys(sb)) if (typeof sb[k] === "number" && typeof sa[k] === "number") change[k] = (sb[k] as number) - (sa[k] as number);
  return { date_a: a, date_b: b, simulation_date: data.settings.simulation_date, metrics_a: sa, metrics_b: sb, change_b_minus_a: change, origin: "see get_overview origin; *_simulated keys are simulated" };
}

/** Rows to return from a list tool: default and max 200 (REVIEWER NOTE 06 E1). */
export const LIST_MAX = 200;
const limitOf = (input: Input) => Math.min(Math.max(Math.trunc(Number(input.limit ?? LIST_MAX)) || LIST_MAX, 1), LIST_MAX);

/** Count (and optional sum) per key over all matching rows. */
function tally<T>(rows: readonly T[], key: (r: T) => string | null, value?: (r: T) => number) {
  const m: Record<string, { count: number; value_inr?: number }> = {};
  for (const r of rows) {
    const k = key(r) ?? "none";
    m[k] ??= value ? { count: 0, value_inr: 0 } : { count: 0 };
    m[k].count += 1;
    if (value) m[k].value_inr! += value(r);
  }
  return m;
}

/** First row by `cmp` plus the ids of other rows equal to it on `same`. */
function extreme<T extends { id: string }>(rows: readonly T[], cmp: (a: T, b: T) => number, same: (a: T, b: T) => boolean) {
  const first = [...rows].sort(cmp)[0];
  return { row: first, tied_with: rows.filter((r) => r !== first && same(r, first)).map((r) => r.id) };
}

const range = (xs: number[]) => (xs.length ? { min: Math.min(...xs), max: Math.max(...xs) } : null);

type PipeRow = ReturnType<typeof pipelineRows>[number];

/** Summary over ALL matching opportunities (E1): what claims about all, total, oldest, largest and counts must use. */
export function opportunitySummary(rows: readonly PipeRow[], campaignName: (id: string | null) => string | null) {
  if (!rows.length) return { count: 0 };
  const item = (r: PipeRow) => ({ opportunity_id: r.id, name: r.brand_name, stage: r.stage, value_inr: r.value, value_display: inr(r.value), owner_name: r.owner_name, sponsor_campaign_id: r.sponsor_campaign_id, last_update: istDateOf(r.last_update), days_since_update: r.days_since_update });
  const byValue = (a: PipeRow, b: PipeRow) => b.value - a.value || a.last_update - b.last_update || a.id.localeCompare(b.id);
  const hi = extreme(rows, byValue, (a, b) => a.value === b.value);
  const lo = extreme(rows, (a, b) => -byValue(a, b), (a, b) => a.value === b.value);
  const old = extreme(rows, (a, b) => a.last_update - b.last_update || a.id.localeCompare(b.id), (a, b) => a.days_since_update === b.days_since_update);
  const recent = extreme(rows, (a, b) => b.last_update - a.last_update || a.id.localeCompare(b.id), (a, b) => a.days_since_update === b.days_since_update);
  const totalProposed = rows.reduce((a, r) => a + r.proposed_value_inr, 0);
  const totalConfirmed = rows.reduce((a, r) => a + r.confirmed_value_inr, 0);
  return {
    count: rows.length,
    stale_count: rows.filter((r) => r.stale).length,
    total_proposed_value_inr: totalProposed,
    total_proposed_value_display: inr(totalProposed),
    total_confirmed_value_inr: totalConfirmed,
    total_confirmed_value_display: inr(totalConfirmed),
    highest_value: { ...item(hi.row), tied_with: hi.tied_with },
    lowest_value: { ...item(lo.row), tied_with: lo.tied_with },
    oldest_last_update: { ...item(old.row), tied_with: old.tied_with },
    newest_last_update: { ...item(recent.row), tied_with: recent.tied_with },
    ranges: { days_since_update: range(rows.map((r) => r.days_since_update)), value_inr: range(rows.map((r) => r.value)) },
    by_stage: tally(rows, (r) => r.stage, (r) => r.value),
    by_owner: tally(rows, (r) => (r.owner_id ? `${r.owner_id} ${r.owner_name}` : null), (r) => r.value),
    by_campaign: tally(rows, (r) => (r.sponsor_campaign_id ? `${r.sponsor_campaign_id} ${campaignName(r.sponsor_campaign_id) ?? ""}`.trim() : null), (r) => r.value),
    by_channel_group: tally(rows, (r) => r.group, (r) => r.value),
    value_note: "value = confirmed value for confirmed deals, else proposed value; days_since_update = whole days from the last update to the end of the as of date",
  };
}

function listOpportunities(data: Dataset, input: Input) {
  const d = asOfOf(data, input);
  const limit = limitOf(input);
  let rows = pipelineRows(data, d);
  const stage = input.stage as string | undefined;
  if (stage === "open") rows = rows.filter((r) => r.stage_group === "open");
  else if (stage) rows = rows.filter((r) => r.stage === stage);
  if (input.campaign_id) rows = rows.filter((r) => r.sponsor_campaign_id === input.campaign_id);
  if (input.owner_id) rows = rows.filter((r) => r.owner_id === input.owner_id);
  if (Array.isArray(input.opportunity_ids)) {
    const want = new Set(input.opportunity_ids.map(String));
    const unknown = [...want].filter((id) => !rows.some((r) => r.id === id) && !data.opportunities.some((o) => o.opportunity_id === id));
    if (unknown.length) throw new WriteError(`unknown opportunity_ids ${unknown.join(", ")}`);
    rows = rows.filter((r) => want.has(r.id));
  }
  if (input.stale_only) rows = rows.filter((r) => r.stale);
  if (input.days_since_update_over !== undefined) rows = rows.filter((r) => r.days_since_update > Number(input.days_since_update_over));
  if (input.min_value !== undefined) rows = rows.filter((r) => r.value >= Number(input.min_value));
  if (input.sort === "last_update") rows = [...rows].sort((x, y) => x.last_update - y.last_update || x.id.localeCompare(y.id));
  const filtered = rows.length;
  const shown = rows.slice(0, limit);
  // Ties among the returned rows: same value inside the same stage group.
  const byValue = new Map<string, string[]>();
  for (const r of shown) {
    const k = `${r.stage_group}|${r.value}`;
    byValue.set(k, [...(byValue.get(k) ?? []), r.id]);
  }
  const ties = [...byValue.entries()].filter(([, ids]) => ids.length > 1).map(([k, ids]) => ({ value_inr: Number(k.split("|")[1]), value_display: inr(Number(k.split("|")[1])), stage_group: k.split("|")[0], ids }));
  const cutTie = shown.length < rows.length && rows[shown.length].value === shown[shown.length - 1]?.value;
  const campaignName = (id: string | null) => data.campaigns.find((c) => c.sponsor_campaign_id === id)?.campaign_name ?? null;
  return {
    ...header(data, d),
    total_matching: filtered,
    returned: shown.length,
    truncated: shown.length < filtered,
    summary: opportunitySummary(rows, campaignName),
    order: input.sort === "last_update" ? "last update, oldest first, then id" : "stage group (open, confirmed, lost or withdrawn), then value descending, then oldest last update first, then id",
    tie_break_rule: "value descending, then oldest last update first, then id",
    ties,
    tie_continues_beyond_limit: cutTie,
    opportunities: shown.map((r) => ({
      rank: r.rank,
      opportunity_id: r.id,
      brand_name: r.brand_name,
      stage: r.stage,
      proposed_value_inr: r.proposed_value_inr,
      confirmed_value_inr: r.confirmed_value_inr,
      value_inr: r.value,
      value_display: inr(r.value),
      support_type: r.support_type,
      owner_id: r.owner_id,
      owner_name: r.owner_name,
      sponsor_campaign_id: r.sponsor_campaign_id,
      campaign_name: r.campaign_name,
      channel_group: r.group,
      last_update: istDateOf(r.last_update),
      days_since_update: r.days_since_update,
      stale: r.stale,
      tie: r.tie,
    })),
    origin: `sourced; stale uses stale_days = ${data.settings.stale_days} (assumption)`,
  };
}

function getOpportunityHistory(data: Dataset, input: Input) {
  const d = asOfOf(data, input);
  const t = istEndOfDay(d);
  const id = input.opportunity_id ? String(input.opportunity_id).trim() : "";
  const name = input.name ? String(input.name).trim().toLowerCase() : "";
  if (!id && !name) throw new WriteError("give opportunity_id or name");
  const matches = id
    ? data.opportunities.filter((o) => o.opportunity_id.toLowerCase() === id.toLowerCase())
    : data.opportunities.filter((o) => o.opportunity_name.toLowerCase().includes(name) || (o.brand_name ?? "").toLowerCase().includes(name));
  if (!matches.length) return { ...header(data, d), matches: [], note: `no opportunity matches ${id || name}` };
  return {
    ...header(data, d),
    match_count: matches.length,
    matches: matches.slice(0, 5).map((o) => {
      const versions = data.oppHistory.filter((h) => h.opportunity_id === o.opportunity_id).sort((a, b) => a.effective_at - b.effective_at);
      const qual = data.qualHistory.filter((q) => q.brand_id === o.brand_id).sort((a, b) => a.effective_at - b.effective_at);
      const camp = data.campaigns.find((c) => c.sponsor_campaign_id === o.sponsor_campaign_id);
      return {
        opportunity_id: o.opportunity_id,
        opportunity_name: o.opportunity_name,
        brand_id: o.brand_id,
        brand_name: o.brand_name,
        support_type: o.support_type,
        originating_campaign: camp ? `${camp.sponsor_campaign_id} ${camp.campaign_name}` : null,
        created_at: toIstIso(o.created_at),
        primary_contact: o.primary_contact_name,
        versions: versions.map((v) => ({
          history_id: v.history_id,
          effective_at: toIstIso(v.effective_at),
          stage: v.stage,
          proposed_value_inr: v.proposed_value_inr,
          confirmed_value_inr: v.confirmed_value_inr,
          owner_name: v.owner_name,
          source: v.source,
          after_as_of: v.effective_at > t,
        })),
        brand_qualification: qual.map((q) => ({ effective_at: toIstIso(q.effective_at), status: q.qualification_status, reason: q.reason, after_as_of: q.effective_at > t })),
        installments_simulated: data.payments
          .filter((p) => p.opportunity_id === o.opportunity_id)
          .map((p) => ({ installment_id: p.installment_id, installment: p.installment, amount_due_inr: p.amount_due_inr, due_at: toIstIso(p.due_at), paid_at: p.paid_at ? toIstIso(p.paid_at) : null, voided_at: p.voided_at ? toIstIso(p.voided_at) : null })),
        fields_available: "stage, proposed and confirmed value, owner and effective time per version; there is no reason field for lost or withdrawn",
      };
    }),
    origin: "sourced (installments simulated)",
  };
}

function getCampaignDecisions(data: Dataset, input: Input) {
  const d = asOfOf(data, input);
  return {
    ...header(data, d),
    rules: [
      "1 WATCH if opportunities_created < 5 and closed < 3",
      "2 SCALE if closed >= 3 and win_rate >= 0.5 and meeting_rate >= 0.4",
      "3 STOP if confirmed = 0 and opportunities_created >= 8 and meeting_rate < 0.25",
      "4 CHANGE otherwise",
      "closed = confirmed + lost_or_withdrawn; win_rate = confirmed / closed; meeting_rate = conversations / contacted",
    ],
    campaigns: campaignRows(data, d).map((r) => ({
      sponsor_campaign_id: r.sponsor_campaign_id,
      campaign_name: r.campaign_name,
      status: r.status,
      badge: r.decision.badge,
      rule: r.decision.rule,
      reasons: r.decision.reasons,
      metrics: {
        brands_touched: r.metrics.prospects_brands,
        contacted_brands: r.metrics.contacted_brands,
        conversation_brands: r.metrics.conversation_brands,
        opportunities_created: r.metrics.opportunities_created,
        proposals: r.metrics.proposals,
        confirmed_partnerships: r.metrics.confirmed_partnerships,
        lost_or_withdrawn: r.metrics.lost_or_withdrawn,
        confirmed_value_cash_inr: r.metrics.confirmed_value_cash_inr,
        confirmed_value_in_kind_inr: r.metrics.confirmed_value_in_kind_inr,
        confirmed_value_total_inr: r.metrics.confirmed_value_total_inr,
        open_opportunities: r.metrics.open_opportunities,
        stale_open_opportunities_7d: r.metrics.stale_open_opportunities_7d,
        cash_collected_inr_simulated: r.metrics.cash_collected_inr_simulated,
      },
      meeting_rate: r.decision.meeting_rate,
      win_rate: r.decision.win_rate,
      closed: r.decision.closed,
      stale_share: r.decision.stale_share,
      budget_inr_simulated: r.budget,
      spend_to_date_inr_simulated: r.spend,
      cash_collected_per_rupee_spent_simulated: r.cash_per_rupee_spent,
    })),
    origin: "badges and metrics sourced; stale uses stale_days (assumption); budget, spend and cash simulated",
  };
}

/** Calendar days between two IST dates (b - a). */
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

function getCollections(data: Dataset, input: Input) {
  const d = asOfOf(data, input);
  const all = installmentRows(data, d);
  const status = (input.status as string | undefined) ?? "all";
  let rows = status === "all" ? all : all.filter((r) => r.status === status);
  if (input.opportunity_id) rows = rows.filter((r) => r.opportunity_id === String(input.opportunity_id));
  const limit = limitOf(input);
  const s = computeSnapshot(data, d);
  const deal = new Map(pipelineRows(data, d).map((r) => [r.id, r]));
  const campaignName = (id: string | null | undefined) => data.campaigns.find((c) => c.sponsor_campaign_id === id)?.campaign_name ?? null;
  const view = rows.map((r) => {
    const due = istDateOf(r.due_at);
    const p = deal.get(r.opportunity_id);
    return {
      id: r.installment_id,
      installment_id: r.installment_id,
      opportunity_id: r.opportunity_id,
      brand_name: r.brand_name,
      installment: r.installment,
      amount_due_inr: r.amount_due_inr,
      amount_display: inr(r.amount_due_inr),
      amount_paid_inr: r.status === "paid" ? r.amount_paid_inr : 0,
      due_date: due,
      due_at_ms: r.due_at,
      status: r.status,
      days_overdue: r.status === "overdue" ? dayDiff(due, d) : null,
      days_until_due: r.status === "due" || r.status === "upcoming" ? dayDiff(d, due) : null,
      paid_date: r.paid_at && r.status === "paid" ? istDateOf(r.paid_at) : null,
      stage_at_as_of: r.stage_at_d,
      sponsor_campaign_id: p?.sponsor_campaign_id ?? null,
      owner: p?.owner_id ? `${p.owner_id} ${p.owner_name}` : null,
      flags: r.flags,
    };
  });
  type V = (typeof view)[number];
  const item = (r: V) => ({ installment_id: r.installment_id, opportunity_id: r.opportunity_id, name: r.brand_name, installment: r.installment, amount_due_inr: r.amount_due_inr, amount_display: r.amount_display, status: r.status, due_date: r.due_date, days_overdue: r.days_overdue, days_until_due: r.days_until_due });
  const byAmount = (a: V, b: V) => b.amount_due_inr - a.amount_due_inr || a.due_at_ms - b.due_at_ms || a.id.localeCompare(b.id);
  const summary = view.length
    ? (() => {
        const hi = extreme(view, byAmount, (a, b) => a.amount_due_inr === b.amount_due_inr);
        const lo = extreme(view, (a, b) => -byAmount(a, b), (a, b) => a.amount_due_inr === b.amount_due_inr);
        const first = extreme(view, (a, b) => a.due_at_ms - b.due_at_ms || a.id.localeCompare(b.id), (a, b) => a.due_date === b.due_date);
        const last = extreme(view, (a, b) => b.due_at_ms - a.due_at_ms || a.id.localeCompare(b.id), (a, b) => a.due_date === b.due_date);
        const due = view.reduce((a, r) => a + r.amount_due_inr, 0);
        const paid = view.reduce((a, r) => a + r.amount_paid_inr, 0);
        return {
          count: view.length,
          total_amount_due_inr: due,
          total_amount_due_display: inr(due),
          total_amount_paid_inr: paid,
          total_amount_paid_display: inr(paid),
          highest_amount: { ...item(hi.row), tied_with: hi.tied_with },
          lowest_amount: { ...item(lo.row), tied_with: lo.tied_with },
          earliest_due: { ...item(first.row), tied_with: first.tied_with },
          latest_due: { ...item(last.row), tied_with: last.tied_with },
          ranges: { amount_due_inr: range(view.map((r) => r.amount_due_inr)), days_overdue: range(view.flatMap((r) => (r.days_overdue === null ? [] : [r.days_overdue]))) },
          by_status: tally(view, (r) => r.status, (r) => r.amount_due_inr),
          by_installment: tally(view, (r) => r.installment, (r) => r.amount_due_inr),
          by_campaign: tally(view, (r) => (r.sponsor_campaign_id ? `${r.sponsor_campaign_id} ${campaignName(r.sponsor_campaign_id) ?? ""}`.trim() : null), (r) => r.amount_due_inr),
          by_owner: tally(view, (r) => r.owner, (r) => r.amount_due_inr),
        };
      })()
    : { count: 0 };
  return {
    ...header(data, d),
    simulated: true,
    note: "All installments and payments are simulated (fixed seed); the source has no bank receipts. Terms: advance = value / 2 rounded down due 7 days after confirmation; balance due 22 Mar 2025 18:00 IST or 7 days after confirmation if later.",
    totals_by_status: collectionsSummary(all),
    cash_collected_inr: s.cash_collected_inr_simulated,
    cash_collected_before_festival_inr: s.cash_collected_before_festival_inr_simulated,
    outstanding_confirmed_cash_inr: s.outstanding_confirmed_cash_inr_simulated,
    display_inr: moneyDisplay({ cash_collected_inr: s.cash_collected_inr_simulated, cash_collected_before_festival_inr: s.cash_collected_before_festival_inr_simulated, outstanding_confirmed_cash_inr: s.outstanding_confirmed_cash_inr_simulated }),
    total_matching: view.length,
    returned: Math.min(view.length, limit),
    truncated: view.length > limit,
    summary,
    installments: view.slice(0, limit).map((r) => {
      const { id, due_at_ms, ...rest } = r;
      void id;
      void due_at_ms;
      return rest;
    }),
    order: "overdue, due, upcoming, paid, voided; then due date",
    totals_note: "totals_by_status covers every installment at the date; summary covers the matching rows; days_overdue = calendar days from the due date to the as of date",
  };
}

function getBudgets(data: Dataset, input: Input) {
  const d = asOfOf(data, input);
  const b = budgets(data, d);
  const rows = campaignRows(data, d);
  return {
    ...header(data, d),
    simulated: true,
    note: "Budgets and spend are simulated; the source has no spend or budget. cost_per_confirmed_partnership is null (undefined, not zero) when a campaign has 0 confirmed.",
    campaigns: rows.map((r) => {
      const line = b[r.sponsor_campaign_id];
      const spent = line?.spent ?? 0;
      return {
        sponsor_campaign_id: r.sponsor_campaign_id,
        campaign_name: r.campaign_name,
        planned_budget_inr: line?.planned ?? null,
        spend_to_date_inr: spent,
        remaining_budget_inr: line ? line.planned - spent : null,
        confirmed_partnerships: r.metrics.confirmed_partnerships,
        confirmed_value_cash_inr: r.metrics.confirmed_value_cash_inr,
        cash_collected_inr_simulated: r.metrics.cash_collected_inr_simulated,
        cost_per_confirmed_partnership_inr: r.metrics.confirmed_partnerships > 0 ? Math.round(spent / r.metrics.confirmed_partnerships) : null,
        cash_collected_per_rupee_spent: r.cash_per_rupee_spent,
      };
    }),
  };
}

function listTasks(data: Dataset, input: Input) {
  const d = data.settings.simulation_date;
  let tasks = data.tasks.map((t) => ({
    task_id: t.task_id,
    title: t.title,
    owner_id: t.owner_id,
    owner_name: t.owner_name,
    due_date: t.due_date,
    status: t.status,
    overdue: !!t.due_date && t.due_date < d && (t.status === "open" || t.status === "in_progress"),
    sponsor_campaign_id: t.sponsor_campaign_id,
    opportunity_ids: t.opportunity_ids,
    brand_id: t.brand_id,
    notes: t.notes,
    created_by: t.created_by,
    created_at: toIstIso(t.created_at),
    source: t.source,
  }));
  if (input.status) tasks = tasks.filter((t) => t.status === input.status);
  if (input.owner_id) tasks = tasks.filter((t) => t.owner_id === input.owner_id);
  if (input.overdue_only) tasks = tasks.filter((t) => t.overdue);
  const limit = limitOf(input);
  type T = (typeof tasks)[number] & { id: string };
  const rows: T[] = tasks.map((t) => ({ ...t, id: t.task_id }));
  const item = (t: T) => ({ task_id: t.task_id, name: t.title, owner_name: t.owner_name, status: t.status, due_date: t.due_date, days_until_due: t.due_date ? dayDiff(d, t.due_date) : null, created_at: t.created_at });
  const withDue = rows.filter((t) => t.due_date);
  const created = (t: T) => Date.parse(t.created_at);
  const summary = rows.length
    ? {
        count: rows.length,
        overdue_count: rows.filter((t) => t.overdue).length,
        earliest_due: withDue.length ? (({ row, tied_with }) => ({ ...item(row), tied_with }))(extreme(withDue, (a, b) => a.due_date!.localeCompare(b.due_date!) || a.id.localeCompare(b.id), (a, b) => a.due_date === b.due_date)) : null,
        latest_due: withDue.length ? (({ row, tied_with }) => ({ ...item(row), tied_with }))(extreme(withDue, (a, b) => b.due_date!.localeCompare(a.due_date!) || a.id.localeCompare(b.id), (a, b) => a.due_date === b.due_date)) : null,
        oldest_created: (({ row, tied_with }) => ({ ...item(row), tied_with }))(extreme(rows, (a, b) => created(a) - created(b) || a.id.localeCompare(b.id), (a, b) => a.created_at === b.created_at)),
        newest_created: (({ row, tied_with }) => ({ ...item(row), tied_with }))(extreme(rows, (a, b) => created(b) - created(a) || a.id.localeCompare(b.id), (a, b) => a.created_at === b.created_at)),
        by_status: tally(rows, (t) => t.status),
        by_owner: tally(rows, (t) => (t.owner_id ? `${t.owner_id} ${t.owner_name}` : null)),
        by_campaign: tally(rows, (t) => t.sponsor_campaign_id),
        by_created_by: tally(rows, (t) => t.created_by),
        note: "days_until_due is negative when the due date is before the simulation date; tasks have no update time, so created_at is their last change",
      }
    : { count: 0 };
  return {
    simulation_date: d,
    overdue_rule: "due before the simulation date and open or in progress",
    total_matching: rows.length,
    returned: Math.min(rows.length, limit),
    truncated: rows.length > limit,
    count: rows.length,
    summary,
    tasks: tasks.slice(0, limit),
    origin: "seed tasks are simulated; others created in the app",
  };
}

async function dataDictionary(ctx: ToolContext, data: Dataset) {
  const dict = await loadDataDictionary(ctx.sql);
  return { ...dict, current_assumptions: data.settings, team: "T01 Riya Kapoor, T02 Kabir Shah, T03 Meera Iyer, T05 Nisha Rao" };
}

// ---------------------------------------------------------------- executor
export interface ToolOutcome {
  ok: boolean;
  content: unknown;
}

/** Runs one tool; errors come back as { ok: false } so the model can correct itself (is_error). */
export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const input = (rawInput && typeof rawInput === "object" ? rawInput : {}) as Input;
  try {
    const data = await dataOf(ctx);
    switch (name) {
      case "get_overview":
        return { ok: true, content: getOverview(data, input) };
      case "get_funnel":
        return { ok: true, content: getFunnel(data, input) };
      case "compare_snapshots":
        return { ok: true, content: compareSnapshots(data, input) };
      case "list_opportunities":
        return { ok: true, content: listOpportunities(data, input) };
      case "get_opportunity_history":
        return { ok: true, content: getOpportunityHistory(data, input) };
      case "get_campaign_decisions":
        return { ok: true, content: getCampaignDecisions(data, input) };
      case "get_collections":
        return { ok: true, content: getCollections(data, input) };
      case "get_budgets":
        return { ok: true, content: getBudgets(data, input) };
      case "list_tasks":
        return { ok: true, content: listTasks(data, input) };
      case "query_data":
        return { ok: true, content: { ...(await queryData(ctx.readonlySql, String(input.sql ?? ""))), note: "raw rows; label simulated tables (v_payments, v_budgets, v_spend) as simulated" } };
      case "calculate":
        return { ok: true, content: calculate(String(input.expression ?? "")) };
      case "data_dictionary":
        return { ok: true, content: await dataDictionary(ctx, data) };
      case "propose_task": {
        const proposal = await createProposal(ctx.sql, "create_task", validateTaskPayload(data, input));
        return { ok: true, content: { proposal, next_step: "Shown to the user as a card with Confirm, Edit and Cancel. Nothing is written until the user clicks Confirm. Do not say the task exists." } };
      }
      case "propose_campaign_status": {
        const proposal = await createProposal(ctx.sql, "set_campaign_status", validateCampaignStatusPayload(data, input));
        return { ok: true, content: { proposal, next_step: "Shown to the user as a card with Confirm, Edit and Cancel. Nothing changes until the user clicks Confirm. Do not say the campaign is paused or changed." } };
      }
      default:
        return { ok: false, content: { error: `unknown tool ${name}` } };
    }
  } catch (e) {
    const known = e instanceof WriteError || e instanceof QueryRejected;
    const pgMessage = !known && e instanceof Error && "code" in e ? `database error ${(e as unknown as { code: string }).code}: ${e.message}` : null;
    return { ok: false, content: { error: known ? (e as Error).message : (pgMessage ?? (e instanceof Error ? e.message : String(e))) } };
  }
}
