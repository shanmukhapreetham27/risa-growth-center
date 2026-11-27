/**
 * POST /api/chat (SPEC §6.1). Body: { messages } = the full Anthropic history kept by the client,
 * ending with the new user turn. Responds with newline-delimited JSON events so the panel can show
 * which tool is running: {type:"round"|"tool_start"|"tool_end"} ..., then {type:"done", result} or
 * {type:"error", message}. The API key stays on the server.
 */
import Anthropic from "@anthropic-ai/sdk";
import { type ChatEvent, runChat } from "@/lib/copilot/chat";
import { takeDailySlot } from "@/lib/server/daily-cap";
import { clientIp, takeChatSlot } from "@/lib/server/rate-limit";
import { getReadonlySql, getSql } from "@/lib/server/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function friendly(e: unknown): string {
  if (e instanceof Anthropic.APIError) {
    if (e.status === 429) return "The AI service is rate limited right now (429) even after retries. Wait a minute and ask again.";
    if (e.status === 529 || (e.status ?? 0) >= 500) return `The AI service is overloaded or unavailable (${e.status}) even after retries. Try again shortly.`;
    if (e.status === 401) return "The server's Anthropic API key was rejected (401).";
    if (e.status === 400) return `The AI request was rejected (400): ${e.message}`;
    return `AI service error (${e.status ?? "network"}): ${e.message}`;
  }
  return e instanceof Error ? e.message : String(e);
}

export async function POST(req: Request) {
  const slot = takeChatSlot(clientIp(req.headers));
  if (!slot.ok)
    return Response.json({ type: "error", message: `Limit reached: 30 copilot requests per hour. Try again in about ${Math.ceil(slot.retryAfterS / 60)} minutes.` }, { status: 429, headers: { "Retry-After": String(slot.retryAfterS) } });

  // Global cap: 300 requests per IST day for everyone together (REVIEWER NOTE 06 P1).
  let daily;
  try {
    daily = await takeDailySlot(getSql());
  } catch (e) {
    console.error("[copilot] daily cap check failed", e instanceof Error ? e.message : e);
    return Response.json({ type: "error", message: "The copilot could not check its daily usage limit, so it is not answering right now. Try again shortly." }, { status: 503 });
  }
  if (!daily.ok) {
    const h = Math.floor(daily.resetInS / 3600);
    const m = Math.ceil((daily.resetInS % 3600) / 60);
    return Response.json(
      { type: "error", message: `The copilot has answered its ${daily.limit} questions for today, the limit shared by everyone using this demo. It resets at midnight India time (IST), in about ${h ? `${h} h ` : ""}${m} min. All pages still work without it.` },
      { status: 429, headers: { "Retry-After": String(daily.resetInS) } },
    );
  }

  let messages: Anthropic.MessageParam[];
  try {
    const body = (await req.json()) as { messages?: Anthropic.MessageParam[] };
    messages = body.messages ?? [];
    if (!Array.isArray(messages) || messages.length === 0 || messages[messages.length - 1]?.role !== "user") throw new Error("messages must end with a user turn");
  } catch (e) {
    return Response.json({ type: "error", message: e instanceof Error ? e.message : "bad request" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      try {
        const result = await runChat(messages, { sql: getSql(), readonlySql: getReadonlySql() }, (e: ChatEvent) => send(e));
        send({ type: "done", result });
      } catch (e) {
        console.error("[copilot] error", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
        send({ type: "error", message: friendly(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-RateLimit-Remaining": String(slot.remaining) } });
}
