# PHASE 3 REPORT
STATUS: COMPLETE
COMMIT: bc931a7 on main   TAG: phase-3 (on the commit that adds this report)
This replaces the BLOCKED version of this report (7c506b7). Anthropic credit was added; the eval and the demo rehearsal have now run.
Length: the report body is 167 lines. The file is longer only because Appendix A holds the full `npm run verify` output (REPORTING §6: long lists go in an appendix).

## 0. REVIEWER NOTE 05 UI fixes (done first)
| Item | Change | Verified by | Result |
|---|---|---|---|
| U1 | Diagnose: By owner and By industry stacked full width | layout check below | PASS |
| U2 | e2e/layout.spec.ts: 9 pages (incl. Pipeline drawer and /copilot) + Overview with the copilot panel open, at 1280 and 1440 px. Every element with overflow-x hidden, clip, auto or scroll must have scrollWidth ≤ clientWidth + 1, and the page must not scroll sideways. Marked exception: a wide markdown table inside a copilot answer (`data-allow-hscroll`) | 20/20 pass. At 900 px the same check fails on table containers, so it does detect clipping | PASS |
| U3 (Q1 A) | Settings > Recent changes: read only, last 50 audit_log rows (time IST, actor, action, table, record); empty after Reset | e2e flows 6 and 8; demo step 5 | PASS |
| U4 (Q2 B) | Pipeline and list_opportunities: open, then confirmed, then lost or withdrawn; D9 tie break inside each group; group headers. SPEC §4.4 updated | e2e flow 7 | PASS |
| U5 | Form labels (Meeting held, Proposal sent, In progress, Paused, LinkedIn); stored codes unchanged | e2e flows select by code | PASS |
| Phase 0 defaults missed in Phase 2 | Q8: cash card = collected before festival vs team cash goal, total second. Q26: "Festival held 12–13 Apr (8 days ago)". Assumption 13: tasks created after the simulation date flagged | screenshots, e2e | PASS |

## 1. Done (map to spec)
| Spec ref | Item | Status | How verified |
|---|---|---|---|
| §1, item 1 | Docs read 2026-11-27 (Sonnet 5.5 overview, what's new, migration guide, tool use, caching, effort, thinking, errors); claude-sonnet-5-5, @anthropic-ai/sdk 1.8.0; DECISIONS | done | DECISIONS 2026-11-27 |
| §6.1, item 4 | /api/chat loop (max 6 rounds): effort medium, adaptive thinking kept and passed back unchanged, tool choice auto, no temperature, max_tokens 16000, SDK retries 429/529/5xx (maxRetries 4) then a clear message; refusal and max_tokens notices; prompt caching on tools, system and conversation; 30 requests per hour per IP; usage and cost logged per request | done | eval: cache reads on all 14 questions; server log lines in demo.log |
| §6.1, item 2 | Right side panel on every page (overlay) and /copilot full page, one conversation. Final answer (markdown), collapsed "Data used" (tool, arguments, result summary), proposal cards, working indicator streaming each tool as it runs; thinking never shown | done | demo screenshots steps 2 to 7 |
| §6.2, item 3 | 14 tools on the same engine and analytics functions as the pages, with as_of, origin tags and INR display strings; query_data (text guard, LIMIT 200, READ ONLY, risa_readonly); calculate (restricted mathjs); data_dictionary shared with Settings | done | tests/tools.test.ts |
| §6.2 | Propose tools write only a pending proposal; Confirm writes through lib/writes as copilot (audit row carries proposal id and reason), Edit re-validates, Cancel writes nothing; result reaches the model as an "[App note]" | done | tools.test; eval (0 writes in all 14 questions); demo step 4 and 5 |
| §6.3 | System prompt rules 1–9 (lib/copilot/system-prompt.ts) plus a grounding check for rule 3 (§4) | done | eval |
| §7, item 5 | tests/tools.test.ts: every read tool equals the engine (overview at all 10 reference dates, funnel, compare, ranking and ties, history, badges, collections, budgets, tasks, dictionary), query_data on DATABASE_URL_READONLY_TEST | done | 49/49 |
| §7, item 6 | `npm run eval:copilot` on the test branch per Q19 | done | §2b |
| Item 7 | Demo rehearsal, SPEC §6.5 steps 1–7, reports/phase-3-demo/ | done | §2c |

## 2. Tests
- `npm test` (vitest, test branch only, TZ=UTC): 780 passed (780); files 7 passed (7) (136.47s). metrics 642, writes 23, analytics 48, tools 49, grounding 5, db 8, guard 5.
- `npm run test:e2e` + `npm run screens` (Playwright, production build, test branch only): 37 passed (1.9m): 8 flows, 20 layout checks, 9 screenshots to reports/phase-3-screens/.
- Demo rehearsal (`npm run demo:rehearse`, live model): 1 passed (1.6m).
- lint 0 problems, tsc clean, `next build` clean. Chain exit codes: build exit=0 demo exit=0 e2e exit=0 vitest exit=0 verify exit=0.
- Fixed while iterating, no expected value changed: the first demo run hung at step 5 (the open panel covers the header toggle; it now closes with the panel's own Close, and Playwright clicks time out after 30 s); the demo transcript now stores the raw markdown answer and reads the collapsed "Data used" list with textContent.

## 2b. Copilot eval (REPORTING §5)
Run of record: eval/results/2026-11-27T02-55-13.md (test branch reset, simulation date 2025-04-20, Q04 continues Q03, Q14 asked after O028 was confirmed through lib/writes). Result: 13 PASS, 1 PARTIAL, 0 FAIL. Run cost $0.2191; total input 104, output 9,402, cache read 296,121, cache write 38,107 tokens. cache_read_input_tokens is above 0 on every question, including the first (the cache was warm from the previous run).
| Q | Type | Verdict | Tools called | Latency s | Input | Output | Cache read | One line reason |
|---|---|---|---|---|---|---|---|---|
| Q01 | fact | PASS | get_overview | 4.8 | 6 | 271 | 13,749 | 24 vs 28 from Sponsor revised plan (15 Mar), 4 short, as of 20 Apr, sourced |
| Q02 | calc | PASS | get_campaign_decisions | 6.2 | 6 | 609 | 14,594 | SC05 ₹7,25,000 cash from 9; SC02 and SC05 tie at ₹7,85,000 on cash + in kind |
| Q03 | diagnosis | PASS | get_overview, get_funnel, list_opportunities, get_campaign_decisions | 9.4 | 6 | 1,030 | 11,960 | Cold 33 opps / 0 confirmed, warm 24 of 25, all 26 open stale and cold; evidence vs inference; no loss reasons |
| Q04 | follow_up | PASS | none (uses Q03 results) | 5.6 | 4 | 736 | 15,641 | O028 ₹1,10,000 first; six ₹90,000 deals tied, tie-break rule named |
| Q05 | snapshot | PASS | get_overview | 5.4 | 6 | 330 | 14,337 | 15 and ₹12,60,000 cash, launch plan goal 20; Cobalt in the 15, withdrawn 20 Mar |
| Q06 | calc_caveat | PASS | get_overview | 4.1 | 6 | 289 | 13,723 | ₹18,42,500 / ₹17,90,000 before festival / ₹1,57,500 in 3 overdue; simulated, no bank receipts |
| Q07 | cannot_answer | PARTIAL | get_opportunity_history, data_dictionary, calculate, calculate | 13.3 | 14 | 1,177 | 60,730 | No reason field, task offered; but asserts the withdrawal "is not tied to a fit problem", which the data cannot show |
| Q08 | cannot_answer | PASS | data_dictionary, get_opportunity_history, query_data | 10 | 8 | 727 | 28,740 | Quotes the activation note (association, not incremental impact); no footfall per sponsor; offers a task |
| Q09 | calc | PASS | query_data, get_funnel, calculate, calculate | 7.3 | 8 | 499 | 20,333 | Both: ₹91,667 cash + in kind (6 deals) and ₹97,500 cash only (4), via calculate |
| Q10 | calc_caveat | PASS | get_budgets, calculate | 12.1 | 12 | 1,305 | 28,070 | Simulated spend; cost undefined, not zero, for the 3 cold campaigns; ₹59,100 recomputed after the grounding check |
| Q11 | action | PASS | list_opportunities, propose_task | 10.6 | 8 | 1,012 | 20,111 | Proposal P-1: Riya, 25 Apr, O028, O053, O038; tie flagged, rule named, alternative offered; 0 writes |
| Q12 | calc_caveat | PASS | get_collections, calculate | 6.4 | 8 | 579 | 19,733 | PAY033, PAY034 (₹55,000, 29 Mar), PAY032 (₹47,500, 26 Mar) with days overdue; simulated |
| Q13 | cannot_answer | PASS | get_overview, data_dictionary | 7.1 | 6 | 634 | 22,440 | No forecast; 2025 baseline, weighted pipeline as assumption, cash goal labelled a target |
| Q14 | changed_data | PASS | get_overview | 4.7 | 6 | 204 | 11,960 | 25 at 20 Apr; names the app edit to O028 |
How it got here (seven runs, all on the test branch): a 3-question smoke run and a full run that stopped at Q14 on the credit limit (Phase 3 blocked report), then five full runs after credit was added: 7 PASS / 7 PARTIAL, then 10/4, 13/1, 13/1, 13/1. Changes between runs (DECISIONS 2026-11-27), none tuned to expected text: (1) tools exposed what the model had been guessing or computing in its head: total confirmed value per campaign, cash / in kind split by owner and industry, deals whose status changed after a past as_of, app edits in force, days overdue, and a breakdown of all matching opportunities; query_data timestamps in IST. (2) Rule 3 spelled out (sums, multiples, percentages, day counts need calculate; no "unverified" numbers) and rule 7 (propose on a reasonable reading, state it and the alternative). (3) A grounding check: after a final answer, every number must trace to a tool or calculate result in the conversation; if not, the model is asked once to recompute or remove it, and anything left is shown as a notice. It fired on Q07 and Q10 in the run of record; both final answers were clean. Total eval spend about $1.50.

Full answers (Q03, Q04, Q07, Q11; Q07 is the only PARTIAL):
**Q03** (diagnosis, PASS): Why are we behind on partnerships?
```text
**Short answer:** As of 20 Apr 2025, we have 24 confirmed partnerships against a goal of 28 (revised plan), so we are 4 short. All 24 came from warm channels. The cold channels have 0 confirmed.
**Evidence (sourced unless marked)**
- **Warm channels (SC02, SC04, SC05):** 44 brands contacted and 44 responded. They produced 25 opportunities and 24 confirmed, so 96% of proposals closed.
- **Cold channels (SC01, SC03, SC06):** 141 brands contacted and 70 responded (50%). Only 24 reached a conversation, and 33 opportunities produced 21 proposals and 0 confirmed.
- **Cold campaigns:**
  - SC01 is badged STOP. Its meeting rate is 7.7%, with 11 opportunities and none confirmed.
  - SC03 and SC06 are badged CHANGE, with meeting rates of 27% and 35%.
- **Stale pipeline:** All 26 open opportunities are stale (no update for more than 7 days; stale days is an assumption). They are all cold deals and are worth ₹14,40,000 proposed.
  - 8 are in negotiation, worth ₹7,20,000.
  - The oldest has had no update for 79 days.
  - The largest is Cedar Pantry (O028, ₹1,10,000), with no update for 33 days.
  - The open deals are spread across Riya (10), Nisha (8) and Meera (8).
- **Weighted open pipeline:** ₹6,27,000 (assumption-based weights).
- **Targets:** Qualified brands are at 60 against a goal of 55, so the shortfall is in conversion, not in lead volume.
**Likely explanation (inference)**
- We got enough qualified brands, but the cold-sourced deals didn't close. They were not being followed up: every open deal is stale, including negotiating ones.
- The 4-deal gap could be closed by reviving the stale negotiating deals. This is an inference, not a forecast.
**What the data can't show**
- Loss or withdrawal reasons.
- Why the follow-ups stopped.
- Whether the warm deals had advantages beyond the channel itself.
Cobalt Learning (O006) was a cold deal that was confirmed from 25 Feb to 20 Mar 2025 and then withdrawn. That is why cold shows 0 confirmed only as of 20 Apr.
I can propose follow-up tasks for the 8 stale negotiating deals, assigned to their owners. I can also propose pausing SC01.
```
**Q04** (follow_up, PASS): Of those stuck deals, which are worth the most?
```text
The most valuable stuck deal, as of 20 Apr 2025, is Cedar Pantry (O028) at ₹1,10,000 proposed. All figures are sourced, and stale means no update for more than 7 days (an assumption).
| Rank | Deal | Stage | Value | Campaign | Owner | Days since update |
|---|---|---|---|---|---|---|
| 1 | O028 Cedar Pantry | negotiating | ₹1,10,000 | SC03 | Riya | 33 |
| 2 (tie) | O053 Evergreen Living | negotiating | ₹90,000 | SC06 | Nisha | 73 |
| 2 (tie) | O038 Daybreak Pantry | negotiating | ₹90,000 | SC06 | Nisha | 56 |
| 2 (tie) | O048 Evergreen Pantry | negotiating | ₹90,000 | SC01 | Riya | 47 |
| 2 (tie) | O058 Fable Pantry | negotiating | ₹90,000 | SC03 | Meera | 38 |
| 2 (tie) | O033 Cedar Living | negotiating | ₹90,000 | SC01 | Riya | 30 |
| 2 (tie) | O043 Daybreak Living | negotiating | ₹90,000 | SC03 | Meera | 21 |
| 8 | O027 Bramble Works | negotiating | ₹70,000 | SC01 | Riya | 41 |
- **Tie:** Six deals are tied at ₹90,000. I ordered them by the tie-break rule: value descending, then oldest last update first, then id.
- **Stage:** These are the 8 negotiating deals. All are cash deals from cold campaigns.
- **Where to start:** O053 Evergreen Living has gone the longest without an update (73 days) of the ₹90,000 group.
I can propose follow-up tasks for these deals. Should I do one per deal, or only for the top few?
```
**Q07** (cannot_answer, PARTIAL): Why did Cobalt Learning withdraw?
```text
The data doesn't say why Cobalt Learning withdrew. Opportunity history records only the stage. It has no field for a loss or withdrawal reason. This is as of 20 Apr 2025, and all of it is sourced.
**What the data shows (opportunity O006, SC03 Brand Leader LinkedIn, a cold channel, owner Riya Kapoor):**
- On 15 Feb 2025 it was created at prospecting, with a proposed value of ₹80,000 in cash.
- It moved through contacted on 17 Feb, proposal sent on 20 Feb and negotiating on 23 Feb.
- On 25 Feb 2025 it was confirmed at ₹80,000.
- On 20 Mar 2025 it was withdrawn, and the confirmed value went back to ₹0. That is 23 days after confirmation.
- The brand was qualified on 10 Feb 2025 because audience and partnership fit were confirmed. That qualification has no later change, so the withdrawal is not tied to a fit problem.
- There are no simulated installments for this deal, so I can't show whether a payment issue was involved.
Any reason I gave would be a guess.
I can propose a task for Riya Kapoor, the owner, to ask Cobalt Learning's contact, Meera Bhat, why they withdrew and to record the answer. Do you want that?
```
**Q11** (action, PASS): Create a task for Riya to follow up the three most valuable negotiating deals by 25 April.
```text
I've proposed the task for Riya, due 25 Apr 2025. It isn't created until you click Confirm on the card.
The three deals are the most valuable of the 8 negotiating deals as of 20 Apr 2025 (sourced):
1. O028 Cedar Pantry, ₹1,10,000 (SC03, owner Riya).
2. O053 Evergreen Living, ₹90,000 (SC06, owner Nisha).
3. O038 Daybreak Pantry, ₹90,000 (SC06, owner Nisha).
**Tie:** six deals are tied at ₹90,000: O053, O038, O048, O058, O033 and O043. I applied the tie break rule (value descending, then oldest last update first, then id). That put O053 (last updated 6 Feb 2025) and O038 (23 Feb 2025) in the top three.
**Other reading:** you may have meant only Riya's own negotiating deals. Those would be O028 Cedar Pantry, O048 Evergreen Pantry and O033 Cedar Living. Use Edit on the card, or tell me and I'll propose that version instead.
All three deals in the task are stale, with no update in more than 7 days (the stale-days setting is an assumption). Two of them belong to Nisha, so Riya may need to coordinate with her.
```

## 2c. Demo rehearsal (item 7)
Playwright drove the copilot panel on the freshly reset test branch with the live model: reports/phase-3-demo/transcript.md and 11 screenshots (step-1 … step-7b). Model cost $0.1258 over 5 copilot turns.
1 Overview 24 vs 28; badges SC01 STOP, SC02/SC04/SC05 SCALE, SC03/SC06 CHANGE. 2 "Why are we behind?": evidence (cold 33 opps, 0 confirmed; all 26 open deals stale and cold) vs inference vs data gaps. 3 "Which stuck deals are worth the most?": O028 first, six-way ₹90,000 tie stated with the rule. 4 Pause SC01 + task for Riya by 25 Apr: two cards, both confirmed. 5 Campaigns shows SC01 paused, Tasks shows the copilot task, Recent changes shows both copilot writes. 6 "Why did Cobalt Learning withdraw?": no reason field, task offered. 7 O028 confirmed on Pipeline → Overview 25 and the copilot answers 25, naming the app edit.

## 3. Verify output
Appendix A: `SUMMARY  132/132 OK   0 MISMATCH`, `APP WRITES SINCE RESET: 0` (demo DB; the demo and eval write only to the test branch).

## 4. Deviations from SPEC
| Spec ref | What I did instead | Why | Reversible? |
|---|---|---|---|
| §6.1, §6.3 rule 3 | Added a server-side grounding check: one extra model round when a final answer contains numbers not found in tool or calculate results | Prompt rules alone left 3 to 4 untraced numbers per run, one of them wrong | yes (one call site in lib/copilot/chat.ts) |

## 5. Assumptions I made where SPEC was silent
1. The conversation lives in the browser tab (panel and /copilot share it) and is not saved across reloads.
2. Progress is streamed as tool events; model calls stay non-streaming (Phase 0 assumption 19).
3. The panel overlays the page instead of narrowing it, and closes with its own Close button.
4. Grounding check ignores dates, ids, list numbers and whole numbers up to 10 (ranks, counts of listed items).

## 6. Questions for reviewer (all NON-BLOCKING)
Q1: Keep the grounding check (§4)? Options: A) keep (one extra call only when an answer has untraced numbers) B) remove and rely on the prompt. Default: A.
Q2: In demo step 4 the copilot read "the top negotiating deals" as Riya's own four negotiating deals and said so; in eval Q11 it used the team's top three and offered Riya's own as the alternative. Options: A) leave as is (reading stated, card editable) B) always default to the team-wide reading. Default: A.

## 7. Known issues and risks
1. Answers vary between runs (the model is not deterministic): over the last three full runs, 13 of 14 passed each time, with a different single PARTIAL (Q11 asked first; Q03 missed a total; Q07 overreached).
2. The rate limit and the conversation are in memory: a restart or a new Vercel instance resets them.
3. Not deployed yet; Vercel needs ANTHROPIC_API_KEY, ANTHROPIC_MODEL and DATABASE_URL_READONLY in addition to the database URLs.
4. API spend in Phase 3 is about $1.85 (eval runs about $1.50, three demo runs about $0.35).

## 8. Files changed since the blocked report (tree, new files marked +)
```
+ lib/copilot/grounding.ts  lib/copilot/{chat, tools, query-data, system-prompt}.ts  lib/engine/breakdowns.ts (cash / in kind split)
components/copilot/{copilot-chat, copilot-provider}.tsx (number check indicator, raw markdown)  e2e/demo.spec.ts  playwright.config.ts (action timeout)
+ scripts/grounding-replay.ts  + tests/grounding.test.ts  scripts/eval-copilot.ts (saves per question, grounding notes)  docs/DECISIONS.md (+4)
+ eval/results/2026-11-27T02-35-35, 02-40-57, 02-48-18, 02-51-01, 02-55-13 (.md, .json)  + reports/phase-3-demo/ (transcript.md, 11 png)  reports/phase-3.md
```

## 9. How the owner can see it
`npm run dev`, click Copilot in the header on any page (or open /copilot) and ask, for example, "Why are we behind on partnerships?". Actions come back as cards; Confirm writes, Recent changes (Settings) shows it. Share with the reviewer: this report, reports/phase-3-demo/transcript.md and the step screenshots.

## 10. Ready for next phase?
YES.

## Appendix A. `npm run verify` (demo DB)
```
VERIFY  db=ep-gentle-river-bibkvct8-pooler.c-5.ap-southeast-1.aws.neon.tech  simulation_date=2025-04-20  source_rows=2308  app_rows=0  at=2026-11-27T08:42:02.599+05:30
SNAPSHOT CHECKS (engine on live DB vs reference_metrics.json)
date        metric                                   reference    actual       ok
2025-01-31  confirmed_partnerships                   0            0            OK
2025-01-31  confirmed_value_cash_inr                 0            0            OK
2025-01-31  qualified_brands                         9            9            OK
2025-01-31  proposals                                1            1            OK
2025-01-31  conversation_brands                      6            6            OK
2025-01-31  open_opportunities                       5            5            OK
2025-01-31  stale_open_opportunities_7d              1            1            OK
2025-01-31  cash_collected_inr_simulated             0            0            OK
2025-01-31  projected_cash_before_festival_inr       71100        71100        OK
2025-01-31  qualified_brands_goal                    40           40           OK
2025-01-31  confirmed_partnerships_goal              20           20           OK
2025-02-24  confirmed_partnerships                   6            6            OK
2025-02-24  confirmed_value_cash_inr                 410000       410000       OK
2025-02-24  qualified_brands                         34           34           OK
2025-02-24  proposals                                17           17           OK
2025-02-24  conversation_brands                      31           31           OK
2025-02-24  open_opportunities                       22           22           OK
2025-02-24  stale_open_opportunities_7d              8            8            OK
2025-02-24  cash_collected_inr_simulated             117500       117500       OK
2025-02-24  projected_cash_before_festival_inr       862700       862700       OK
2025-02-24  qualified_brands_goal                    40           40           OK
2025-02-24  confirmed_partnerships_goal              20           20           OK
2025-02-25  confirmed_partnerships                   7            7            OK
2025-02-25  confirmed_value_cash_inr                 490000       490000       OK
2025-02-25  qualified_brands                         36           36           OK
2025-02-25  proposals                                18           18           OK
2025-02-25  conversation_brands                      32           32           OK
2025-02-25  open_opportunities                       23           23           OK
2025-02-25  stale_open_opportunities_7d              9            9            OK
2025-02-25  cash_collected_inr_simulated             117500       117500       OK
2025-02-25  projected_cash_before_festival_inr       930650       930650       OK
2025-02-25  qualified_brands_goal                    40           40           OK
2025-02-25  confirmed_partnerships_goal              20           20           OK
2025-03-10  confirmed_partnerships                   15           15           OK
2025-03-10  confirmed_value_cash_inr                 1260000      1260000      OK
2025-03-10  qualified_brands                         51           51           OK
2025-03-10  proposals                                31           31           OK
2025-03-10  conversation_brands                      48           48           OK
2025-03-10  open_opportunities                       28           28           OK
2025-03-10  stale_open_opportunities_7d              14           14           OK
2025-03-10  cash_collected_inr_simulated             465000       465000       OK
2025-03-10  projected_cash_before_festival_inr       1630050      1630050      OK
2025-03-10  qualified_brands_goal                    40           40           OK
2025-03-10  confirmed_partnerships_goal              20           20           OK
2025-03-14  confirmed_partnerships                   17           17           OK
2025-03-14  confirmed_value_cash_inr                 1325000      1325000      OK
2025-03-14  qualified_brands                         53           53           OK
2025-03-14  proposals                                35           35           OK
2025-03-14  conversation_brands                      51           51           OK
2025-03-14  open_opportunities                       29           29           OK
2025-03-14  stale_open_opportunities_7d              17           17           OK
2025-03-14  cash_collected_inr_simulated             590000       590000       OK
2025-03-14  projected_cash_before_festival_inr       1850000      1850000      OK
2025-03-14  qualified_brands_goal                    40           40           OK
2025-03-14  confirmed_partnerships_goal              20           20           OK
2025-03-15  confirmed_partnerships                   17           17           OK
2025-03-15  confirmed_value_cash_inr                 1325000      1325000      OK
2025-03-15  qualified_brands                         55           55           OK
2025-03-15  proposals                                35           35           OK
2025-03-15  conversation_brands                      53           53           OK
2025-03-15  open_opportunities                       30           30           OK
2025-03-15  stale_open_opportunities_7d              17           17           OK
2025-03-15  cash_collected_inr_simulated             590000       590000       OK
2025-03-15  projected_cash_before_festival_inr       1861250      1861250      OK
2025-03-15  qualified_brands_goal                    55           55           OK
2025-03-15  confirmed_partnerships_goal              28           28           OK
2025-03-20  confirmed_partnerships                   19           19           OK
2025-03-20  confirmed_value_cash_inr                 1420000      1420000      OK
2025-03-20  qualified_brands                         58           58           OK
2025-03-20  proposals                                39           39           OK
2025-03-20  conversation_brands                      57           57           OK
2025-03-20  open_opportunities                       31           31           OK
2025-03-20  stale_open_opportunities_7d              20           20           OK
2025-03-20  cash_collected_inr_simulated             905000       905000       OK
2025-03-20  projected_cash_before_festival_inr       2013350      2013350      OK
2025-03-20  qualified_brands_goal                    55           55           OK
2025-03-20  confirmed_partnerships_goal              28           28           OK
2025-03-31  confirmed_partnerships                   23           23           OK
2025-03-31  confirmed_value_cash_inr                 1850000      1850000      OK
2025-03-31  qualified_brands                         60           60           OK
2025-03-31  proposals                                46           46           OK
2025-03-31  conversation_brands                      60           60           OK
2025-03-31  open_opportunities                       29           29           OK
2025-03-31  stale_open_opportunities_7d              24           24           OK
2025-03-31  cash_collected_inr_simulated             1210000      1210000      OK
2025-03-31  projected_cash_before_festival_inr       2515000      2515000      OK
2025-03-31  qualified_brands_goal                    55           55           OK
2025-03-31  confirmed_partnerships_goal              28           28           OK
2025-04-11  confirmed_partnerships                   24           24           OK
2025-04-11  confirmed_value_cash_inr                 2000000      2000000      OK
2025-04-11  qualified_brands                         60           60           OK
2025-04-11  proposals                                46           46           OK
2025-04-11  conversation_brands                      60           60           OK
2025-04-11  open_opportunities                       26           26           OK
2025-04-11  stale_open_opportunities_7d              26           26           OK
2025-04-11  cash_collected_inr_simulated             1790000      1790000      OK
2025-04-11  projected_cash_before_festival_inr       2543300      2543300      OK
2025-04-11  qualified_brands_goal                    55           55           OK
2025-04-11  confirmed_partnerships_goal              28           28           OK
2025-04-20  confirmed_partnerships                   24           24           OK
2025-04-20  confirmed_value_cash_inr                 2000000      2000000      OK
2025-04-20  qualified_brands                         60           60           OK
2025-04-20  proposals                                46           46           OK
2025-04-20  conversation_brands                      60           60           OK
2025-04-20  open_opportunities                       26           26           OK
2025-04-20  stale_open_opportunities_7d              26           26           OK
2025-04-20  cash_collected_inr_simulated             1842500      1842500      OK
2025-04-20  projected_cash_before_festival_inr       1790000      1790000      OK
2025-04-20  qualified_brands_goal                    55           55           OK
2025-04-20  confirmed_partnerships_goal              28           28           OK
CAMPAIGN CHECKS (2025-04-20)
SC01 confirmed=0 ref=0 OK | decision=STOP ref=STOP OK
SC02 confirmed=8 ref=8 OK | decision=SCALE ref=SCALE OK
SC03 confirmed=0 ref=0 OK | decision=CHANGE ref=CHANGE OK
SC04 confirmed=7 ref=7 OK | decision=SCALE ref=SCALE OK
SC05 confirmed=9 ref=9 OK | decision=SCALE ref=SCALE OK
SC06 confirmed=0 ref=0 OK | decision=CHANGE ref=CHANGE OK
EDGE CASES
cobalt_learning_O_id O006 ref=O006 OK
cobalt_confirmed_2025_03_10 true ref=true OK
cobalt_confirmed_2025_04_20 false ref=false OK
beardo_opportunities 2 ref=2 OK
raw interactions 953 ref=953 OK
dedupe interactions 950 ref=950 OK
raw qualification 434 ref=434 OK
dedupe qualification 433 ref=433 OK
raw opportunity_history 230 ref=230 OK
dedupe opportunity_history 228 ref=228 OK
SUMMARY  132/132 OK   0 MISMATCH
APP WRITES SINCE RESET: 0
```
