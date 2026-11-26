/**
 * query_data(sql): read only SELECT over the v_* views for long tail questions (SPEC §6.2).
 * Four guards: (1) text checks: one statement, SELECT or WITH ... SELECT, no comments, no write or
 * admin keywords, every relation after FROM / JOIN is a v_* view; (2) the query is wrapped as a
 * subquery with LIMIT 200; (3) it runs in a READ ONLY transaction; (4) it runs as risa_readonly
 * (DATABASE_URL_READONLY), which has SELECT on the v_* views only and a 3 s statement timeout.
 */
import type { Sql } from "../db/client";

export const QUERY_LIMIT = 200;
const FORBIDDEN = /\b(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|copy|call|do|execute|prepare|listen|notify|vacuum|analyze|lock|set|reset|begin|commit|rollback|savepoint|refresh|comment|security|pg_sleep|pg_read_file|pg_ls_dir|dblink|lo_import|lo_export)\b/i;

export class QueryRejected extends Error {}

export function checkQuery(raw: string): string {
  if (typeof raw !== "string" || !raw.trim()) throw new QueryRejected("sql is required");
  if (raw.length > 4000) throw new QueryRejected("sql is too long (max 4000 characters)");
  if (/--|\/\*/.test(raw)) throw new QueryRejected("comments are not allowed");
  const sql = raw.trim().replace(/;\s*$/, "");
  if (sql.includes(";")) throw new QueryRejected("only a single statement is allowed");
  if (!/^(select|with)\b/i.test(sql)) throw new QueryRejected("only SELECT (or WITH ... SELECT) is allowed");
  // Check keywords outside string literals.
  const code = sql.replace(/'(?:[^']|'')*'/g, "''");
  const bad = FORBIDDEN.exec(code);
  if (bad) throw new QueryRejected(`"${bad[1]}" is not allowed in query_data`);
  if (/\b(pg_catalog|information_schema|pg_[a-z_]+)\b/i.test(code)) throw new QueryRejected("system catalogs are not allowed; query the v_* views");
  const cteNames = new Set([...code.matchAll(/(?:with|,)\s*([a-z_][a-z0-9_]*)\s+as\s*\(/gi)].map((m) => m[1].toLowerCase()));
  // FROM inside functions (extract(month from x), substring(x from 1), trim(both from x)) and IS DISTINCT FROM is not a relation.
  const relCode = code
    .replace(/\b(extract|substring|trim|position|overlay)\s*\([^()]*\)/gi, "fn()")
    .replace(/\bdistinct\s+from\b/gi, "distinct_from");
  for (const m of relCode.matchAll(/\b(?:from|join)\s+([a-z_."][a-z0-9_."]*)/gi)) {
    const rel = m[1].replace(/"/g, "").toLowerCase();
    const name = rel.includes(".") ? rel.split(".").pop()! : rel;
    if (rel.includes(".") && !rel.startsWith("public.")) throw new QueryRejected(`only the v_* views can be queried (found ${rel})`);
    if (!name.startsWith("v_") && !cteNames.has(name) && name !== "lateral" && name !== "unnest" && name !== "generate_series")
      throw new QueryRejected(`only the v_* views can be queried (found ${name})`);
  }
  return sql;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  truncated: boolean;
  limit: number;
}

export async function queryData(readonlySql: Sql, raw: string): Promise<QueryResult> {
  const sql = checkQuery(raw);
  const rows = await readonlySql.begin("read only", async (tx) => tx.unsafe(`select * from (${sql}) as q limit ${QUERY_LIMIT + 1}`));
  const list = (rows as unknown as Record<string, unknown>[]).map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : typeof v === "bigint" ? Number(v) : v])),
  );
  const truncated = list.length > QUERY_LIMIT;
  const out = truncated ? list.slice(0, QUERY_LIMIT) : list;
  return { columns: out[0] ? Object.keys(out[0]) : [], rows: out, row_count: out.length, truncated, limit: QUERY_LIMIT };
}
