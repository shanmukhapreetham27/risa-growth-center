/**
 * Copilot tool use loop (SPEC §6.1) on the Anthropic Messages API.
 * - The client sends the full history every turn; this returns only the blocks it appended (assistant
 *   turns with every content block unchanged, including thinking, and user turns with tool_result blocks),
 *   so the history stays append-only (CONTEXT §5.9).
 * - While stop_reason is tool_use: run every tool_use block, answer with one user turn of tool_result
 *   blocks, call again; at most 6 rounds.
 * - Model settings: ANTHROPIC_MODEL (default claude-sonnet-5-5), effort medium, adaptive thinking (model
 *   default, cannot be disabled), tool choice auto (default; forcing is rejected on this model), no
 *   temperature, max_tokens 16000, prompt caching on the tools, the system prompt and the conversation.
 * - 429 / 529 / 5xx are retried by the SDK with backoff (maxRetries 4).
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Proposal } from "./proposals";
import { SYSTEM_PROMPT } from "./system-prompt";
import { executeTool, type ToolContext, TOOLS } from "./tools";

export const MAX_ROUNDS = 6;
export const MAX_TOKENS = 16000;
export const EFFORT = "medium" as const;
export const model = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

/** Sonnet 5.5 list prices, USD per million tokens (checked 2026-11-27). */
export const PRICE = { input: 2, output: 10, cache_write_5m: 2.5, cache_read: 0.1 };

export interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  calls: number;
}

export const costUsd = (u: UsageTotals) =>
  (u.input_tokens * PRICE.input + u.output_tokens * PRICE.output + u.cache_creation_input_tokens * PRICE.cache_write_5m + u.cache_read_input_tokens * PRICE.cache_read) / 1e6;

export interface ToolCallRecord {
  id: string;
  name: string;
  input: unknown;
  ok: boolean;
  ms: number;
  /** Short human summary for the "Data used" list. */
  summary: string;
}

export type ChatEvent =
  | { type: "round"; round: number }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | { type: "tool_end"; id: string; name: string; ok: boolean; summary: string; proposal?: Proposal };

export interface ChatResult {
  appended: Anthropic.MessageParam[];
  text: string;
  tool_calls: ToolCallRecord[];
  proposals: Proposal[];
  usage: UsageTotals;
  rounds: number;
  stop_reason: string | null;
  ms: number;
  notice?: string;
}

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set on the server");
  client ??= new Anthropic({ maxRetries: 4, timeout: 120_000 });
  return client;
}

const TOOLS_CACHED: Anthropic.Tool[] = TOOLS.map((t, i) => (i === TOOLS.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t));
const SYSTEM: Anthropic.TextBlockParam[] = [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }];

function summarize(name: string, input: unknown, out: unknown, ok: boolean): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const o = (out ?? {}) as Record<string, unknown>;
  if (!ok) return `error: ${String(o.error ?? "failed").slice(0, 160)}`;
  const asOf = o.as_of ? ` as of ${o.as_of}` : "";
  switch (name) {
    case "calculate":
      return `${i.expression} = ${(o as { result?: number }).result}`;
    case "query_data":
      return `${(o as { row_count?: number }).row_count} rows: ${String(i.sql).slice(0, 140)}`;
    case "list_opportunities":
      return `${o.returned} of ${o.total_matching} opportunities${asOf}${Array.isArray(o.ties) && o.ties.length ? `, ${o.ties.length} tie group(s)` : ""}`;
    case "propose_task":
    case "propose_campaign_status":
      return `proposal ${(o.proposal as Proposal | undefined)?.proposal_id} pending (awaits Confirm)`;
    default: {
      const args = Object.entries(i).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join(", ");
      return `${args || "no arguments"}${asOf}`;
    }
  }
}

export async function runChat(history: Anthropic.MessageParam[], ctx: ToolContext, onEvent?: (e: ChatEvent) => void): Promise<ChatResult> {
  if (!Array.isArray(history) || history.length === 0 || history[history.length - 1].role !== "user") throw new Error("history must end with a user message");
  const started = Date.now();
  const appended: Anthropic.MessageParam[] = [];
  const toolCalls: ToolCallRecord[] = [];
  const proposals: Proposal[] = [];
  const usage: UsageTotals = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, calls: 0 };
  let last: Anthropic.Message | null = null;
  let rounds = 0;
  let notice: string | undefined;

  while (rounds < MAX_ROUNDS) {
    rounds += 1;
    onEvent?.({ type: "round", round: rounds });
    const resp = await anthropic().messages.create({
      model: model(),
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      tools: TOOLS_CACHED,
      cache_control: { type: "ephemeral" },
      output_config: { effort: EFFORT },
      messages: [...history, ...appended],
    });
    last = resp;
    usage.calls += 1;
    usage.input_tokens += resp.usage.input_tokens;
    usage.output_tokens += resp.usage.output_tokens;
    usage.cache_creation_input_tokens += resp.usage.cache_creation_input_tokens ?? 0;
    usage.cache_read_input_tokens += resp.usage.cache_read_input_tokens ?? 0;
    // Every block goes back unchanged (thinking and redacted_thinking included).
    appended.push({ role: "assistant", content: resp.content as unknown as Anthropic.ContentBlockParam[] });

    if (resp.stop_reason === "pause_turn") continue;
    if (resp.stop_reason !== "tool_use") break;

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      onEvent?.({ type: "tool_start", id: block.id, name: block.name, input: block.input });
      const t0 = Date.now();
      const outcome = await executeTool(block.name, block.input, ctx);
      if (block.name.startsWith("propose_") && outcome.ok) ctx.data = undefined; // reload after a proposal
      const summary = summarize(block.name, block.input, outcome.content, outcome.ok);
      const proposal = outcome.ok ? ((outcome.content as { proposal?: Proposal }).proposal ?? undefined) : undefined;
      if (proposal) proposals.push(proposal);
      toolCalls.push({ id: block.id, name: block.name, input: block.input, ok: outcome.ok, ms: Date.now() - t0, summary });
      onEvent?.({ type: "tool_end", id: block.id, name: block.name, ok: outcome.ok, summary, proposal });
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(outcome.content), ...(outcome.ok ? {} : { is_error: true }) });
    }
    appended.push({ role: "user", content: results });
    if (rounds === MAX_ROUNDS) notice = `Stopped after ${MAX_ROUNDS} tool rounds without a final answer. Ask again or narrow the question.`;
  }

  const text = (last?.content ?? []).flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n\n").trim();
  if (last?.stop_reason === "refusal") notice = "The model declined to answer this request. Rephrase it as a question about the festival's sponsorship data.";
  else if (last?.stop_reason === "max_tokens") notice = "The answer was cut off at the output limit.";
  const result: ChatResult = { appended, text, tool_calls: toolCalls, proposals, usage, rounds, stop_reason: last?.stop_reason ?? null, ms: Date.now() - started, notice };
  console.log(
    `[copilot] model=${model()} rounds=${rounds} calls=${usage.calls} tools=${toolCalls.map((t) => t.name).join(",") || "-"} in=${usage.input_tokens} out=${usage.output_tokens} cache_read=${usage.cache_read_input_tokens} cache_write=${usage.cache_creation_input_tokens} cost_usd=${costUsd(usage).toFixed(4)} ms=${result.ms} stop=${result.stop_reason}`,
  );
  return result;
}
