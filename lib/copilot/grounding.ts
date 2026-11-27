/**
 * Grounding check for rule 3 (SPEC §6.3, CONTEXT §6.5): every number in a final answer must come from a
 * tool result (read tools or calculate) or the user's own words in this conversation. Numbers that do
 * not are returned so the loop can ask the model once to calculate or remove them.
 *
 * Ignored: dates and times, ids (O028, SC01, PAY033, APP-OH-1, T01, P-1), list numbering, years, and
 * whole numbers up to 10 (ranks, counts of listed items). Rounding is tolerated at the precision shown
 * (85.71 -> "86%", 105.833 -> "105.8"); ratios match their percentage; ₹22.4L and 18.4 lakh match rupees.
 */
import type Anthropic from "@anthropic-ai/sdk";

export const GROUNDING_NOTE_PREFIX = "[App note] Grounding check:";

const MONTHS = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?";

/** Remove text whose digits are not quantities: dates, times, ids, years, list markers. */
function stripNonQuantities(text: string): string {
  return text
    .replace(/\d{4}-\d{2}-\d{2}(T[\d:.+Z-]*)?/g, " ")
    .replace(new RegExp(`\\b\\d{1,2}(?:\\s*(?:–|-|to|and)\\s*\\d{1,2})?\\s+${MONTHS}(?:\\s+\\d{4})?`, "gi"), " ")
    .replace(new RegExp(`\\b${MONTHS}\\s+\\d{1,2}(?:,?\\s+\\d{4})?`, "gi"), " ")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?/g, " ")
    .replace(/\b[A-Za-z]+[-_]?[A-Za-z]*-?\d+[A-Za-z0-9-]*\b/g, " ") // O028, SC01, PAY033, APP-OH-1, P-1, Q14, T01
    .replace(/\b20[2-3]\d\b/g, " ")
    .replace(/^\s*\d+[.)]\s/gm, " ")
    .replace(/\bRule\s+\d\b/gi, " ");
}

interface TextNumber {
  raw: string;
  value: number;
  tolerance: number;
  percent: boolean;
}

export function numbersInText(text: string): TextNumber[] {
  const out: TextNumber[] = [];
  const re = /(₹\s?)?([−-])?(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d+)?\s*(%|\s?(?:L\b|lakh|Cr\b|crore))?/gi;
  for (const m of stripNonQuantities(text).matchAll(re)) {
    const whole = m[3].replace(/,/g, "");
    const dec = m[4] ?? "";
    const unit = (m[5] ?? "").trim().toLowerCase();
    let value = Number(`${whole}${dec}`);
    const decimals = dec ? dec.length - 1 : 0;
    let tolerance = decimals ? 0.5 * 10 ** -decimals : 0.5;
    if (unit === "l" || unit === "lakh") {
      value *= 1e5;
      tolerance *= 1e5;
    } else if (unit === "cr" || unit === "crore") {
      value *= 1e7;
      tolerance *= 1e7;
    }
    const percent = unit === "%";
    if (!percent && !m[1] && !decimals && !unit && value <= 10) continue;
    out.push({ raw: m[0].trim(), value, tolerance, percent });
  }
  return out;
}

function collect(v: unknown, into: number[]): void {
  if (typeof v === "number" && Number.isFinite(v)) into.push(v);
  else if (typeof v === "string") for (const n of numbersInText(v)) into.push(n.value);
  else if (Array.isArray(v)) for (const x of v) collect(x, into);
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      if (k === "expression") continue; // calculate: trust the result, not the operands the model typed
      collect(x, into);
    }
}

/** Numbers the answer may use: everything in tool results and in what the user typed. */
export function knownNumbers(messages: Anthropic.MessageParam[]): number[] {
  const nums: number[] = [];
  for (const m of messages) {
    if (m.role !== "user") continue;
    const blocks = typeof m.content === "string" ? [{ type: "text", text: m.content } as const] : m.content;
    for (const b of blocks) {
      if (b.type === "text" && !b.text.startsWith(GROUNDING_NOTE_PREFIX)) collect(b.text, nums);
      if (b.type === "tool_result") {
        const c = b.content;
        const texts = typeof c === "string" ? [c] : (c ?? []).flatMap((x) => (x.type === "text" ? [x.text] : []));
        for (const t of texts) {
          try {
            collect(JSON.parse(t), nums);
          } catch {
            collect(t, nums);
          }
        }
      }
    }
  }
  const out = new Set<number>();
  for (const n of nums) {
    out.add(n);
    out.add(Math.abs(n));
    if (Math.abs(n) <= 10) out.add(Math.abs(n) * 100); // ratio shown as a percentage
  }
  return [...out];
}

/** Raw tokens of numbers in `text` that no known number explains. */
export function findUnverifiedNumbers(text: string, messages: Anthropic.MessageParam[]): string[] {
  const known = knownNumbers(messages);
  const bad: string[] = [];
  for (const n of numbersInText(text)) {
    const ok = known.some((k) => Math.abs(k - n.value) <= n.tolerance + 1e-9);
    if (!ok && !bad.includes(n.raw)) bad.push(n.raw);
  }
  return bad;
}

export function groundingNote(unverified: string[]): string {
  return `${GROUNDING_NOTE_PREFIX} these numbers in your last answer do not appear in any tool or calculate result in this conversation: ${unverified.join(", ")}. Recompute each one with calculate (several calls in one step are fine) or remove it, then give your complete final answer again. Do not mention this check.`;
}
