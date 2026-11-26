import { makeSql } from "../lib/db/client";
import { assertTestDatabase } from "../lib/db/guard";
import { resetDatabase } from "../lib/db/reset";
import { loadEnv } from "../lib/env";

/** Fresh test branch before every Playwright run (never the demo DB). */
export default async function globalSetup(): Promise<void> {
  loadEnv();
  const id = assertTestDatabase(process.env);
  const sql = makeSql(process.env.DATABASE_URL_TEST!, { max: 1 });
  try {
    const r = await resetDatabase(sql);
    console.log(`[e2e] reset test branch ${id.endpoint}: ${r.totalRows} rows`);
  } finally {
    await sql.end();
  }
}
