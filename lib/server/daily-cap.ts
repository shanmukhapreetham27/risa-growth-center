/**
 * Global cost guard (REVIEWER NOTE 06 P1): at most 300 /api/chat requests per day across all users,
 * on top of the 30 per hour per IP limit (rate-limit.ts). Counted in the database (copilot_usage, one
 * row per IST calendar day), so it holds across serverless instances and restarts and resets at
 * midnight IST. The increment is one statement, so concurrent requests cannot overshoot the cap.
 */
import type { Sql } from "../db/client";
import { DAY_MS, IST_OFFSET_MS } from "../engine/time";

export const CHAT_LIMIT_PER_DAY = 300;

export interface DailySlot {
  ok: boolean;
  /** requests counted today, including this one when ok */
  used: number;
  limit: number;
  /** seconds until midnight IST, when the count starts again */
  resetInS: number;
}

export function secondsToIstMidnight(now = Date.now()): number {
  const ist = now + IST_OFFSET_MS;
  return Math.ceil((Math.floor(ist / DAY_MS) * DAY_MS + DAY_MS - ist) / 1000);
}

export async function takeDailySlot(sql: Sql, limit = CHAT_LIMIT_PER_DAY, now = Date.now()): Promise<DailySlot> {
  const day = new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
  const rows = await sql<{ requests: number }[]>`
    insert into copilot_usage (day, requests) values (${day}::date, 1)
    on conflict (day) do update set requests = copilot_usage.requests + 1 where copilot_usage.requests < ${limit}
    returning requests`;
  if (rows.length) return { ok: true, used: rows[0].requests, limit, resetInS: secondsToIstMidnight(now) };
  const [cur] = await sql<{ requests: number }[]>`select requests from copilot_usage where day = ${day}::date`;
  return { ok: false, used: cur?.requests ?? limit, limit, resetInS: secondsToIstMidnight(now) };
}
