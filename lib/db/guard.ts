/**
 * Test isolation guard (CLAUDE.md rule 3, CONTEXT §5.2).
 * Neon's pooled and direct strings of one branch differ only in the `-pooler` suffix of the
 * host, so comparing strings is not enough: compare the endpoint id (first host label without
 * `-pooler`) plus port and database name. Any match with a demo DB URL aborts.
 */
export interface DbIdentity {
  host: string;
  endpoint: string;
  port: string;
  database: string;
  key: string;
}

export function dbIdentity(url: string): DbIdentity {
  const u = new URL(url);
  const host = u.hostname.toLowerCase();
  const endpoint = host.split(".")[0].replace(/-pooler$/, "");
  const port = u.port || "5432";
  const database = decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres";
  return { host, endpoint, port, database, key: `${endpoint}:${port}/${database}` };
}

const DEMO_KEYS = ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "DATABASE_URL_READONLY"] as const;

/** Throws unless DATABASE_URL_TEST is set and points at a different database than every demo URL. */
export function assertTestDatabase(env: Record<string, string | undefined>): DbIdentity {
  const test = env.DATABASE_URL_TEST;
  if (!test) throw new Error("ABORT: DATABASE_URL_TEST is not set; tests that reset data never run without it.");
  const t = dbIdentity(test);
  for (const k of DEMO_KEYS) {
    const v = env[k];
    if (!v) continue;
    if (v === test) throw new Error(`ABORT: DATABASE_URL_TEST equals ${k}; tests must not reset the demo database.`);
    if (dbIdentity(v).key === t.key)
      throw new Error(`ABORT: DATABASE_URL_TEST and ${k} point at the same endpoint (${t.endpoint}); tests must not reset the demo database.`);
  }
  if (!env.DATABASE_URL) throw new Error("ABORT: DATABASE_URL is not set, so the guard cannot prove DATABASE_URL_TEST is a different database.");
  return t;
}
