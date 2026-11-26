import { readFileSync } from "node:fs";
import path from "node:path";
import { makeSql, type Sql } from "../lib/db/client";
import { assertTestDatabase } from "../lib/db/guard";
import { resetDatabase } from "../lib/db/reset";
import { loadEnv } from "../lib/env";

/** The test branch only. Re-checks the guard every time a client is made. */
export function testSql(): Sql {
  loadEnv();
  assertTestDatabase(process.env);
  return makeSql(process.env.DATABASE_URL_TEST!, { max: 4 });
}

export function readonlyTestSql(): Sql {
  loadEnv();
  assertTestDatabase(process.env);
  const url = process.env.DATABASE_URL_READONLY_TEST;
  if (!url) throw new Error("DATABASE_URL_READONLY_TEST is not set");
  return makeSql(url, { max: 1 });
}

export async function resetTestDb(sql: Sql) {
  assertTestDatabase(process.env);
  return resetDatabase(sql);
}

export type Reference = {
  assumptions: { stage_weights: Record<string, number>; collection_rate: number; stale_days: number; festival_start: string };
  snapshots: Record<string, Record<string, unknown>>;
  by_campaign_final: Record<string, Record<string, unknown>>;
  "by_campaign_2025-03-15": Record<string, Record<string, unknown>>;
  by_owner_final: Record<string, Record<string, number>>;
  by_industry_final: Record<string, Record<string, number>>;
  edge_cases: Record<string, unknown> & { raw_vs_unique: Record<string, [number, number]> };
  budgets_simulated: Record<string, { planned: number; spent_to_2025_04_20: number }>;
  decisions_final: Record<string, string>;
  "decisions_2025-03-15": Record<string, string>;
};

export const reference: Reference = JSON.parse(readFileSync(path.join(process.cwd(), "reference_metrics.json"), "utf8"));

/** A fixed "now" (12:00 IST) so stamped times are deterministic: simulation date at 12:00:00 IST. */
export const NOON_IST = Date.parse("2026-01-01T12:00:00+05:30");
