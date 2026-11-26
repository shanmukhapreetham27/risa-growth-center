/**
 * npm run verify  (docs/REPORTING.md §4, SPEC §7)
 * Read only check of the demo DB (DATABASE_URL) against reference_metrics.json: runs the same engine
 * the app uses on the live data inside a READ ONLY transaction, prints the fixed layout, and ends
 * with the audit_log tail so app edits that legitimately move numbers are visible.
 * Exit code 1 when any check is a MISMATCH.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { dbHost, makeSql } from "../lib/db/client";
import { rawVsUnique, rowOrigins } from "../lib/db/stats";
import { campaignDecisions, computeSnapshot, edgeCases, loadDataset, toIstIso } from "../lib/engine";
import { loadEnv, requireEnv } from "../lib/env";

const SNAPSHOT_METRICS = [
  "confirmed_partnerships", "confirmed_value_cash_inr", "qualified_brands", "proposals", "conversation_brands",
  "open_opportunities", "stale_open_opportunities_7d", "cash_collected_inr_simulated", "projected_cash_before_festival_inr",
  "qualified_brands_goal", "confirmed_partnerships_goal",
] as const;

type Ref = {
  snapshots: Record<string, Record<string, unknown>>;
  by_campaign_final: Record<string, Record<string, unknown>>;
  decisions_final: Record<string, string>;
  edge_cases: Record<string, unknown> & { raw_vs_unique: Record<string, [number, number]> };
};

const fmt = (v: unknown) => (v === null || v === undefined ? "null" : String(v));

async function main() {
  loadEnv();
  const url = requireEnv("DATABASE_URL");
  const ref: Ref = JSON.parse(readFileSync(path.join(process.cwd(), "reference_metrics.json"), "utf8"));
  const sql = makeSql(url, { max: 1 });
  let ok = 0;
  let bad = 0;
  const check = (pass: boolean) => (pass ? (ok++, "OK") : (bad++, "MISMATCH"));
  const lines: string[] = [];

  try {
    await sql.begin("read only", async (tx) => {
      const data = await loadDataset(tx);
      const origins = await rowOrigins(tx);
      const raw = await rawVsUnique(tx);
      const [{ n: writes }] = await tx<{ n: number }[]>`select count(*)::int as n from audit_log`;
      const tail = await tx<{ at: Date; actor: string; action: string; record_id: string }[]>`
        select at, actor, action, record_id from audit_log order by id desc limit 10`;

      lines.push(`VERIFY  db=${dbHost(url)}  simulation_date=${data.settings.simulation_date}  source_rows=${origins.source_rows}  app_rows=${origins.app_rows}  at=${toIstIso(Date.now())}`);
      lines.push("SNAPSHOT CHECKS (engine on live DB vs reference_metrics.json)");
      lines.push(`${"date".padEnd(12)}${"metric".padEnd(41)}${"reference".padEnd(13)}${"actual".padEnd(13)}ok`);
      for (const [date, refSnap] of Object.entries(ref.snapshots)) {
        const s = computeSnapshot(data, date) as unknown as Record<string, unknown>;
        for (const m of SNAPSHOT_METRICS) {
          const r = refSnap[m];
          const a = s[m];
          lines.push(`${date.padEnd(12)}${m.padEnd(41)}${fmt(r).padEnd(13)}${fmt(a).padEnd(13)}${check(r === a)}`);
        }
      }

      lines.push("CAMPAIGN CHECKS (2025-04-20)");
      const decisions = new Map(campaignDecisions(data, "2025-04-20").map((d) => [d.sponsor_campaign_id, d]));
      for (const [c, refM] of Object.entries(ref.by_campaign_final)) {
        const d = decisions.get(c);
        const conf = d ? d.metrics.confirmed_partnerships : null;
        const badge = d ? d.decision.badge : null;
        const r1 = check(conf === refM.confirmed_partnerships);
        const r2 = check(badge === ref.decisions_final[c]);
        lines.push(`${c} confirmed=${fmt(conf)} ref=${fmt(refM.confirmed_partnerships)} ${r1} | decision=${fmt(badge)} ref=${ref.decisions_final[c]} ${r2}`);
      }

      lines.push("EDGE CASES");
      const e = edgeCases(data);
      const ec = ref.edge_cases;
      lines.push(`cobalt_learning_O_id ${fmt(e.cobalt_learning_O_id)} ref=${fmt(ec.cobalt_learning_O_id)} ${check(e.cobalt_learning_O_id === ec.cobalt_learning_O_id)}`);
      lines.push(`cobalt_confirmed_2025_03_10 ${e.cobalt_confirmed_on_2025_03_10} ref=${fmt(ec.cobalt_confirmed_on_2025_03_10)} ${check(e.cobalt_confirmed_on_2025_03_10 === ec.cobalt_confirmed_on_2025_03_10)}`);
      lines.push(`cobalt_confirmed_2025_04_20 ${e.cobalt_confirmed_on_2025_04_20} ref=${fmt(ec.cobalt_confirmed_on_2025_04_20)} ${check(e.cobalt_confirmed_on_2025_04_20 === ec.cobalt_confirmed_on_2025_04_20)}`);
      lines.push(`beardo_opportunities ${e.beardo_opportunities} ref=${fmt(ec.beardo_opportunities)} ${check(e.beardo_opportunities === ec.beardo_opportunities)}`);
      for (const k of ["interactions", "qualification", "opportunity_history"] as const) {
        const [rr, ru] = ec.raw_vs_unique[k];
        const [ar, au] = raw[k];
        lines.push(`raw ${k} ${ar} ref=${rr} ${check(ar === rr)}`);
        lines.push(`dedupe ${k} ${au} ref=${ru} ${check(au === ru)}`);
      }

      lines.push(`SUMMARY  ${ok}/${ok + bad} OK   ${bad} MISMATCH`);
      if (writes === 0) lines.push("APP WRITES SINCE RESET: 0");
      else {
        lines.push(`APP WRITES SINCE RESET: ${writes} (mismatches may be expected; last ${tail.length} audit_log rows: at, actor, action, record_id)`);
        for (const t of tail) lines.push(`  ${toIstIso(t.at.getTime())}  ${t.actor}  ${t.action}  ${t.record_id}`);
      }
    });
  } finally {
    await sql.end();
  }
  console.log(lines.join("\n"));
  if (bad > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`verify FAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(2);
});
