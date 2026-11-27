/** Grounding check (rules 3, 10, 11; REVIEWER NOTE 06 E2 to E4): numbers, ids, names, counts and ranges must trace to tool results. Pure, no DB. */
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { countsInText, findUnverifiedNumbers, groundingIssues, groundingNote, numbersInText, proposalRejection, rangesInText } from "../lib/copilot/grounding";
import { buildRecordIndex } from "../lib/copilot/ids";
import type { Dataset } from "../lib/engine";

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
    const withNote: Anthropic.MessageParam[] = [...history, { role: "user", content: [{ type: "text", text: groundingNote({ numbers: ["₹59,100"], ids: [], names: [], missing_ids: [], counts: [], ranges: [] }) }] }];
    expect(findUnverifiedNumbers("Due 25 April. Spent ₹59,100.", withNote)).toEqual(["₹59,100"]);
  });
  it("flags sums and multiples worked out in the head", () => {
    expect(findUnverifiedNumbers("Together ₹7,00,000, about 5.7 times as much, 185 brands.", history)).toEqual(["₹7,00,000", "5.7", "185"]);
  });
});

// A tiny record set: ids and names as in the data.
const opp = (opportunity_id: string, brand_name: string) => ({ opportunity_id, brand_name, opportunity_name: `${brand_name} festival partnership` });
const records = buildRecordIndex({
  opportunities: [opp("O035", "Cedar Wellness"), opp("O036", "Cedar Threads"), opp("O056", "Evergreen Threads"), opp("O028", "Cedar Pantry"), opp("O048", "Evergreen Pantry"), opp("O033", "Cedar Living"), opp("O027", "Bramble Works"), opp("O006", "Cobalt Learning")],
  campaigns: [{ sponsor_campaign_id: "SC01", campaign_name: "Brand Discovery Email" }],
  payments: [],
  tasks: [],
} as unknown as Dataset);
const beardo = buildRecordIndex({
  opportunities: [opp("O001", "Beardo")],
  campaigns: [],
  payments: [],
  tasks: [],
  brands: [{ brand_id: "A001", brand_name: "Beardo" }],
} as unknown as Dataset);
const listResult = tool({
  total_matching: 4,
  summary: { count: 4, ranges: { days_since_update: { min: 30, max: 47 } }, by_campaign: { "SC01 Brand Discovery Email": { count: 3 }, "SC03 Brand Leader LinkedIn": { count: 1 } } },
  opportunities: [
    { opportunity_id: "O028", brand_name: "Cedar Pantry", days_since_update: 33 },
    { opportunity_id: "O048", brand_name: "Evergreen Pantry", days_since_update: 47 },
    { opportunity_id: "O033", brand_name: "Cedar Living", days_since_update: 30 },
    { opportunity_id: "O027", brand_name: "Bramble Works", days_since_update: 41 },
  ],
});
const oldest = tool({ opportunities: [{ opportunity_id: "O036", brand_name: "Cedar Threads", days_since_update: 79 }, { opportunity_id: "O056", brand_name: "Evergreen Threads", days_since_update: 61 }] });

describe("ids and names (E2)", () => {
  const h: Anthropic.MessageParam[] = [{ role: "user", content: "Which deal is oldest?" }, oldest];
  it("flags a name that belongs to another id, and a deal named without its id (evidence 1)", () => {
    const g = groundingIssues("The oldest is O036 Evergreen Threads, last updated 79 days ago.", h, records);
    expect(g.names).toEqual(['O036 is Cedar Threads, not "Evergreen Threads"']);
    expect(groundingIssues("The oldest, Evergreen Threads, was last updated 79 days ago.", h, records).missing_ids).toEqual(["Evergreen Threads"]);
    expect(groundingIssues("| O036 | Cedar Threads | 79 |", h, records)).toMatchObject({ names: [], missing_ids: [], ids: [] });
    expect(groundingIssues("Cedar Threads (O036) was last updated 79 days ago.", h, records).names).toEqual([]);
  });
  it("a brand id beside the brand name counts as its id (run 1 false notice)", () => {
    expect(groundingIssues("The sponsorship by A001 Beardo is not measured.", h, beardo).missing_ids).toEqual([]);
    expect(groundingIssues("The sponsorship by Beardo is not measured.", h, beardo).missing_ids).toEqual(["Beardo"]);
  });
  it("F1: a name passes when its id appears anywhere in the same answer; a name with no id anywhere and a wrong name beside an id still fail", () => {
    const h06: Anthropic.MessageParam[] = [{ role: "user", content: "Why did Cobalt Learning withdraw?" }, tool({ opportunity_id: "O006", brand_name: "Cobalt Learning" }), oldest];
    expect(groundingIssues("O006 Cobalt Learning festival partnership was withdrawn. The brand (Cobalt Learning) was qualified.", h06, records).missing_ids).toEqual([]);
    expect(groundingIssues("O036 Cedar Threads is in SC01. The oldest, Evergreen Threads, was last updated 79 days ago.", h06, records).missing_ids).toEqual(["Evergreen Threads"]);
    expect(groundingIssues("O056 Cedar Threads was last updated 61 days ago.", h06, records).names).toEqual(['O056 is Evergreen Threads, not "Cedar Threads"']);
  });
  it("flags ids no tool returned", () => {
    expect(groundingIssues("O035 Cedar Wellness is older.", h, records).ids).toEqual(["O035"]);
  });
});

describe("counts and ranges (E3)", () => {
  const ask: Anthropic.MessageParam = { role: "user", content: "Pause SC01 and give Riya a task for her negotiating deals" };
  it("reads counts but not ranks or list numbers", () => {
    expect(countsInText("Two of them (O048 and O033) are in the task. 1. First item. Rank 2 is tied. I can make one task per owner.").map((c) => [c.raw, c.value])).toEqual([["Two of them", 2]]);
    expect(countsInText("Riya owns 4 negotiating deals; all nine are stale; 3 of the 4 are in SC01.").map((c) => c.value)).toEqual([4, 3, 4, 9]);
  });
  it("a count must come from a tool result or calculate made for this answer (evidence 3)", () => {
    const earlier: Anthropic.MessageParam[] = [ask, listResult, { role: "assistant", content: "..." }, { role: "user", content: "And how many are in SC01?" }];
    expect(groundingIssues("Two of them (O048 and O033) are in SC01.", earlier).counts).toEqual(["Two of them"]);
    expect(groundingIssues("Three of them (O048, O033 and O027) are in SC01.", [...earlier, listResult]).counts).toEqual([]);
  });
  it("a range must be a summary's min and max or calculate results (evidence 2)", () => {
    expect(rangesInText("last updated 30 to 41 days ago").map((r) => [r.a.value, r.b.value])).toEqual([[30, 41]]);
    expect(rangesInText("Ranks 2 to 7 are tied")).toEqual([]);
    expect(groundingIssues("All four were last updated 30 to 41 days ago.", [ask, listResult]).ranges).toEqual(["30 to 41"]);
    expect(groundingIssues("All four were last updated 30 to 47 days ago.", [ask, listResult]).ranges).toEqual([]);
  });
});

describe("proposals (E4)", () => {
  it("a proposal's notes get the same check and a rejection that says why", () => {
    const g = groundingIssues("O028, O048, O033 and O027: last updated 30 to 41 days ago.", [{ role: "user", content: "Task for Riya" }, listResult], records);
    expect(g.ranges).toEqual(["30 to 41"]);
    expect(proposalRejection(g)).toMatch(/^Proposal not created: .*30 to 41/);
  });
});
