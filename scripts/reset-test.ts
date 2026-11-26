/** Reset the Neon `test` branch only (guarded); used before e2e runs and screenshots. Prints no secrets. */
import { makeSql } from "../lib/db/client";
import { assertTestDatabase } from "../lib/db/guard";
import { resetDatabase } from "../lib/db/reset";
import { loadEnv } from "../lib/env";

async function main() {
  loadEnv();
  const id = assertTestDatabase(process.env);
  const sql = makeSql(process.env.DATABASE_URL_TEST!, { max: 1 });
  try {
    const r = await resetDatabase(sql);
    console.log(`reset test branch ${id.endpoint}: ${r.totalRows} rows in ${r.ms} ms`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(`reset-test FAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
