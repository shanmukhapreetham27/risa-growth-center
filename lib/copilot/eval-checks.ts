/**
 * Mechanical eval checks (REVIEWER NOTE 06 V1, V2). Expected values come from the engine at run time.
 * - V1 auto checks for Q15 to Q20: exact match on ids and numbers, plus the as of date.
 * - V2 id-number check for every answer: each opportunity, campaign, installment or task id with the
 *   numbers written next to it (same table row or sentence, up to the next id of the same kind) must
 *   agree with the engine's figures for that record. Any mismatch fails the answer.
 */
import {
  budgets,
  campaignRows,
  CHANNEL_GROUPS,
  computeSnapshot,
  type Dataset,
  DAY_MS,
  installmentRows,
  istDateOf,
  istEndOfDay,
  pipelineRows,
  stageConversion,
} from "../engine";
import { quantitiesIn, type TextNumber } from "./grounding";
import { type EntityType, ID_SOURCE, idsIn, plainText, segmentsOf } from "./ids";

// ---------------------------------------------------------------- facts per record
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

function numbersOf(v: unknown, into: number[]): void {
  if (typeof v === "number" && Number.isFinite(v)) into.push(v);
  else if (Array.isArray(v)) for (const x of v) numbersOf(x, into);
  else if (v && typeof v === "object") for (const x of Object.values(v)) numbersOf(x, into);
}

/** Every figure the engine has for a record at the given dates (values, counts, days, rates). */
export function factsFor(data: Dataset, id: string, type: EntityType, dates: readonly string[]): number[] {
  const out: number[] = [];
  for (const d of dates) {
    const t = istEndOfDay(d);
    if (type === "opportunity" || type === "installment" || type === "task") {
      const oppIds =
        type === "opportunity"
          ? [id]
          : type === "installment"
            ? data.payments.filter((p) => p.installment_id === id).map((p) => p.opportunity_id)
            : (data.tasks.find((x) => x.task_id === id)?.opportunity_ids ?? []);
      const rows = pipelineRows(data, d).filter((r) => oppIds.includes(r.id));
      for (const r of rows) {
        out.push(r.proposed_value_inr, r.confirmed_value_inr, r.value, r.days_since_update, data.settings.stage_weights[r.stage] ?? 0);
        out.push(r.value * (data.settings.stage_weights[r.stage] ?? 0));
        const versions = data.oppHistory.filter((h) => h.opportunity_id === r.id && h.effective_at <= t).sort((a, b) => a.effective_at - b.effective_at);
        for (const v of versions) {
          out.push(v.proposed_value_inr, v.confirmed_value_inr, Math.floor((t - v.effective_at) / DAY_MS), dayDiff(istDateOf(v.effective_at), d));
          for (const w of versions) out.push(Math.abs(dayDiff(istDateOf(v.effective_at), istDateOf(w.effective_at))));
        }
        const inst = installmentRows(data, d).filter((p) => p.opportunity_id === r.id);
        out.push(inst.length);
        for (const p of inst) out.push(p.amount_due_inr, p.amount_paid_inr, Math.abs(dayDiff(istDateOf(p.due_at), d)));
      }
      if (type === "task") {
        out.push(oppIds.length, rows.reduce((a, r) => a + r.value, 0));
      }
      if (type === "installment") {
        for (const p of installmentRows(data, d).filter((x) => x.installment_id === id)) out.push(p.amount_due_inr, p.amount_paid_inr, Math.abs(dayDiff(istDateOf(p.due_at), d)));
      }
    } else {
      out.push(...campaignFacts(data, [id], d));
    }
  }
  return out;
}

function campaignFacts(data: Dataset, ids: readonly string[], d: string): number[] {
  const out: number[] = [];
  const rows = campaignRows(data, d).filter((c) => ids.includes(c.sponsor_campaign_id));
  for (const c of rows) numbersOf({ m: c.metrics, d: c.decision, b: c.budget, s: c.spend, r: c.cash_per_rupee_spent, mr: c.meeting_rate, wr: c.win_rate }, out);
  const b = budgets(data, d);
  for (const id of ids) if (b[id]) out.push(b[id].planned, b[id].spent, Math.abs(b[id].planned - b[id].spent));
  for (const c of rows) if (c.metrics.confirmed_partnerships > 0) out.push(Math.round(c.spend / c.metrics.confirmed_partnerships));
  if (ids.length > 1) {
    // Sums over the group: budget, spend and every snapshot metric.
    const sum = (f: (id: string) => number) => ids.reduce((a, id) => a + f(id), 0);
    out.push(sum((id) => b[id]?.planned ?? 0), sum((id) => b[id]?.spent ?? 0));
    for (const k of Object.keys(rows[0]?.metrics ?? {})) {
      const vals = rows.map((r) => (r.metrics as unknown as Record<string, unknown>)[k]);
      if (vals.every((v) => typeof v === "number")) out.push((vals as number[]).reduce((a, v) => a + v, 0));
    }
  }
  const conv = stageConversion(data, d);
  for (const r of conv.byCampaign.filter((x) => ids.includes(x.key))) numbersOf({ c: r.counts, s: r.steps }, out);
  const open = pipelineRows(data, d).filter((r) => r.stage_group === "open" && r.sponsor_campaign_id && ids.includes(r.sponsor_campaign_id));
  const owners = new Map<string, number>();
  for (const r of open) owners.set(r.owner_id ?? "", (owners.get(r.owner_id ?? "") ?? 0) + 1);
  out.push(...owners.values());
  if (ids.length > 1) {
    // A group of campaigns: its own snapshot (distinct brands) and, for a channel group, the group's conversion.
    numbersOf(computeSnapshot(data, d, { campaignIds: ids }), out);
    for (const g of conv.byGroup) if ([...CHANNEL_GROUPS[g.key as "warm" | "cold"]].sort().join() === [...ids].sort().join()) numbersOf({ c: g.counts, s: g.steps }, out);
  }
  return out;
}

const matches = (n: TextNumber, facts: readonly number[]) =>
  facts.some((f) => {
    const tol = n.tolerance + 1e-9;
    if (Math.abs(f - n.value) <= tol) return true;
    if (n.percent && Math.abs(f * 100 - n.value) <= tol) return true;
    return false;
  });

// ---------------------------------------------------------------- V2
interface Scope {
  ids: string[];
  type: EntityType;
  text: string;
}

const SPECIFIC: Record<EntityType, EntityType[]> = { installment: ["opportunity", "campaign"], opportunity: ["campaign"], task: ["campaign"], campaign: [] };

/** Index of the ")" that closes the "(" before `from`, or -1. */
function closingParen(s: string, from: number): number {
  let depth = 1;
  for (let i = from; i < s.length; i++) {
    if (s[i] === "(") depth += 1;
    else if (s[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

/** Where a scope that starts at `from` ends: a clause break (";", ", and", ", but", ", while") or the end. */
function clauseEnd(s: string, from: number): number {
  const m = /;|,\s+(?:and|but|while|whereas|so)\s|\s\+\s/.exec(s.slice(from));
  return m ? from + m.index : s.length;
}

/**
 * Splits a sentence or table row into scopes: an id (or a run of ids of one kind, "O053, O038 and O043")
 * and the text that describes it. An id written in parentheses ("Cedar Pantry (O028, ₹1,10,000)") owns the
 * parenthesis plus a following relative clause ("..., which has had no update for 73 days"); other ids own
 * the text up to the next owning id or clause break. A campaign written after a deal, installment or task,
 * or a deal after an installment, is an attribute of it, not a new owner. Numbers before the first id
 * (ranks, "six of them") belong to no id.
 */
function scopesOf(segment: string): Scope[] {
  const table = /^\s*\|/.test(segment);
  const ids = idsIn(segment);
  const scopes: Scope[] = [];
  const seen: EntityType[] = [];
  let i = 0;
  while (i < ids.length) {
    const m = ids[i];
    // "negotiating in SC01", "from SC03": a campaign named as a place is not what the numbers describe.
    const place = m.type === "campaign" && /\b(?:in|from|via|through|of|under)\s+$/i.test(segment.slice(Math.max(0, m.index - 10), m.index));
    const attribute = place || seen.some((t) => SPECIFIC[t].includes(m.type));
    if (!seen.includes(m.type)) seen.push(m.type);
    // run of same-kind ids
    let j = i;
    while (j + 1 < ids.length && ids[j + 1].type === m.type && /^[\s,&/]*(?:and|or)?[\s,&/]*$/.test(segment.slice(ids[j].end, ids[j + 1].index))) j += 1;
    const runEnd = ids[j].end;
    const nextOwner = ids.slice(j + 1).find((x) => x.type === m.type || ![...seen].some((t) => SPECIFIC[t].includes(x.type)));
    let end = nextOwner ? nextOwner.index : segment.length;
    if (!table) {
      const inParen = /\(\s*$/.test(segment.slice(0, m.index));
      if (inParen) {
        const close = closingParen(segment, runEnd);
        if (close >= 0) {
          const rel = /^\s*,?\s*(?:which|that|is|was|has|had|at|with|worth|owned|last|in)\b/i.test(segment.slice(close + 1));
          end = Math.min(end, rel ? clauseEnd(segment, close + 1) : close);
        }
      } else end = Math.min(end, clauseEnd(segment, runEnd));
    }
    if (!attribute) scopes.push({ ids: ids.slice(i, j + 1).map((x) => x.id), type: m.type, text: segment.slice(runEnd, Math.max(runEnd, end)) });
    i = j + 1;
  }
  return scopes;
}

/** As of dates an answer may use: the simulation date and every date passed to a tool. */
export function datesUsed(data: Dataset, tools: readonly { input: unknown }[]): string[] {
  const out = new Set<string>([data.settings.simulation_date]);
  for (const t of tools) {
    const i = (t.input ?? {}) as Record<string, unknown>;
    for (const k of ["as_of", "date_a", "date_b"]) if (typeof i[k] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(i[k] as string)) out.add(i[k] as string);
  }
  return [...out];
}

const OWN_ID_KEYS = ["installment_id", "task_id", "opportunity_id", "sponsor_campaign_id"];
const ID_AT_START = new RegExp(`^(${ID_SOURCE})`);

/**
 * Figures the engine attributed to each id in this question's tool results: the numbers of an object
 * whose own id is that id (most specific id key wins), and values under a key that starts with the id
 * ("SC01 Brand Discovery Email": { count: 3 } in a summary). Ranks are left out.
 */
export function idFigures(results: readonly unknown[]): Map<string, number[]> {
  const m = new Map<string, number[]>();
  const add = (id: string, v: unknown) => {
    const arr = m.get(id) ?? [];
    const walk = (x: unknown, key: string) => {
      if (typeof x === "number" && Number.isFinite(x) && key !== "rank") arr.push(x);
      else if (Array.isArray(x)) x.forEach((y) => walk(y, key));
      else if (x && typeof x === "object") for (const [k, y] of Object.entries(x)) walk(y, k);
    };
    walk(v, "");
    m.set(id, arr);
  };
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const own = OWN_ID_KEYS.map((k) => o[k]).find((x): x is string => typeof x === "string");
      if (own) add(own, o);
      for (const [k, x] of Object.entries(o)) {
        const id = ID_AT_START.exec(k)?.[1];
        if (id) add(id, x);
        visit(x);
      }
    }
  };
  results.forEach(visit);
  return m;
}

/**
 * V2: "<id(s)>: <number>" for every number next to an id that is not one of the engine's figures for
 * that record (computed here from the dataset, or returned for that id by the engine through this
 * question's tool calls, `toolResults`).
 */
export function idNumberMismatches(answer: string, data: Dataset, tools: readonly { input: unknown }[], toolResults: readonly unknown[] = []): string[] {
  const dates = datesUsed(data, tools);
  const fromTools = idFigures(toolResults);
  const bad: string[] = [];
  // "₹5,92,500 for SC02", "27% in SC03": the number belongs to the id after it.
  const before = new RegExp(String.raw`(₹\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?%?)\s+(?:for|in)\s+(${ID_SOURCE})`, "g");
  for (const seg of segmentsOf(plainText(answer))) {
    for (const s of scopesOf(seg.replace(before, "$2 $1"))) {
      // Shown arithmetic ("(4889 ÷ 857 = 5.70)") is checked by the grounding check, not here.
      const nums = quantitiesIn(s.text.replace(/\(tie\)/gi, "").replace(/\([^()]*[=÷×][^()]*\)/g, ""));
      if (!nums.length) continue;
      const facts = s.type === "campaign" && s.ids.length > 1 ? dates.flatMap((d) => campaignFacts(data, s.ids, d)) : s.ids.flatMap((id) => factsFor(data, id, s.type, dates));
      for (const id of s.ids) facts.push(...(fromTools.get(id) ?? []));
      if (s.ids.length > 1 && s.type !== "campaign") {
        // A run of deals: also their sum per figure kind (e.g. "together ₹1,80,000").
        for (const d of dates) {
          const rows = pipelineRows(data, d).filter((r) => s.ids.includes(r.id));
          facts.push(rows.reduce((a, r) => a + r.value, 0), rows.reduce((a, r) => a + r.proposed_value_inr, 0), rows.length);
        }
      }
      for (const n of nums) if (!matches(n, facts)) bad.push(`${s.ids.join(", ")}: ${n.raw}`);
    }
  }
  return [...new Set(bad)];
}

// ---------------------------------------------------------------- V1 auto checks
export interface AutoCheckSpec {
  kind: "oldest_open_deal" | "owner_share_of_campaign_open_deals" | "campaign_open_total" | "open_deals_not_updated_over" | "stale_open_count";
  as_of?: string;
  campaign_id?: string;
  owner_id?: string;
  days?: number;
  setup?: { stale_days?: number };
}

export interface AutoExpected {
  ids: string[];
  /** ids must match exactly (no other opportunity ids in the answer) */
  exact_ids: boolean;
  names: string[];
  numbers: number[];
  as_of: string;
  summary: string;
}

/** Expected values for an auto check, computed from the engine on the data as it is now. */
export function expectedFor(spec: AutoCheckSpec, data: Dataset): AutoExpected {
  const d = spec.as_of ?? data.settings.simulation_date;
  const open = pipelineRows(data, d).filter((r) => r.stage_group === "open");
  switch (spec.kind) {
    case "oldest_open_deal": {
      const oldest = [...open].sort((a, b) => a.last_update - b.last_update || a.id.localeCompare(b.id));
      const top = oldest.filter((r) => r.days_since_update === oldest[0].days_since_update);
      return { ids: top.map((r) => r.id), exact_ids: false, names: top.map((r) => r.brand_name ?? ""), numbers: [top[0].days_since_update], as_of: d, summary: `${top.map((r) => `${r.id} ${r.brand_name}`).join(", ")}, ${top[0].days_since_update} days` };
    }
    case "owner_share_of_campaign_open_deals": {
      const inCampaign = open.filter((r) => r.sponsor_campaign_id === spec.campaign_id);
      const owned = inCampaign.filter((r) => r.owner_id === spec.owner_id);
      return { ids: [], exact_ids: false, names: [], numbers: [owned.length, inCampaign.length], as_of: d, summary: `${owned.length} of ${inCampaign.length}` };
    }
    case "campaign_open_total": {
      const rows = open.filter((r) => r.sponsor_campaign_id === spec.campaign_id);
      const total = rows.reduce((a, r) => a + r.proposed_value_inr, 0);
      return { ids: [], exact_ids: false, names: [], numbers: [total, rows.length], as_of: d, summary: `₹${total} across ${rows.length} deals` };
    }
    case "open_deals_not_updated_over": {
      const rows = open.filter((r) => r.days_since_update > (spec.days ?? 0)).sort((a, b) => a.id.localeCompare(b.id));
      return { ids: rows.map((r) => r.id), exact_ids: true, names: [], numbers: [], as_of: d, summary: rows.map((r) => r.id).join(", ") };
    }
    case "stale_open_count": {
      const n = computeSnapshot(data, d).stale_open_opportunities_7d;
      return { ids: [], exact_ids: false, names: [], numbers: spec.setup?.stale_days ? [n, spec.setup.stale_days] : [n], as_of: d, summary: `${n}${spec.setup?.stale_days ? ` (stale days ${spec.setup.stale_days})` : ""}` };
    }
  }
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** True when the answer states the date (20 Apr 2025, 20 April 2025, 2025-04-20, April 20, 2025). */
export function statesDate(answer: string, iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const forms = [iso, `${d} ${MONTH[m - 1]} ${y}`, `${d} ${LONG[m - 1]} ${y}`, `${MONTH[m - 1]} ${d}, ${y}`, `${LONG[m - 1]} ${d}, ${y}`];
  const t = plainText(answer).toLowerCase();
  return forms.some((f) => t.includes(f.toLowerCase()));
}

export interface AutoResult {
  pass: boolean;
  expected: string;
  problems: string[];
}

export function gradeAuto(answer: string, exp: AutoExpected): AutoResult {
  const problems: string[] = [];
  const t = plainText(answer);
  const mentioned = [...new Set(idsIn(t).filter((m) => m.type === "opportunity").map((m) => m.id))];
  for (const id of exp.ids) if (!mentioned.includes(id)) problems.push(`missing ${id}`);
  if (exp.exact_ids) for (const id of mentioned) if (!exp.ids.includes(id)) problems.push(`extra ${id}`);
  for (const n of exp.names) if (!t.toLowerCase().includes(n.toLowerCase())) problems.push(`missing name ${n}`);
  const nums = quantitiesIn(t);
  for (const n of exp.numbers) if (!nums.some((x) => Math.abs(x.value - n) <= x.tolerance + 1e-9)) problems.push(`missing number ${n}`);
  if (!statesDate(answer, exp.as_of)) problems.push(`as of date ${exp.as_of} not stated`);
  return { pass: problems.length === 0, expected: exp.summary, problems };
}
