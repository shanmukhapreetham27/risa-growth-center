/**
 * Entity ids in copilot text (REVIEWER NOTE 06 E2, V2): opportunities (O028, APP-O-1), campaigns (SC01,
 * APP-SC-1), installments (PAY033, APP-PAY-1) and tasks (TSK001, APP-TSK-1). Shared by the grounding
 * check (an id must come from a tool result and the name beside it must be that id's record) and by the
 * eval's id-number check. Pure: no database.
 */
import type { Dataset } from "../engine/types";

export type EntityType = "opportunity" | "campaign" | "installment" | "task";

export const ID_SOURCE = String.raw`\b(?:APP-(?:O|SC|PAY|TSK)-\d+|O\d{3}|SC\d{2}|PAY\d{3}|TSK\d{3})\b`;
export const idRegex = () => new RegExp(ID_SOURCE, "g");

export function entityType(id: string): EntityType {
  if (/^(?:APP-O-|O)\d/.test(id)) return "opportunity";
  if (/^(?:APP-SC-|SC)\d/.test(id)) return "campaign";
  if (/^(?:APP-PAY-|PAY)\d/.test(id)) return "installment";
  return "task";
}

export interface IdMention {
  id: string;
  type: EntityType;
  index: number;
  end: number;
}

export function idsIn(text: string): IdMention[] {
  return [...text.matchAll(idRegex())].map((m) => ({ id: m[0], type: entityType(m[0]), index: m.index, end: m.index + m[0].length }));
}

/** Markdown emphasis and code marks removed (same length is not kept; callers work on the result). */
export const plainText = (text: string) => text.replace(/\*\*|__|`/g, "").replace(/(^|\s)[*_](?=\S)|(?<=\S)[*_](?=\s|$|[.,;:)])/g, "$1");

/** Ids and names of the records the copilot may name. Names are compared lower case. */
export interface RecordIndex {
  /** id -> accepted names (brand and opportunity name; campaign name; installment's brand; task title) */
  names: Map<string, string[]>;
  /** id -> main display name */
  display: Map<string, string>;
  /** names by entity type, longest first, for spotting a name in text */
  universe: Record<EntityType, string[]>;
  /** brand id (A001, APP-A-1) -> brand name; a brand id also counts as the id of its deals' brand name */
  brands: Map<string, string>;
}

const BRAND_ID = /\b(?:APP-A-\d+|A\d{3})\b/g;

const lc = (s: string) => s.trim().toLowerCase();

export function buildRecordIndex(data: Dataset): RecordIndex {
  const names = new Map<string, string[]>();
  const display = new Map<string, string>();
  const add = (id: string, main: string | null, ...more: (string | null | undefined)[]) => {
    const all = [main, ...more].filter((x): x is string => !!x && x.trim().length > 1).map(lc);
    names.set(id, [...new Set(all)]);
    if (main) display.set(id, main);
  };
  const brandOf = new Map<string, string | null>();
  for (const o of data.opportunities) {
    add(o.opportunity_id, o.brand_name ?? o.opportunity_name, o.opportunity_name);
    brandOf.set(o.opportunity_id, o.brand_name);
  }
  for (const c of data.campaigns) add(c.sponsor_campaign_id, c.campaign_name);
  for (const p of data.payments) add(p.installment_id, p.brand_name ?? brandOf.get(p.opportunity_id) ?? null, p.opportunity_name);
  for (const t of data.tasks) add(t.task_id, t.title);
  const sortLong = (xs: Iterable<string>) => [...new Set(xs)].sort((a, b) => b.length - a.length);
  const ofType = (type: EntityType) => sortLong([...names.entries()].filter(([id]) => entityType(id) === type).flatMap(([, n]) => n));
  const brands = new Map((data.brands ?? []).map((b) => [b.brand_id, lc(b.brand_name)]));
  return { names, display, universe: { opportunity: ofType("opportunity"), campaign: ofType("campaign"), installment: ofType("installment"), task: ofType("task") }, brands };
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/** The longest name from `candidates` that starts exactly at `pos` (whole words), or null. */
function nameAt(lower: string, pos: number, candidates: readonly string[]): string | null {
  for (const n of candidates) if (lower.startsWith(n, pos) && !isWordChar(lower[pos + n.length])) return n;
  return null;
}

/** The longest name from `candidates` that ends exactly at `end` (whole words), or null. */
function nameEndingAt(lower: string, end: number, candidates: readonly string[]): string | null {
  for (const n of candidates) {
    const start = end - n.length;
    if (start >= 0 && lower.slice(start, end) === n && !isWordChar(lower[start - 1])) return n;
  }
  return null;
}

/**
 * Names written right beside an id that belong to a different record of the same kind:
 * "O036 Evergreen Threads", "O036 (Evergreen Threads)", "| O036 | Evergreen Threads |" or
 * "Evergreen Threads (O036". Returns one message per mismatch.
 */
export function nameMismatches(text: string, index: RecordIndex): string[] {
  const t = plainText(text);
  const lower = t.toLowerCase();
  const out: string[] = [];
  for (const m of idsIn(t)) {
    const own = index.names.get(m.id);
    if (!own) continue; // unknown ids are reported by the id check
    const pool = index.universe[m.type];
    const found: { name: string; pos: number }[] = [];
    const gap = /^[ \t|:,(–—-]*/.exec(t.slice(m.end))![0].length;
    const a = nameAt(lower, m.end + gap, pool);
    if (a) found.push({ name: a, pos: m.end + gap });
    const before = /[ \t]*\([ \t]*$/.exec(t.slice(0, m.index));
    if (before) {
      const end = m.index - before[0].length;
      const b = nameEndingAt(lower, end, pool);
      if (b) found.push({ name: b, pos: end - b.length });
    }
    for (const f of found)
      if (!own.includes(f.name)) {
        const msg = `${m.id} is ${index.display.get(m.id) ?? own[0]}, not "${t.substr(f.pos, f.name.length)}"`;
        if (!out.includes(msg)) out.push(msg);
      }
  }
  return out;
}

/** Splits text into table rows and sentences; each piece is where an id and its name or numbers must sit together. */
export function segmentsOf(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (/^\s*\|/.test(line)) {
      if (!/^\s*\|[\s:|-]+\|?\s*$/.test(line)) out.push(line);
      continue;
    }
    out.push(...line.split(/(?<=[.;!?])\s+(?=[A-Z0-9₹*("'[])/).filter((s) => s.trim()));
  }
  return out;
}

/**
 * Opportunity and campaign names written without their id in the same sentence or table row (E2:
 * every answer and proposal that names one must include its id).
 */
export function namesWithoutIds(text: string, index: RecordIndex): string[] {
  const out: string[] = [];
  const pools: EntityType[] = ["opportunity", "campaign"];
  for (const seg of segmentsOf(plainText(text))) {
    const lower = seg.toLowerCase();
    const segIds = idsIn(seg).map((m) => m.id);
    // An installment id also covers its deal's brand name (both are in its accepted names).
    const covered = new Set(segIds.flatMap((id) => index.names.get(id) ?? []));
    for (const b of seg.match(BRAND_ID) ?? []) if (index.brands.has(b)) covered.add(index.brands.get(b)!); // "A001 Beardo"
    for (const type of pools) {
      let pos = 0;
      while (pos < lower.length) {
        const n = isWordChar(lower[pos - 1]) ? null : nameAt(lower, pos, index.universe[type]);
        if (!n) {
          pos += 1;
          continue;
        }
        const shown = seg.substr(pos, n.length);
        if (!covered.has(n) && !out.includes(shown)) out.push(shown);
        pos += n.length;
      }
    }
  }
  return out;
}

/** Every id that appears in a JSON value (string values and object keys, nested). */
export function idsInJson(v: unknown, into: Set<string>): void {
  if (typeof v === "string") for (const m of v.matchAll(idRegex())) into.add(m[0]);
  else if (Array.isArray(v)) for (const x of v) idsInJson(x, into);
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      for (const m of k.matchAll(idRegex())) into.add(m[0]);
      idsInJson(x, into);
    }
}
