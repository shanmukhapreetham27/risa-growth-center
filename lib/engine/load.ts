import type { Queryable } from "../db/client";
import type { Dataset, EventInfo, Settings } from "./types";

type Row = Record<string, unknown>;

/** timestamptz (Date) -> epoch ms; strip the loader-only ingest_row column. */
function normalize<T>(rows: readonly Row[]): T[] {
  return rows.map((r) => {
    const o: Row = {};
    for (const [k, v] of Object.entries(r)) {
      if (k === "ingest_row") continue;
      o[k] = v instanceof Date ? v.getTime() : v;
    }
    return o as T;
  });
}

export async function loadSettings(sql: Queryable): Promise<Settings> {
  const [s] = await sql<Row[]>`select simulation_date, stale_days, stage_weights, collection_rate, cash_goal_inr from settings where id = 1`;
  if (!s) throw new Error("settings row is missing; run npm run db:reset");
  return {
    simulation_date: String(s.simulation_date),
    stale_days: Number(s.stale_days),
    stage_weights: Object.fromEntries(Object.entries(s.stage_weights as Record<string, unknown>).map(([k, v]) => [k, Number(v)])),
    collection_rate: Number(s.collection_rate),
    cash_goal_inr: Number(s.cash_goal_inr),
  };
}

/**
 * Reads every v_* view once (the dataset is under 2,500 rows) plus settings. Pages, copilot tools,
 * tests and verify all compute metrics from this object with the same pure functions.
 */
export async function loadDataset(sql: Queryable): Promise<Dataset> {
  const [settings, event, brands, contacts, campaigns, interactions, qualHistory, opportunities, oppHistory, targets, activations, payments, budgets, spend, tasks] =
    await Promise.all([
      loadSettings(sql),
      sql<Row[]>`select * from v_event`,
      sql<Row[]>`select * from v_brands order by brand_id`,
      sql<Row[]>`select * from v_contacts order by contact_id`,
      sql<Row[]>`select * from v_campaigns order by sponsor_campaign_id`,
      sql<Row[]>`select * from v_interactions order by interaction_id`,
      sql<Row[]>`select * from v_qualification_history order by history_id`,
      sql<Row[]>`select * from v_opportunities order by opportunity_id`,
      sql<Row[]>`select * from v_opportunity_history order by history_id`,
      sql<Row[]>`select * from v_targets order by effective_at, ingest_row nulls last`,
      sql<Row[]>`select * from v_activations order by activation_id`,
      sql<Row[]>`select * from v_payments order by installment_id`,
      sql<Row[]>`select * from v_budgets order by sponsor_campaign_id`,
      sql<Row[]>`select * from v_spend order by spend_id`,
      sql<Row[]>`select * from v_tasks order by task_id`,
    ]);
  const ev = normalize<EventInfo>(event);
  if (ev.length !== 1) throw new Error(`v_event must have exactly one row, found ${ev.length}`);
  return {
    settings,
    event: ev[0],
    brands: normalize(brands),
    contacts: normalize(contacts),
    campaigns: normalize(campaigns),
    interactions: normalize(interactions),
    qualHistory: normalize(qualHistory),
    opportunities: normalize(opportunities),
    oppHistory: normalize(oppHistory),
    targets: normalize(targets),
    activations: normalize(activations),
    payments: normalize(payments),
    budgets: normalize(budgets),
    spend: normalize(spend),
    tasks: normalize(tasks),
  };
}
