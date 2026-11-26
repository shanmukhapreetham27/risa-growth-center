/**
 * npm run db:reset  (SPEC §2.3)
 * Drops all tables, runs db/migrations, loads data/source_csv and data/simulated, in one transaction,
 * on the demo database through its direct string DATABASE_URL_UNPOOLED (CONTEXT §5.3).
 */
import { dbHost, makeSql } from "../lib/db/client";
import { resetDatabase } from "../lib/db/reset";
import { loadEnv, requireEnv } from "../lib/env";

async function main() {
  loadEnv();
  const url = requireEnv("DATABASE_URL_UNPOOLED");
  const sql = makeSql(url, { max: 1 });
  try {
    console.log(`db:reset  db=${dbHost(url)}`);
    const r = await resetDatabase(sql);
    console.log(`migrations: ${r.migrations.join(", ")}`);
    for (const [t, n] of Object.entries(r.rows)) console.log(`  ${t.padEnd(30)} ${n}`);
    console.log(`loaded ${r.totalRows} rows in ${r.ms} ms`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(`db:reset FAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
