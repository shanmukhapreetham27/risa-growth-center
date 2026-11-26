import { makeSql, type Sql } from "../db/client";

/**
 * App connection: Neon pooled string (CONTEXT §5.3). One client per server process; kept on
 * globalThis so dev hot reloads do not open new pools.
 */
const g = globalThis as unknown as { __risaSql?: Sql };

export function getSql(): Sql {
  if (!g.__risaSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
    g.__risaSql = makeSql(url, { max: 5 });
  }
  return g.__risaSql;
}
