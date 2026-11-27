/**
 * Grounding check (SPEC §6.3 rules 3, 10, 11; CONTEXT §6.5; REVIEWER NOTE 06 E2 to E4). Run on every
 * final answer and on every proposal's title, notes or reason before the card is shown:
 * - numbers: every number must come from a tool result (read tools or calculate) or the user's own words
 *   in this conversation. Ignored: dates and times, ids, list numbering, years, and whole numbers up to
 *   10 that do not count items. Rounding is tolerated at the precision shown; ratios match percentages;
 *   ₹22.4L and 18.4 lakh match rupees.
 * - ids: every opportunity, campaign, installment or task id must appear in a tool result (or an app note);
 *   the name written beside it must be that id's record; a deal or campaign named without its id is reported.
 * - counts: small whole numbers and number words (one to ten) that count items ("two of them", "3 deals")
 *   must come from a tool result or calculate call made for this answer (this turn), or the user's words.
 * - ranges ("30 to 47 days"): both ends must be a min and max pair from a tool summary this turn, or both
 *   calculate results this turn.
 * Any problem goes back to the model once per request; anything left is shown to the user as a notice.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { idsIn, idsInJson, nameMismatches, namesWithoutIds, type RecordIndex } from "./ids";

export const GROUNDING_NOTE_PREFIX = "[App note] Grounding check:";
const APP_NOTE_PREFIX = "[App note]";

const MONTHS = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?";
export const NUMBER_WORDS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const WORD_ALT = Object.keys(NUMBER_WORDS).join("|");

/** Remove text whose digits are not quantities: dates, times, ids, years, list markers. */
export function stripNonQuantities(text: string): string {
  return text
    .replace(/\d{4}-\d{2}-\d{2}(T[\d:.+Z-]*)?/g, " ")
    .replace(new RegExp(`\\b\\d{1,2}(?:\\s*(?:–|-|to|and)\\s*\\d{1,2})?\\s+${MONTHS}(?:\\s+\\d{4})?`, "gi"), " ")
    .replace(new RegExp(`\\b${MONTHS}\\s+\\d{1,2}(?:,?\\s+\\d{4})?`, "gi"), " ")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?/g, " ")
    .replace(/\b[A-Za-z]+[-_]?[A-Za-z]*-?\d+[A-Za-z0-9-]*\b/g, " ") // O028, SC01, PAY033, APP-OH-1, P-1, Q14, T01
    .replace(/\b20[2-3]\d\b/g, " ")
    .replace(/^\s*\d+[.)]\s/gm, " ")
    .replace(/\bRule\s+\d+\b/gi, " ")
    .replace(/\*\*|__|`/g, "");
}

export interface TextNumber {
  raw: string;
  value: number;
  tolerance: number;
  percent: boolean;
}

const NUM = String.raw`(₹\s?)?([−-])?(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d+)?\s*(%|\s?(?:L\b|lakh|Cr\b|crore))?`;

function parseNumber(m: RegExpMatchArray): TextNumber {
  const whole = m[3].replace(/,/g, "");
  const dec = m[4] ?? "";
  const unit = (m[5] ?? "").trim().toLowerCase();
  let value = Number(`${whole}${dec}`);
  const decimals = dec ? dec.length - 1 : 0;
  let tolerance = decimals ? 0.5 * 10 ** -decimals : 0.5;
  if (unit === "l" || unit === "lakh") {
    value *= 1e5;
    tolerance *= 1e5;
  } else if (unit === "cr" || unit === "crore") {
    value *= 1e7;
    tolerance *= 1e7;
  }
  return { raw: m[0].trim(), value, tolerance, percent: unit === "%" };
}

/** Every quantity in text, small whole numbers and number words (one to ten) included; dates, ids and list markers excluded. */
export function quantitiesIn(text: string): TextNumber[] {
  const t = stripNonQuantities(text);
  const out: TextNumber[] = [...t.matchAll(new RegExp(NUM, "gi"))].map((m) => parseNumber(m));
  // Number words only where they count items ("nine open deals", "two of them"), not "if you want one".
  for (const c of countsInText(t)) {
    const word = c.raw.toLowerCase().match(new RegExp(`\\b(${WORD_ALT})\\b`));
    if (word && NUMBER_WORDS[word[1]] === c.value) out.push({ raw: c.raw, value: c.value, tolerance: 0, percent: false });
  }
  return out;
}

export function numbersInText(text: string): TextNumber[] {
  const out: TextNumber[] = [];
  for (const m of stripNonQuantities(text).matchAll(new RegExp(NUM, "gi"))) {
    const plainSmall = !m[1] && !m[4] && !(m[5] ?? "").trim() && Number(m[3].replace(/,/g, "")) <= 10;
    if (plainSmall) continue; // small whole numbers are checked only when they count items (countsInText)
    out.push(parseNumber(m));
  }
  return out;
}

// ---------------------------------------------------------------- counts (E3)
const COUNT_NOUN = "(?:deals?|opportunit(?:y|ies)|installments?|payments?|tasks?|campaigns?|brands?|partnerships?|proposals?|owners?|items?|rows?|sponsors?|contacts?|cards?|invoices?|leads?|channels?)";
const STOP = new Set(
  "per each for a an the in of to at on by with than from is are was were and or that which who as it its this these those be been has have had more less fewer over under about after before into not no only also".split(" "),
);

export interface CountClaim {
  raw: string;
  value: number;
}

const countValue = (tok: string) => (/^\d+$/.test(tok) ? Number(tok) : NUMBER_WORDS[tok.toLowerCase()]);

/** Small whole numbers and number words (0 to 10) that count items. Ranks and list numbers are not counts. */
export function countsInText(text: string): CountClaim[] {
  const t = stripNonQuantities(text);
  const out: CountClaim[] = [];
  const push = (raw: string, tok: string) => {
    const v = countValue(tok);
    if (v !== undefined && v <= 10 && !out.some((c) => c.raw === raw && c.value === v)) out.push({ raw, value: v });
  };
  const N = `(\\d{1,2}|${WORD_ALT})`;
  // "3 deals", "four negotiating deals", "two proposal cards"
  for (const m of t.matchAll(new RegExp(`(^|[^\\w#₹.,])${N}((?:\\s+[A-Za-z-]+){0,3}?)\\s+${COUNT_NOUN}\\b`, "gi"))) {
    const before = t.slice(Math.max(0, m.index - 12), m.index + m[1].length).toLowerCase();
    if (/(rank|ranks|no\.|number|#|step|round|version|per|each|any|which)\s*$/.test(before)) continue;
    const between = m[3].trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (between.some((w) => STOP.has(w))) continue;
    if (m[2].toLowerCase() === "one" && /\b(no|any|each|every|which|the)\s*$/.test(before)) continue;
    if (/^\s+(?:per|each|for each|at a time)\b/i.test(t.slice(m.index + m[0].length))) continue; // "one task per owner" is not a count
    push(m[0].slice(m[1].length).trim(), m[2]);
  }
  // "two of them", "3 of the 4", "9 of 9"
  for (const m of t.matchAll(new RegExp(`\\b${N}\\s+of\\s+(?:(them|these|those|which|all)\\b|(?:the|its|her|his|their|our)\\s+${N}\\b|${N}\\b)`, "gi"))) {
    push(m[0].trim(), m[1]);
    const second = m[3] ?? m[4];
    if (second) push(m[0].trim(), second);
  }
  // "all three", "all 9"
  for (const m of t.matchAll(new RegExp(`\\ball\\s+${N}\\b`, "gi"))) push(m[0].trim(), m[1]);
  return out;
}

// ---------------------------------------------------------------- ranges (E3)
export interface RangeClaim {
  raw: string;
  a: TextNumber;
  b: TextNumber;
}

export function rangesInText(text: string): RangeClaim[] {
  const t = stripNonQuantities(text);
  const out: RangeClaim[] = [];
  const second = (m: RegExpMatchArray) => parseNumber([m[0], ...m.slice(6)] as unknown as RegExpMatchArray);
  const add = (m: RegExpMatchArray) => {
    if (/(rank|ranks|#|positions?|rows?|steps?|items?|no\.)\s*$/i.test(t.slice(Math.max(0, m.index! - 12), m.index))) return; // "ranks 2 to 7"
    const a = parseNumber(m);
    const b = second(m);
    if (a.percent || b.percent) a.percent = b.percent = true;
    if (!out.some((r) => r.raw === m[0].trim())) out.push({ raw: m[0].trim(), a, b });
  };
  for (const m of t.matchAll(new RegExp(`${NUM}\\s*(?:days?\\s+)?(?:to|–|—|-)\\s*${NUM}`, "gi"))) add(m);
  for (const m of t.matchAll(new RegExp(`between\\s+${NUM}\\s+and\\s+${NUM}`, "gi"))) add(m);
  return out;
}

// ---------------------------------------------------------------- sources
function collectNumbers(v: unknown, into: number[]): void {
  if (typeof v === "number" && Number.isFinite(v)) into.push(v);
  else if (typeof v === "string") for (const n of numbersInText(v)) into.push(n.value);
  else if (Array.isArray(v)) for (const x of v) collectNumbers(x, into);
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      if (k === "expression") continue; // calculate: trust the result, not the operands the model typed
      collectNumbers(x, into);
    }
}

const isGroundingNote = (b: { type: string; text?: string }) => b.type === "text" && !!b.text?.startsWith(GROUNDING_NOTE_PREFIX);

function userTexts(messages: Anthropic.MessageParam[]): string[] {
  const out: string[] = [];
  for (const m of messages) {
    if (m.role !== "user") continue;
    if (typeof m.content === "string") out.push(m.content);
    else for (const b of m.content) if (b.type === "text" && !isGroundingNote(b)) out.push(b.text);
  }
  return out;
}

/** Parsed JSON of every successful tool result in the messages. */
export function toolResults(messages: Anthropic.MessageParam[]): unknown[] {
  const out: unknown[] = [];
  for (const m of messages) {
    if (m.role !== "user" || typeof m.content === "string") continue;
    for (const b of m.content) {
      if (b.type !== "tool_result" || b.is_error) continue;
      const c = b.content;
      const texts = typeof c === "string" ? [c] : (c ?? []).flatMap((x) => (x.type === "text" ? [x.text] : []));
      for (const t of texts) {
        try {
          out.push(JSON.parse(t));
        } catch {
          out.push(t);
        }
      }
    }
  }
  return out;
}

/** Index of the user message that started this turn (the last one with text the user or the app wrote, not a grounding note). */
export function turnStart(messages: Anthropic.MessageParam[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return i;
    if (m.content.some((b) => b.type === "text" && !isGroundingNote(b))) return i;
  }
  return 0;
}

/** Numbers the answer may use: everything in tool results and in what the user typed. */
export function knownNumbers(messages: Anthropic.MessageParam[]): number[] {
  const nums: number[] = [];
  for (const t of userTexts(messages)) collectNumbers(t, nums);
  for (const r of toolResults(messages)) collectNumbers(r, nums);
  const out = new Set<number>();
  for (const n of nums) {
    out.add(n);
    out.add(Math.abs(n));
    if (Math.abs(n) <= 10) out.add(Math.abs(n) * 100); // ratio shown as a percentage
  }
  return [...out];
}

const NOT_A_COUNT_KEY = /(inr|value|amount|rate|share|weight|days|day$|rank|_ms$|_at$|date|percent|ratio|per_rupee|budget|spend|cost|cash|^installment$|tolerance|version|^result$)/i;

/** Counts this turn can support: count fields and list lengths in this turn's tool results, calculate results, proposals made; plus the user's words. */
function countSources(messages: Anthropic.MessageParam[]): Set<number> {
  const s = new Set<number>();
  for (const t of userTexts(messages)) {
    for (const n of numbersInText(t)) s.add(n.value);
    for (const w of t.toLowerCase().match(new RegExp(`\\b(?:${WORD_ALT}|\\d{1,2})\\b`, "g")) ?? []) s.add(countValue(w)!);
  }
  const walk = (v: unknown, key: string) => {
    if (Array.isArray(v)) {
      s.add(v.length);
      for (const x of v) walk(x, key);
    } else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.expression === "string" && typeof o.result === "number") s.add(o.result);
      for (const [k, x] of Object.entries(o)) walk(x, k);
    } else if (typeof v === "number" && Number.isInteger(v) && !NOT_A_COUNT_KEY.test(key)) s.add(v);
  };
  const turn = toolResults(messages.slice(turnStart(messages)));
  for (const r of turn) walk(r, "");
  s.add(turn.filter((r) => !!(r as { proposal?: unknown } | null)?.proposal).length);
  return s;
}

/** Min and max pairs from this turn's tool results, and this turn's calculate results. */
function rangeSources(messages: Anthropic.MessageParam[]): { pairs: [number, number][]; calc: number[] } {
  const pairs: [number, number][] = [];
  const calc: number[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.min === "number" && typeof o.max === "number") pairs.push([o.min, o.max]);
      if (typeof o.expression === "string" && typeof o.result === "number") calc.push(o.result);
      Object.values(o).forEach(walk);
    }
  };
  for (const r of toolResults(messages.slice(turnStart(messages)))) walk(r);
  return { pairs, calc };
}

const near = (n: TextNumber, k: number) => Math.abs(k - n.value) <= n.tolerance + 1e-9 || (n.percent && Math.abs(k * 100 - n.value) <= n.tolerance + 1e-9);

// ---------------------------------------------------------------- checks
/** Raw tokens of numbers in `text` that no known number explains. */
export function findUnverifiedNumbers(text: string, messages: Anthropic.MessageParam[]): string[] {
  const known = knownNumbers(messages);
  const bad: string[] = [];
  for (const n of numbersInText(text)) {
    const ok = known.some((k) => Math.abs(k - n.value) <= n.tolerance + 1e-9);
    if (!ok && !bad.includes(n.raw)) bad.push(n.raw);
  }
  return bad;
}

export interface GroundingIssues {
  /** numbers not in any tool or calculate result or the user's words */
  numbers: string[];
  /** ids that no tool returned in this conversation */
  ids: string[];
  /** a name beside an id that is another record */
  names: string[];
  /** a deal or campaign named without its id */
  missing_ids: string[];
  /** counts not backed by this turn's tool results or calculate */
  counts: string[];
  /** ranges not from a tool summary's min and max or calculate this turn */
  ranges: string[];
}

export const noIssues = (g: GroundingIssues) => Object.values(g).every((x) => x.length === 0);

export function issueList(g: GroundingIssues): string[] {
  return [
    ...g.numbers,
    ...g.ids.map((x) => `id ${x}`),
    ...g.names,
    ...g.missing_ids.map((x) => `${x} (no id)`),
    ...g.counts.map((x) => `count "${x}"`),
    ...g.ranges.map((x) => `range "${x}"`),
  ];
}

/** All checks; `records` (ids and names of every record) enables the id and name checks. */
export function groundingIssues(text: string, messages: Anthropic.MessageParam[], records?: RecordIndex): GroundingIssues {
  const g: GroundingIssues = { numbers: findUnverifiedNumbers(text, messages), ids: [], names: [], missing_ids: [], counts: [], ranges: [] };
  if (records) {
    const known = new Set<string>();
    for (const r of toolResults(messages)) idsInJson(r, known);
    for (const t of userTexts(messages)) if (t.startsWith(APP_NOTE_PREFIX)) idsInJson(t, known);
    for (const m of idsIn(text)) if (!known.has(m.id) && !g.ids.includes(m.id)) g.ids.push(m.id);
    g.names = nameMismatches(text, records);
    g.missing_ids = namesWithoutIds(text, records);
  }
  const counts = countSources(messages);
  for (const c of countsInText(text)) if (!counts.has(c.value) && !g.counts.includes(c.raw)) g.counts.push(c.raw);
  const { pairs, calc } = rangeSources(messages);
  const user = knownNumbersFromUser(messages);
  for (const r of rangesInText(text)) {
    const fromPair = pairs.some(([lo, hi]) => (near(r.a, lo) && near(r.b, hi)) || (near(r.a, hi) && near(r.b, lo)));
    const fromCalc = calc.some((k) => near(r.a, k)) && calc.some((k) => near(r.b, k));
    const fromUser = user.some((k) => near(r.a, k)) && user.some((k) => near(r.b, k));
    if (!fromPair && !fromCalc && !fromUser && !g.ranges.includes(r.raw)) g.ranges.push(r.raw);
  }
  return g;
}

function knownNumbersFromUser(messages: Anthropic.MessageParam[]): number[] {
  const nums: number[] = [];
  for (const t of userTexts(messages)) if (!t.startsWith(APP_NOTE_PREFIX)) for (const n of numbersInText(t)) nums.push(n.value);
  return nums;
}

function describeIssues(g: GroundingIssues): string[] {
  const parts: string[] = [];
  if (g.numbers.length) parts.push(`numbers not in any tool or calculate result in this conversation: ${g.numbers.join(", ")}`);
  if (g.ids.length) parts.push(`ids no tool returned in this conversation: ${g.ids.join(", ")}`);
  if (g.names.length) parts.push(`names that do not match their id: ${g.names.join("; ")}`);
  if (g.missing_ids.length) parts.push(`deals or campaigns named without their id: ${g.missing_ids.join(", ")}`);
  if (g.counts.length) parts.push(`counts not taken from a tool result or calculate call made for this answer: ${g.counts.map((c) => `"${c}"`).join(", ")}`);
  if (g.ranges.length) parts.push(`ranges not taken from a tool summary's min and max or from calculate (min, max) for this answer: ${g.ranges.map((c) => `"${c}"`).join(", ")}`);
  return parts;
}

export function groundingNote(g: GroundingIssues): string {
  return `${GROUNDING_NOTE_PREFIX} problems in your last answer. ${describeIssues(g)
    .map((p, i) => `(${i + 1}) ${p}.`)
    .join(" ")} Fix each one: call the tool again (list tools return a summary with counts, totals, oldest, newest, largest and min/max ranges; pass opportunity_ids for a given set of deals) or use calculate, write every deal, campaign, installment or task as id plus name from the same tool row, or remove the claim. Then give your complete final answer again. Do not mention this check.`;
}

/** Error text for a proposal whose title, notes or reason fails the check (E4); the card is not shown. */
export function proposalRejection(g: GroundingIssues): string {
  return `Proposal not created: its text failed the grounding check. ${describeIssues(g)
    .map((p, i) => `(${i + 1}) ${p}.`)
    .join(" ")} Recompute with a tool or calculate, or remove those details, then call the propose tool again.`;
}
