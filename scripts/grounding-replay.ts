/**
 * Offline calibration of the grounding check (no model calls): replays the tool calls of a saved eval run
 * on a freshly reset test branch, rebuilds each conversation and reports what the check would flag in the
 * saved answers (numbers, ids, names, names without ids, counts, ranges), and what the eval's id-number
 * check (V2) would fail.  npx tsx scripts/grounding-replay.ts eval/results/<run>.json [more runs]
 */
import type Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { idNumberMismatches } from "../lib/copilot/eval-checks";
import { groundingIssues, issueList, toolResults } from "../lib/copilot/grounding";
import { buildRecordIndex } from "../lib/copilot/ids";
import { executeTool } from "../lib/copilot/tools";
import { makeSql } from "../lib/db/client";
import { assertTestDatabase } from "../lib/db/guard";
import { resetDatabase } from "../lib/db/reset";
import { loadEnv } from "../lib/env";
import { loadDataset } from "../lib/engine";
import { changeOpportunity, updateSettings } from "../lib/writes";

interface Row {
  id: string;
  question: string;
  answer: string;
  tools: { name: string; input: unknown }[];
}

async function main() {
  loadEnv();
  assertTestDatabase(process.env);
  const sql = makeSql(process.env.DATABASE_URL_TEST!, { max: 2 });
  const ro = makeSql(process.env.DATABASE_URL_READONLY_TEST!, { max: 1 });
  try {
    for (const file of process.argv.slice(2)) {
      console.log(`== ${file}`);
      const run = JSON.parse(readFileSync(file, "utf8")) as { rows: Row[] };
      await resetDatabase(sql);
      let history: Anthropic.MessageParam[] = [];
      for (const r of run.rows) {
        if (r.id !== "Q04") history = [];
        if (r.id === "Q14") await changeOpportunity(sql, { opportunity_id: "O028", stage: "partner_confirmed" }, "user");
        if (r.id === "Q20") await updateSettings(sql, { stale_days: 45 }, "user");
        history.push({ role: "user", content: r.question });
        for (const t of r.tools) {
          if (t.name.startsWith("propose_")) continue; // would write proposals; their text is the model's own input
          const out = await executeTool(t.name, t.input, { sql, readonlySql: ro });
          history.push({ role: "user", content: [{ type: "tool_result", tool_use_id: "x", content: JSON.stringify(out.content) }] });
        }
        for (const t of r.tools.filter((x) => x.name.startsWith("propose_")))
          history.push({ role: "user", content: [{ type: "tool_result", tool_use_id: "x", content: JSON.stringify({ proposal: { payload: t.input } }) }] });
        const data = await loadDataset(sql);
        const issues = issueList(groundingIssues(r.answer, history, buildRecordIndex(data)));
        const v2 = idNumberMismatches(r.answer, data, r.tools, toolResults(history));
        console.log(`${r.id}: ${issues.length ? `FLAG ${issues.join(" | ")}` : "ok"}${v2.length ? `  V2 FAIL ${v2.join(" | ")}` : ""}`);
      }
    }
  } finally {
    await sql.end();
    await ro.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
