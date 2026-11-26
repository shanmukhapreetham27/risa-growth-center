/**
 * Schema, dedupe views and read only role on the test branch (SPEC §2.2, §2.3, §6.2):
 * risa_readonly can SELECT the v_* views and nothing else, cannot create temporary tables even
 * after switching the session to read write, and keeps its 3 s statement timeout.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "../lib/db/client";
import { dbIdentity } from "../lib/db/guard";
import { CSV_TABLES } from "../lib/db/reset";
import { readonlyTestSql, resetTestDb, testSql } from "./helpers";

const VIEWS = [
  "v_activations", "v_brands", "v_budgets", "v_campaigns", "v_contacts", "v_event", "v_interactions", "v_opportunities",
  "v_opportunity_history", "v_payments", "v_qualification_history", "v_spend", "v_targets", "v_tasks",
];

let sql: Sql;
let ro: Sql;
beforeAll(async () => {
  sql = testSql();
  ro = readonlyTestSql();
  await resetTestDb(sql);
});
afterAll(async () => {
  await sql?.end();
  await ro?.end();
});

const code = async (p: Promise<unknown>) => p.then(() => "no error", (e: { code?: string }) => e.code ?? "error");

describe("schema", () => {
  it("has all 12 source tables, the simulated tables and exactly the 14 v_* views", async () => {
    const tables = (await sql<{ t: string }[]>`select tablename as t from pg_tables where schemaname = 'public'`).map((r) => r.t);
    for (const { table } of CSV_TABLES) expect(tables).toContain(table);
    for (const t of ["settings", "tasks", "chat_proposals", "audit_log"]) expect(tables).toContain(t);
    const views = (await sql<{ v: string }[]>`select viewname as v from pg_views where schemaname = 'public' order by 1`).map((r) => r.v);
    expect(views).toEqual(VIEWS);
  });
  it("keeps duplicate import rows in raw tables and drops them in the views", async () => {
    const [r] = await sql<Record<string, number>[]>`
      select (select count(*)::int from sponsor_interactions) ri, (select count(*)::int from v_interactions) ui,
             (select count(*)::int from brand_qualification_history) rq, (select count(*)::int from v_qualification_history) uq,
             (select count(*)::int from opportunity_history) ro, (select count(*)::int from v_opportunity_history) uo`;
    expect(r).toEqual({ ri: 953, ui: 950, rq: 434, uq: 433, ro: 230, uo: 228 });
  });
  it("loads typed values: ids as text, blanks as null, booleans, integers, seed task ids as arrays", async () => {
    const [e] = await sql<{ fictional: boolean }[]>`select fictional from event`;
    expect(e.fictional).toBe(true);
    const [i] = await sql<{ origin_interaction_id: string | null }[]>`select origin_interaction_id from sponsor_interactions where interaction_id = 'SI00634' limit 1`;
    expect(i.origin_interaction_id).toBeNull();
    const tasks = await sql<{ task_id: string; opportunity_ids: string[]; created_by: string }[]>`select task_id, opportunity_ids, created_by from tasks order by task_id`;
    expect(tasks[0]).toEqual({ task_id: "TSK001", opportunity_ids: ["O001"], created_by: "seed" });
    expect(tasks[1].opportunity_ids).toEqual([]);
    const [p] = await sql<{ amount_due_inr: number; paid_at: Date | null }[]>`select amount_due_inr, paid_at from payment_installments where installment_id = 'PAY033'`;
    expect(p).toEqual({ amount_due_inr: 55000, paid_at: null });
  });
});

describe("read only role (DATABASE_URL_READONLY_TEST)", () => {
  it("connects as risa_readonly to the test branch with read only default and 3 s timeout", async () => {
    expect(dbIdentity(process.env.DATABASE_URL_READONLY_TEST!).endpoint).toBe(dbIdentity(process.env.DATABASE_URL_TEST!).endpoint);
    const [r] = await ro<{ u: string; ro: string; st: string }[]>`
      select current_user u, current_setting('default_transaction_read_only') ro, current_setting('statement_timeout') st`;
    expect(r).toEqual({ u: "risa_readonly", ro: "on", st: "3s" });
  });
  it("can SELECT every v_* view", async () => {
    for (const v of VIEWS) await expect(ro`select count(*) from ${ro(v)}`).resolves.toBeDefined();
    const [{ n }] = await ro<{ n: number }[]>`select count(*)::int n from v_brands`;
    expect(n).toBe(180);
  });
  it("cannot read raw or app tables", async () => {
    expect(await code(ro`select * from brands limit 1`)).toBe("42501");
    expect(await code(ro`select * from settings`)).toBe("42501");
    expect(await code(ro`select * from audit_log`)).toBe("42501");
  });
  it("cannot write, even after switching the session to read write", async () => {
    // Default session: blocked by privileges (42501, checked first) or the read only default (25006).
    expect(await code(ro`insert into v_tasks (task_id, title, created_by) values ('X', 'x', 'user')`)).toMatch(/^(42501|25006)$/);
    expect(await code(ro`create table _ro_probe (x int)`)).toBe("25006");
    // Read write session: still blocked by privileges.
    await expect(
      ro.begin("read write", async (tx) => {
        await tx`insert into v_tasks (task_id, title, created_by) values ('X', 'x', 'user')`;
      }),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(ro.begin("read write", async (tx) => tx`create temp table t (x int)`)).rejects.toMatchObject({ code: "42501" });
    await expect(ro.begin("read write", async (tx) => tx`create table public.t (x int)`)).rejects.toMatchObject({ code: "42501" });
  });
  it("statement timeout stops long queries", async () => {
    expect(await code(ro`select pg_sleep(4)`)).toBe("57014");
  });
});
