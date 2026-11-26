import { existsSync } from "node:fs";
import path from "node:path";

let loaded = false;

/**
 * Load .env.local, then .env, for scripts and tests (Next.js loads them itself for the app).
 * Uses Node's own parser; variables already set in the environment win. Not @next/env, because
 * that skips .env.local when NODE_ENV=test, which is how vitest runs. Idempotent.
 */
export function loadEnv(dir: string = process.cwd()): void {
  if (loaded) return;
  for (const f of [".env.local", ".env"]) {
    const p = path.join(dir, f);
    if (existsSync(p)) process.loadEnvFile(p);
  }
  loaded = true;
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (see .env.example)`);
  return v;
}
