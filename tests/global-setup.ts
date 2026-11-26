import { assertTestDatabase } from "../lib/db/guard";
import { loadEnv } from "../lib/env";

/**
 * CLAUDE.md rule 3 / CONTEXT §5.2: refuse to start unless DATABASE_URL_TEST is set and is a
 * different Neon endpoint than DATABASE_URL, DATABASE_URL_UNPOOLED and DATABASE_URL_READONLY.
 * Throwing here aborts the run before any test file is loaded.
 */
export default function setup(): void {
  loadEnv();
  const t = assertTestDatabase(process.env);
  console.log(`[guard] tests use ${t.endpoint} (DATABASE_URL_TEST); demo endpoint is different. TZ=${process.env.TZ}`);
}
