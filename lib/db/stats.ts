import type { Queryable } from "./client";

/** Raw vs deduplicated row counts (edge case "duplicate import rows"). Reads raw tables, so owner role only. */
export async function rawVsUnique(sql: Queryable): Promise<Record<"interactions" | "qualification" | "opportunity_history", [number, number]>> {
  const [r] = await sql<Record<string, number>[]>`
    select (select count(*)::int from sponsor_interactions) as ri, (select count(*)::int from v_interactions) as ui,
           (select count(*)::int from brand_qualification_history) as rq, (select count(*)::int from v_qualification_history) as uq,
           (select count(*)::int from opportunity_history) as ro, (select count(*)::int from v_opportunity_history) as uo`;
  return { interactions: [r.ri, r.ui], qualification: [r.rq, r.uq], opportunity_history: [r.ro, r.uo] };
}

const SOURCED_TABLES = [
  "event", "targets", "read_me", "field_guide", "brands", "contacts", "sponsor_campaigns", "sponsor_interactions",
  "brand_qualification_history", "opportunities", "opportunity_history", "sponsor_activations",
  "payment_installments", "campaign_budgets", "campaign_spend", "tasks",
] as const;

/** Rows loaded from the CSVs (source + simulated) vs rows the app added (source = 'app'). */
export async function rowOrigins(sql: Queryable): Promise<{ source_rows: number; app_rows: number }> {
  const parts = SOURCED_TABLES.map((t) => `select source from ${t}`).join(" union all ");
  const [r] = await sql.unsafe<{ source_rows: number; app_rows: number }[]>(
    `select count(*) filter (where source <> 'app')::int as source_rows, count(*) filter (where source = 'app')::int as app_rows from (${parts}) s`,
  );
  return r;
}
