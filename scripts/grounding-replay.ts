/**
 * Offline calibration of the grounding check (no model calls): replays the tool calls of a saved eval run
 * on a freshly reset test branch, rebuilds each conversation and reports which numbers in the saved
 * answers would be flagged.  npx tsx scripts/grounding-replay.ts eval/results/<run>.json
 */
import type Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { findUnverifiedNumbers } from "../lib/copilot/grounding";
import { executeTool } from "../lib/copilot/tools";
import { makeSql } from "../lib/db/client";
import { assertTestDatabase } from "../lib/db/guard";
import { resetDatabase } from "../lib/db/reset";
import { loadEnv } from "../lib/env";
import { changeOpportunity } from "../lib/writes";

interface Row {
  id: string;
  question: string;
  answer: string;
  tools: { name: string; input: unknown }[];
}

async function main() {
  loadEnv();
  assertTestDatabase(process.env);
  const run = JSON.parse(readFileSync(process.argv[2], "utf8")) as { rows: Row[] };
  const sql = makeSql(process.env.DATABASE_URL_TEST!, { max: 2 });
  const ro = makeSql(process.env.DATABASE_URL_READONLY_TEST!, { max: 1 });
  try {
    await resetDatabase(sql);
    let history: Anthropic.MessageParam[] = [];
    for (const r of run.rows) {
      if (r.id !== "Q04") history = [];
      if (r.id === "Q14") await changeOpportunity(sql, { opportunity_id: "O028", stage: "partner_confirmed" }, "user");
      history.push({ role: "user", content: r.question });
      for (const t of r.tools) {
        if (t.name.startsWith("propose_")) continue; // would write proposals; their numbers are echoed from input
        const out = await executeTool(t.name, t.input, { sql, readonlySql: ro });
        history.push({ role: "user", content: [{ type: "tool_result", tool_use_id: "x", content: JSON.stringify(out.content) }] });
      }
      for (const t of r.tools.filter((x) => x.name.startsWith("propose_")))
        history.push({ role: "user", content: [{ type: "tool_result", tool_use_id: "x", content: JSON.stringify({ proposal: { payload: t.input } }) }] });
      const bad = findUnverifiedNumbers(r.answer, history);
      console.log(`${r.id}: ${bad.length ? `FLAG ${bad.join(" | ")}` : "ok"}`);
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
