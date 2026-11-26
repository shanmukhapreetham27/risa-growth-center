/**
 * IST time helpers (CLAUDE.md rule 4, CONTEXT §6.1). Every instant is epoch milliseconds.
 * Nothing here reads the machine time zone, so results are the same in IST (local) and UTC (Vercel, tests).
 */
export const IST_OFFSET_MS = 330 * 60 * 1000; // +05:30, no DST
export const DAY_MS = 86_400_000;
export const SECOND_MS = 1000;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses 'YYYY-MM-DD' strictly (rejects 2025-02-30). */
export function parseIsoDate(d: string): { y: number; m: number; day: number } {
  const m = DATE_RE.exec(d);
  if (!m) throw new Error(`Invalid date "${d}": expected YYYY-MM-DD`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, day));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== day)
    throw new Error(`Invalid date "${d}"`);
  return { y, m: mo, day };
}

export function isIsoDate(d: unknown): d is string {
  if (typeof d !== "string") return false;
  try {
    parseIsoDate(d);
    return true;
  } catch {
    return false;
  }
}

/** 00:00:00.000 IST on day d. */
export function istStartOfDay(d: string): number {
  const { y, m, day } = parseIsoDate(d);
  return Date.UTC(y, m - 1, day) - IST_OFFSET_MS;
}

/**
 * "As of date D" = end of day D in IST (SPEC §3). Instants are milliseconds, so this is
 * D 23:59:59.999 IST; `x <= istEndOfDay(D)` is the same test as Python's `x <= D 23:59:59.999999`
 * for any timestamp stored to the millisecond.
 */
export function istEndOfDay(d: string): number {
  return istStartOfDay(d) + DAY_MS - 1;
}

/** Instant of a wall clock time on day d in IST. */
export function istAt(d: string, hh: number, mm = 0, ss = 0): number {
  return istStartOfDay(d) + ((hh * 60 + mm) * 60 + ss) * SECOND_MS;
}

/** IST calendar date ('YYYY-MM-DD') of an instant. */
export function istDateOf(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Day d at the current IST wall clock time (stamp rule, SPEC §2.4). */
export function istWallClockOn(d: string, now: number = Date.now()): number {
  const msOfDay = (((now + IST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS;
  return istStartOfDay(d) + msOfDay;
}

export function addDays(d: string, n: number): string {
  const { y, m, day } = parseIsoDate(d);
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
}

/** Inclusive list of dates from..to. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** ISO string in IST, e.g. 2025-04-20T15:00:00.000+05:30. */
export function toIstIso(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().replace("Z", "+05:30");
}
