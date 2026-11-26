/**
 * npm run check:anthropic — confirms ANTHROPIC_API_KEY is present and accepted, without printing it.
 * Sends one tiny request (a few tokens) to ANTHROPIC_MODEL.
 */
import Anthropic from "@anthropic-ai/sdk";
import { loadEnv } from "../lib/env";

async function main() {
  loadEnv();
  const key = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  console.log(`ANTHROPIC_API_KEY ${key ? "present" : "MISSING"}; ANTHROPIC_MODEL ${model}`);
  if (!key) process.exit(1);
  const client = new Anthropic({ apiKey: key, maxRetries: 2 });
  const t0 = Date.now();
  const r = await client.messages.create({
    model,
    max_tokens: 64,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: "Reply with the single word OK." }],
  });
  const text = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  console.log(`call OK in ${Date.now() - t0} ms: model=${r.model} stop_reason=${r.stop_reason} reply=${JSON.stringify(text)} usage in/out=${r.usage.input_tokens}/${r.usage.output_tokens}`);
}

main().catch((e) => {
  const status = e instanceof Anthropic.APIError ? ` status ${e.status}` : "";
  console.error(`check FAILED${status}: ${e instanceof Error ? e.name : "error"}`);
  process.exit(1);
});
