/**
 * Cost guard (SPEC §6.1): at most 30 /api/chat requests per hour per IP. In memory per server instance,
 * which SPEC allows; a restart or a new serverless instance starts a fresh window.
 */
const WINDOW_MS = 60 * 60 * 1000;
export const CHAT_LIMIT_PER_HOUR = 30;
const hits = new Map<string, number[]>();

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}

export function takeChatSlot(ip: string, now = Date.now()): { ok: boolean; remaining: number; retryAfterS: number } {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= CHAT_LIMIT_PER_HOUR) {
    hits.set(ip, recent);
    return { ok: false, remaining: 0, retryAfterS: Math.ceil((WINDOW_MS - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(ip, recent);
  return { ok: true, remaining: CHAT_LIMIT_PER_HOUR - recent.length, retryAfterS: 0 };
}
