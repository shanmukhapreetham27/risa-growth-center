/**
 * REVIEWER NOTE 06 P1: the global copilot cap (300 requests per IST day) is counted in the database,
 * stops at the cap even under concurrent requests, starts again on the next IST day, and survives
 * "Reset to original data". Runs on DATABASE_URL_TEST only.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "../lib/db/client";
import { resetDatabase } from "../lib/db/reset";
import { CHAT_LIMIT_PER_DAY, secondsToIstMidnight, takeDailySlot } from "../lib/server/daily-cap";
import { resetTestDb, testSql } from "./helpers";

let sql: Sql;
// 23:59:30 IST on 1 Jan 2030 and 00:00:30 IST on 2 Jan 2030: far from real days, so real usage rows never collide.
const lateDay = Date.UTC(2030, 0, 1, 18, 29, 30);
const nextDay = lateDay + 60_000;

beforeAll(async () => {
  sql = testSql();
  await resetTestDb(sql);
  await sql`delete from copilot_usage where day >= '2030-01-01'`;
});
afterAll(async () => {
  await sql`delete from copilot_usage where day >= '2030-01-01'`;
  await sql?.end();
});

describe("daily copilot cap", () => {
  it("is 300 per day", () => {
    expect(CHAT_LIMIT_PER_DAY).toBe(300);
    expect(secondsToIstMidnight(lateDay)).toBe(30);
  });
  it("allows requests up to the cap, then refuses, also when they arrive together", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => takeDailySlot(sql, 3, lateDay)));
    expect(results.filter((r) => r.ok).length).toBe(3);
    expect(results.filter((r) => !r.ok).every((r) => r.used === 3 && r.resetInS === 30)).toBe(true);
  });
  it("starts again at midnight IST", async () => {
    expect((await takeDailySlot(sql, 3, nextDay)).ok).toBe(true);
  });
  it("survives Reset to original data, so a reset cannot lift the cap", async () => {
    await resetDatabase(sql);
    const [row] = await sql<{ requests: number }[]>`select requests from copilot_usage where day = '2030-01-01'`;
    expect(row.requests).toBe(3);
    expect((await takeDailySlot(sql, 3, lateDay)).ok).toBe(false);
  });
});
