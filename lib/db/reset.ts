import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Sql, Tx } from "./client";
import { convertCell, readCsv } from "./csv";

/** Load order respects foreign keys. Table name = CSV file name (SPEC §2.2). */
export const CSV_TABLES: ReadonlyArray<{ table: string; file: string; kind: "source" | "simulated" }> = [
  { table: "event", file: "source_csv/event.csv", kind: "source" },
  { table: "targets", file: "source_csv/targets.csv", kind: "source" },
  { table: "read_me", file: "source_csv/read_me.csv", kind: "source" },
  { table: "field_guide", file: "source_csv/field_guide.csv", kind: "source" },
  { table: "brands", file: "source_csv/brands.csv", kind: "source" },
  { table: "contacts", file: "source_csv/contacts.csv", kind: "source" },
  { table: "sponsor_campaigns", file: "source_csv/sponsor_campaigns.csv", kind: "source" },
  { table: "sponsor_interactions", file: "source_csv/sponsor_interactions.csv", kind: "source" },
  { table: "brand_qualification_history", file: "source_csv/brand_qualification_history.csv", kind: "source" },
  { table: "opportunities", file: "source_csv/opportunities.csv", kind: "source" },
  { table: "opportunity_history", file: "source_csv/opportunity_history.csv", kind: "source" },
  { table: "sponsor_activations", file: "source_csv/sponsor_activations.csv", kind: "source" },
  { table: "payment_installments", file: "simulated/payment_installments.csv", kind: "simulated" },
  { table: "campaign_budgets", file: "simulated/campaign_budgets.csv", kind: "simulated" },
  { table: "campaign_spend", file: "simulated/campaign_spend.csv", kind: "simulated" },
];
export const TASKS_FILE = "simulated/tasks.csv";

export interface ResetOptions {
  dataDir?: string;
  migrationsDir?: string;
}

export interface ResetSummary {
  migrations: string[];
  rows: Record<string, number>;
  totalRows: number;
  ms: number;
}

/** Drops every table, view and function this app owns in schema public (extension objects are kept). */
const DROP_ALL = `
do $$
declare r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  loop execute format('drop view if exists public.%I cascade', r.relname); end loop;
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  loop execute format('drop table if exists public.%I cascade', r.relname); end loop;
  for r in
    select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop execute format('drop function if exists %s cascade', r.f); end loop;
end $$;`;

const IDENT = /^[a-z_][a-z0-9_]*$/;
const q = (name: string) => {
  if (!IDENT.test(name)) throw new Error(`Unexpected identifier ${name}`);
  return `"${name}"`;
};

/** Column types of every public table, in one round trip. */
async function columnTypes(tx: Tx): Promise<Map<string, Map<string, string>>> {
  const rows = await tx<{ table_name: string; column_name: string; data_type: string }[]>`
    select table_name, column_name, data_type from information_schema.columns where table_schema = 'public'`;
  const out = new Map<string, Map<string, string>>();
  for (const r of rows) {
    if (!out.has(r.table_name)) out.set(r.table_name, new Map());
    out.get(r.table_name)!.set(r.column_name, r.data_type);
  }
  return out;
}

/** Typed rows of one CSV, plus `ingest_row` (1-based row order in the file). */
function csvRows(file: string, table: string, types: Map<string, string>): Record<string, unknown>[] {
  const { header, rows } = readCsv(file);
  for (const h of header) if (!types.has(h)) throw new Error(`${file}: column ${h} has no column in table ${table}`);
  return rows.map((r, i) => {
    const o: Record<string, unknown> = {};
    header.forEach((h, j) => {
      o[h] = convertCell(r[j], types.get(h)!, `${file} row ${i + 1} ${h}`);
    });
    o.ingest_row = i + 1;
    return o;
  });
}

/**
 * One INSERT per table that reads already typed and validated rows from a JSON literal
 * (json_populate_recordset casts each field to the column type). Columns not in the CSV keep their
 * defaults (`source`, `status`, `voided_at`). Network round trips to Neon dominate reset time, so all
 * tables go in a single multi-statement query.
 */
function insertStatement(table: string, rows: Record<string, unknown>[]): string {
  const cols = Object.keys(rows[0]).map(q).join(", ");
  const json = JSON.stringify(rows);
  const tag = "$risa_csv$";
  if (json.includes(tag)) throw new Error(`${table}: data contains the quoting tag ${tag}`);
  return `insert into ${q(table)} (${cols}) select ${cols} from json_populate_recordset(null::${q(table)}, ${tag}${json}${tag}::json)`;
}

/**
 * SPEC §2.3 reset: in ONE transaction, drop all tables, run every migration in db/migrations
 * (schema, views, read only grants), then load all source and simulated CSVs. If anything fails
 * the transaction rolls back and the database is left as it was.
 */
export async function resetDatabase(sql: Sql, opts: ResetOptions = {}): Promise<ResetSummary> {
  const started = Date.now();
  // turbopackIgnore: these are read at runtime; next.config.ts ships data/ and db/migrations/ explicitly.
  const dataDir = opts.dataDir ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
  const migrationsDir = opts.migrationsDir ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "db", "migrations");
  const migrations = readdirSync(/*turbopackIgnore: true*/ migrationsDir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  const counts: Record<string, number> = {};

  await sql.begin(async (tx) => {
    await tx.unsafe(DROP_ALL);
    for (const m of migrations) await tx.unsafe(readFileSync(path.join(/*turbopackIgnore: true*/ migrationsDir, m), "utf8"));
    const types = await columnTypes(tx);
    const statements: string[] = [];

    for (const { table, file } of CSV_TABLES) {
      const t = types.get(table);
      if (!t) throw new Error(`Table ${table} is missing after migrations`);
      const rows = csvRows(path.join(/*turbopackIgnore: true*/ dataDir, file), table, t);
      if (rows.length) statements.push(insertStatement(table, rows));
      counts[table] = rows.length;
    }

    // tasks: seed opportunity_id -> opportunity_ids text[] (one element, blank -> empty), created_by 'seed' (D3).
    const taskTypes = new Map(types.get("tasks"));
    taskTypes.set("opportunity_id", "text");
    const { header, rows } = readCsv(path.join(/*turbopackIgnore: true*/ dataDir, TASKS_FILE));
    const tasks = rows.map((r, i) => {
      const o: Record<string, unknown> = {};
      header.forEach((h, j) => {
        if (!taskTypes.has(h)) throw new Error(`${TASKS_FILE}: column ${h} has no column in table tasks`);
        o[h] = convertCell(r[j], taskTypes.get(h)!, `${TASKS_FILE} row ${i + 1} ${h}`);
      });
      const { opportunity_id, ...rest } = o;
      return { ...rest, opportunity_ids: opportunity_id ? [String(opportunity_id)] : [], created_by: "seed", source: rest.source ?? "simulated" };
    });
    if (tasks.length) statements.push(insertStatement("tasks", tasks));
    counts.tasks = tasks.length;

    await tx.unsafe(statements.join(";\n"));
  });

  return {
    migrations,
    rows: counts,
    totalRows: Object.values(counts).reduce((a, b) => a + b, 0),
    ms: Date.now() - started,
  };
}
