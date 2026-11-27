/** Grounding check (rule 3): numbers in answers must trace to tool or calculate results. Pure, no DB. */
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { findUnverifiedNumbers, groundingNote, numbersInText } from "../lib/copilot/grounding";

const tool = (obj: unknown): Anthropic.MessageParam => ({ role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: JSON.stringify(obj) }] });
const history: Anthropic.MessageParam[] = [
  { role: "user", content: "Create a task for Riya due 25 April for the three top deals" },
  tool({ metrics: { confirmed_partnerships: 24, cash_collected_inr_simulated: 1842500, weighted_open_pipeline_inr: 627000 }, meeting_rate: 0.07692, display: "₹7,25,000", per_rupee: 105.8333, gap: -4 }),
  tool({ expression: "24/28*100", result: 85.7142857143 }),
];

describe("numbersInText", () => {
  it("ignores dates, times, ids, years, list numbers and small counts", () => {
    const t = "1. On 20 Apr 2025 at 09:00 (2025-04-20), O028 and SC01 had 3 deals; P-1 and APP-OH-1 are ids; 12–13 Apr; between 12 and 19 Mar.";
    expect(numbersInText(t)).toEqual([]);
  });
  it("reads INR with Indian grouping, lakh and percentages", () => {
    expect(numbersInText("₹18,42,500 and ₹22.4L and 86%").map((n) => [n.value, n.percent])).toEqual([
      [1842500, false],
      [2240000, false],
      [86, true],
    ]);
  });
});

describe("findUnverifiedNumbers", () => {
  it("accepts numbers from tools, display strings, calculate results (rounded) and percentages of ratios", () => {
    const answer = "24 confirmed vs 28 goal, 4 short (86% of goal). Collected ₹18,42,500 (₹18.4L). Weighted ₹6,27,000. SC05 ₹7,25,000. Meeting rate 7.7%. ₹105.8 per rupee.";
    expect(findUnverifiedNumbers(answer, history)).toEqual(["28"]);
  });
  it("accepts numbers the user typed and never trusts its own grounding note", () => {
    const withNote: Anthropic.MessageParam[] = [...history, { role: "user", content: [{ type: "text", text: groundingNote(["₹59,100"]) }] }];
    expect(findUnverifiedNumbers("Due 25 April. Spent ₹59,100.", withNote)).toEqual(["₹59,100"]);
  });
  it("flags sums and multiples worked out in the head", () => {
    expect(findUnverifiedNumbers("Together ₹7,00,000, about 5.7 times as much, 185 brands.", history)).toEqual(["₹7,00,000", "5.7", "185"]);
  });
});
