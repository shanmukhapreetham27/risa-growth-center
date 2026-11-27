/**
 * npm run eval:copilot (SPEC §7, Phase 0 Q19): runs copilot_eval_questions.json against the live model
 * on the Neon test branch only (guarded), one question at a time:
 *   reset test branch (simulation date 2025-04-20) → Q01..Q13 (Q04 continues Q03's conversation, the
 *   others start fresh) → apply the Q14 edit through the write module (O028 → partner_confirmed, actor
 *   user) → Q14. Proposals are never confirmed by the harness.
 * Saves eval/results/<timestamp>.md (transcripts) and .json (raw numbers) after every question, so a run
 * that stops early keeps what it has. Not part of CI.
 *   npx tsx scripts/eval-copilot.ts [--only=Q01,Q03]
 */
import type Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { costUsd, EFFORT, MAX_ROUNDS, model, runChat, type ToolCallRecord, type UsageTotals } from "../lib/copilot/chat";
import { makeSql } from "../lib/db/client";
import { assertTestDatabase } from "../lib/db/guard";
import { resetDatabase } from "../lib/db/reset";
import { loadEnv } from "../lib/env";
import { changeOpportunity } from "../lib/writes";

interface Q {
  id: string;
  q: string;
  expect: string;
  type: string;
}

interface Row {
  id: string;
  type: string;
  question: string;
  expect: string;
  answer: string;
  notice?: string;
  tools: ToolCallRecord[];
  usage: UsageTotals;
  latency_s: number;
  rounds: number;
  stop_reason: string | null;
  cost_usd: number;
  harness_notes: string[];
}

const toolList = (t: ToolCallRecord[]) => t.map((c) => c.name).join(", ") || "none";

function writeResults(started: Date, rows: Row[], failure: string | null): string {
  const total = rows.reduce(
    (a, r) => ({ input: a.input + r.usage.input_tokens, output: a.output + r.usage.output_tokens, read: a.read + r.usage.cache_read_input_tokens, write: a.write + r.usage.cache_creation_input_tokens, cost: a.cost + r.cost_usd, s: a.s + r.latency_s }),
    { input: 0, output: 0, read: 0, write: 0, cost: 0, s: 0 },
  );
  const stamp = started.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.join(process.cwd(), "eval", "results");
  mkdirSync(dir, { recursive: true });
  const md: string[] = [
    `# Copilot eval ${started.toISOString()}`,
    "",
    `Model ${model()}, effort ${EFFORT}, adaptive thinking (default), tool choice auto, max ${MAX_ROUNDS} rounds. Database: Neon test branch, reset before the run, simulation date 2025-04-20.`,
    ...(failure ? ["", `**Run stopped early:** ${failure}`] : []),
    "",
    `Totals: ${rows.length} questions, ${total.s.toFixed(1)} s, input ${total.input}, output ${total.output}, cache read ${total.read}, cache write ${total.write} tokens, cost $${total.cost.toFixed(4)} (Sonnet 5.5 list prices: $2 input, $10 output, $2.50 cache write, $0.10 cache read per million tokens).`,
    "",
    "| Q | Type | Tools called | Latency s | Input | Output | Cache read | Cache write | Cost USD |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.id} | ${r.type} | ${toolList(r.tools)} | ${r.latency_s} | ${r.usage.input_tokens} | ${r.usage.output_tokens} | ${r.usage.cache_read_input_tokens} | ${r.usage.cache_creation_input_tokens} | ${r.cost_usd.toFixed(4)} |`),
    "",
  ];
  for (const r of rows) {
    md.push(`## ${r.id} (${r.type})`, "", `**Question:** ${r.question}`, "", `**Expected:** ${r.expect}`, "");
    for (const n of r.harness_notes) md.push(`_Harness: ${n}_`, "");
    md.push("**Answer:**", "", r.answer || "(no text)", "");
    if (r.notice) md.push(`_Notice: ${r.notice}_`, "");
    md.push("**Tool calls:**", "", ...r.tools.map((t) => `- \`${t.name}\` ${JSON.stringify(t.input)} → ${t.ok ? "" : "ERROR "}${t.summary}`), "");
  }
  writeFileSync(path.join(dir, `${stamp}.md`), md.join("\n"), "utf8");
  writeFileSync(path.join(dir, `${stamp}.json`), JSON.stringify({ started: started.toISOString(), model: model(), effort: EFFORT, failure, totals: total, rows }, null, 1), "utf8");
  return `eval/results/${stamp}.md (total cost $${total.cost.toFixed(4)})`;
}

async function main() {
  loadEnv();
  const id = assertTestDatabase(process.env);
  if (!process.env.DATABASE_URL_READONLY_TEST) throw new Error("DATABASE_URL_READONLY_TEST is not set");
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
  const questions: Q[] = JSON.parse(readFileSync(path.join(process.cwd(), "copilot_eval_questions.json"), "utf8"));
  const sql = makeSql(process.env.DATABASE_URL_TEST!, { max: 3 });
  const ro = makeSql(process.env.DATABASE_URL_READONLY_TEST, { max: 1 });
  const rows: Row[] = [];
  const started = new Date();
  try {
    const r = await resetDatabase(sql);
    console.log(`[eval] test branch ${id.endpoint} reset (${r.totalRows} rows); model ${model()}, effort ${EFFORT}, max ${MAX_ROUNDS} rounds`);
    let history: Anthropic.MessageParam[] = [];
    for (const q of questions) {
      if (only && !only.includes(q.id)) continue;
      const notes: string[] = [];
      if (q.id !== "Q04") history = [];
      let text = q.q;
      if (q.id === "Q14") {
        const edit = await changeOpportunity(sql, { opportunity_id: "O028", stage: "partner_confirmed" }, "user");
        notes.push(`Before asking: O028 Cedar Pantry set to partner_confirmed through lib/writes (${edit.history_id}, effective ${new Date(edit.effective_at).toISOString()}), as the UI edit would.`);
        text = q.q.replace(/^\[[^\]]*\]\s*/, "");
      }
      if (q.id === "Q04") notes.push("Asked in the same conversation as Q03 (follow up).");
      const tasksBefore = (await sql<{ n: number }[]>`select count(*)::int n from tasks`)[0].n;
      const auditBefore = (await sql<{ n: number }[]>`select count(*)::int n from audit_log where actor = 'copilot'`)[0].n;
      history = [...history, { role: "user", content: text }];
      process.stdout.write(`[eval] ${q.id} … `);
      const res = await runChat(history, { sql, readonlySql: ro });
      history = [...history, ...res.appended];
      const tasksAfter = (await sql<{ n: number }[]>`select count(*)::int n from tasks`)[0].n;
      const auditAfter = (await sql<{ n: number }[]>`select count(*)::int n from audit_log where actor = 'copilot'`)[0].n;
      if (res.proposals.length) notes.push(`Proposals created (pending, not confirmed by the harness): ${res.proposals.map((p) => `${p.proposal_id} ${p.action_type} ${JSON.stringify(p.payload)}`).join("; ")}.`);
      notes.push(`Writes by the copilot during this question: tasks ${tasksAfter - tasksBefore}, audit rows ${auditAfter - auditBefore}.`);
      notes.push(
        res.grounding.asked_to_recompute
          ? `Grounding check: first answer had untraced numbers (${res.grounding.asked_to_recompute.join(", ")}); model was asked once to recompute or remove them. Untraced in the final answer: ${res.grounding.final_unverified.join(", ") || "none"}.`
          : "Grounding check: every number in the first answer traced to a tool or calculate result.",
      );
      const row: Row = {
        id: q.id,
        type: q.type,
        question: text,
        expect: q.expect,
        answer: res.text,
        notice: res.notice,
        tools: res.tool_calls,
        usage: res.usage,
        latency_s: Math.round(res.ms / 100) / 10,
        rounds: res.rounds,
        stop_reason: res.stop_reason,
        cost_usd: costUsd(res.usage),
        harness_notes: notes,
      };
      rows.push(row);
      writeResults(started, rows, null);
      console.log(`${row.latency_s}s tools=[${toolList(res.tool_calls)}] in=${res.usage.input_tokens} out=${res.usage.output_tokens} cache_read=${res.usage.cache_read_input_tokens} cost=$${row.cost_usd.toFixed(4)}`);
    }
    console.log(`[eval] saved ${writeResults(started, rows, null)}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[eval] stopped early; saved ${writeResults(started, rows, msg)}`);
    throw e;
  } finally {
    await sql.end();
    await ro.end();
  }
}

main().catch((e) => {
  console.error(`eval FAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
