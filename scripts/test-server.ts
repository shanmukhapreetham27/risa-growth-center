/**
 * Runs the app against the Neon `test` branch only (CLAUDE.md rule 3): used by the Playwright e2e
 * tests and screenshots. Refuses to start unless DATABASE_URL_TEST is a different endpoint than the
 * demo DB, then points every database variable of the child process at the test branch. Prints no
 * connection string.
 *   tsx scripts/test-server.ts start 3100   (after `next build`)
 *   tsx scripts/test-server.ts dev 3100
 */
import { spawn } from "node:child_process";
import { assertTestDatabase } from "../lib/db/guard";
import { loadEnv } from "../lib/env";

loadEnv();
const id = assertTestDatabase(process.env);
const mode = process.argv[2] === "dev" ? "dev" : "start";
const port = process.argv[3] ?? "3100";
const test = process.env.DATABASE_URL_TEST!;
const env = {
  ...process.env,
  DATABASE_URL: test,
  DATABASE_URL_UNPOOLED: test,
  DATABASE_URL_READONLY: process.env.DATABASE_URL_READONLY_TEST ?? "",
};
console.log(`[test-server] next ${mode} on port ${port} against test branch endpoint ${id.endpoint}`);
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), mode, "-p", port], { env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => child.kill(sig));
