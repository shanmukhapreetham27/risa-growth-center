# PHASE 3 REPORT
STATUS: BLOCKED. The Anthropic API now rejects every request with 400 "Your credit balance is too low". The eval stopped at Q14, and the demo rehearsal cannot run. Everything that does not call the model is built and tested.
COMMIT: e836e35 on main   TAG: none yet. phase-3 is tagged after the eval and demo have run (Q1).

## 0. REVIEWER NOTE 05 UI fixes (done first)
| Item | Change made | Verified by | Result |
|---|---|---|---|
| U1 | Diagnose: By owner and By industry tables stacked full width | e2e/layout.spec.ts (below); phase-3-screens/02-diagnose.png | PASS |
| U2 | e2e/layout.spec.ts covers 9 pages (incl. the Pipeline drawer and /copilot) plus Overview with the copilot panel open, at 1280 and 1440 px. For every element with overflow-x hidden, clip, auto or scroll, scrollWidth must be ≤ clientWidth + 1, and the page must not scroll sideways. One marked horizontal scroller: a wide markdown table inside a copilot answer (`data-allow-hscroll`) | 20/20 pass. The same check at 900 px fails on the table containers, so it does detect clipping | PASS |
| U3 (Q1 A) | Settings > Recent changes: read-only, last 50 audit_log rows (time IST, actor User/Copilot, action, table, record). Reset empties it | e2e flow 6 (newest row task.create; all write types listed); flow 8 (empty after reset) | PASS |
| U4 (Q2 B) | Pipeline: open first, then partner confirmed, then lost or withdrawn, each with the D9 tie break; group header rows; ties marked inside a group. list_opportunities uses the same order. SPEC §4.4 and DECISIONS updated | e2e flow 7 (group order; open starts with the six ₹90,000 ties in tie-break order); phase-3-screens/04-pipeline.png | PASS |
| U5 | Forms show labels (Meeting held, Proposal sent, Unqualified, In progress, Paused, LinkedIn); stored codes unchanged | e2e flows still select by code; screenshots | PASS |
| Phase 0 defaults missed in Phase 2 | Q8: the Overview cash card shows cash collected before the festival vs the team cash goal (₹17.9L / ₹24.5L), with the total second and the goal labelled next-edition base case. Q26: header says "Festival held 12–13 Apr (8 days ago)". Assumption 13: tasks created after the simulation date are flagged | phase-3-screens/01, 07, 09; e2e flows | PASS |

## 1. Done (map to spec)
| Spec ref | Item | Status | How verified |
|---|---|---|---|
| §1, note 05 item 1 | Docs read 2026-11-27 (Sonnet 5.5 overview, what's new, migration guide, tool use, caching, effort, thinking, errors). Model claude-sonnet-5-5, @anthropic-ai/sdk 1.8.0. Logged in DECISIONS.md | done | DECISIONS 2026-11-27 rows |
| §6.1, item 4 | /api/chat loop: max 6 rounds, non-streaming model calls; effort medium; adaptive thinking on and blocks passed back unchanged; tool choice auto; no temperature; max_tokens 16000; SDK retries 429/529/5xx (maxRetries 4) with a clear message after; refusal and max_tokens notices; 30 requests per hour per IP; usage and cost logged per request; prompt caching on tools, system and conversation | done | Smoke and partial eval runs (§3): cache reads from the first question, retries not triggered |
| §6.1, item 2 | Right side panel on every page (overlay, toggle in header) and /copilot full page, one shared conversation. Shows the final answer (markdown), a collapsed "Data used" list (each tool + arguments + short result), proposal cards, a working indicator listing each tool as it runs (streamed events). Thinking text is never shown | done | 09-copilot.png; layout check with the panel open. Answers render only once credit is back (demo) |
| §6.2, item 3 | 14 tools. Reads call the same engine and analytics functions as the pages and add as_of, origin tags and INR display strings. query_data: text guard, LIMIT 200, READ ONLY transaction, role risa_readonly. calculate: restricted mathjs. data_dictionary shares lib/dictionary.ts with Settings | done | tests/tools.test.ts 49/49 |
| §6.2 proposals | propose_* insert a pending chat_proposals row only. Confirm → /api/proposals/:id/confirm → lib/writes with actor copilot (audit row includes the proposal id, reason and edited fields); Edit re-validates; Cancel writes nothing. The result reaches the model as an "[App note]" on the next turn | done | tools.test (no write before Confirm, copilot actor, double confirm refused, Cancel, edits) |
| §6.3 | System prompt with rules 1–9 in lib/copilot/system-prompt.ts. Tightened once after the smoke run (DECISIONS) | done | Smoke run vs full run (§3) |
| §7, item 5 | tests/tools.test.ts: tool outputs = engine (overview at all 10 reference dates, funnel, compare, ranking and ties, history, badges, collections, budgets, tasks, dictionary) | done | 49/49 |
| §7, item 6 | scripts/eval-copilot.ts (`npm run eval:copilot`) per Q19, saving after every question | built; full run BLOCKED | §3 |
| Item 7 | e2e/demo.spec.ts (`npm run demo:rehearse`): SPEC §6.5 steps 1–7, transcript plus one screenshot per step to reports/phase-3-demo/ | built; not run (BLOCKED) | Q1 |

## 2. Tests
- `npm test` (vitest, test branch only, TZ=UTC): 775/775 passed, 0 failed (6 files, 131 s). metrics 642, writes 23, analytics 48, tools 49 (new), db 8, guard 5.
- `npm run test:e2e` + `npm run screens` (Playwright, production build, test branch only): 37/37 passed (1.8 min). 8 flows (the 6 from Phase 2, plus Recent changes and Pipeline groups; the Reset flow now also checks that Recent changes is empty), 20 layout checks, 9 screenshots to reports/phase-3-screens/ (Phase 2 images left unchanged).
- `npm run lint` 0 problems, `tsc` clean, `next build` clean (11 dynamic routes incl. /api/chat and the proposal routes).
- Failures fixed while iterating, with no expected value changed: none in vitest; the Playwright suites passed on their first full run.

## 3. Copilot eval (partial; BLOCKED)
Run 1 (smoke, Q01, Q03, Q04, before the system prompt change), saved as eval/results/2026-11-26T21-54-04.md:
| Q | Type | Verdict | Tools called | Latency s | In / out / cache read | One line reason |
|---|---|---|---|---|---|---|
| Q01 | fact | PARTIAL | get_overview | 4.5 | 6 / 290 / 5,497 | 24 vs 28 from Sponsor revised plan (15 Mar), 4 short, as of 20 Apr, but "about 86% of the goal" was not calculated |
| Q03 | diagnosis | PARTIAL | get_overview, get_funnel | 9.8 | 6 / 1,001 / 10,886 | Evidence and inference separated; per-campaign cold rows (11, 12, 10 opps, 0 confirmed) but no 33 total; all 26 stale; Cobalt dated correctly; no mention of missing loss reasons; "I haven't checked" where stale deals sit |
| Q04 | follow_up | PASS | list_opportunities | 7.9 | 6 / 872 / 17,968 | O028 Cedar Pantry ₹1,10,000 first; the six ₹90,000 deals listed as tied, tie-break rule named |
After that run I tightened rule 3 (every stated number must come from a tool or calculate) and added diagnosis guidance (compare channel groups, verify instead of guessing, name data gaps). Neither change targets the expected answers.

Run 2 (full, all 14): Q01–Q13 completed, then Q14's first model call failed with 400 "credit balance is too low". The script only wrote files at the end, so the Q01–Q13 answers were lost. It now saves after every question. Per-question numbers from the console:
| Q | Tools called | Latency s | Input | Output | Cache read | Cache write | Cost USD |
|---|---|---|---|---|---|---|---|
| Q04 | calculate (follow-up to Q03) | 6.7 | 6 | 786 | 30,874 | n/c | 0.0139 |
| Q05 | get_overview | 3.1 | 6 | 240 | 11,359 | 1,836 | 0.0081 |
| Q06 | get_overview | 3.5 | 6 | 309 | 11,349 | 1,804 | 0.0087 |
| Q07 | get_opportunity_history, data_dictionary | 6.6 | 6 | 562 | 11,354 | 9,956 | 0.0317 |
| Q08 | data_dictionary, query_data, get_opportunity_history | 9.5 | 8 | 680 | 25,747 | 11,149 | 0.0373 |
| Q09 | get_funnel, query_data, calculate, list_opportunities, query_data, calculate ×2 | 11.8 | 14 | 1,208 | 51,816 | 10,410 | 0.0433 |
| Q10 | get_budgets | 5.5 | 6 | 636 | 11,356 | 1,231 | 0.0106 |
| Q11 | list_opportunities, propose_task | 11.3 | 8 | 926 | 18,987 | 2,872 | 0.0184 |
| Q12 | get_collections, calculate ×2 | 7.5 | 8 | 725 | 17,866 | 1,089 | 0.0118 |
| Q13 | get_overview | 7.9 | 6 | 713 | 11,353 | 1,911 | 0.0131 |
(n/c = not captured; Q01–Q03 lines of run 2 scrolled out of the captured output.) cache_read_input_tokens is above 0 from the first question onward: Q01 read 5,497 cached tokens on its second call in run 1. No verdicts for run 2, because the answers were not saved. Spend recorded: run 1 $0.0591, run 2 Q04–Q13 $0.1969; Q01–Q03 of run 2 not captured (about $0.06 at run 1 rates). About $0.32 in total.
Q09 used all 6 rounds. It finished with end_turn, but it is close to the limit, so I will watch it on the rerun.

## 4. Deviations from SPEC
None beyond the reviewer's U3 and U4, which are now in SPEC §4.4 and §4.7. Phase 3 judgement calls: 8 DECISIONS rows dated 2026-11-27.

## 5. Assumptions I made where SPEC was silent
1. The copilot conversation lives in the browser tab (shared by the panel and /copilot) and is not saved across reloads.
2. Progress is streamed as tool events; the model calls stay non-streaming (Phase 0 assumption 19).
3. Q14 is asked in a fresh conversation after the edit; proposals in the eval are never confirmed by the harness.
4. The panel overlays the page instead of narrowing it, so the page layout is the same with it open.

## 6. Questions for reviewer and owner
Q1 [BLOCKING, owner]: add credit on the Anthropic account used by ANTHROPIC_API_KEY (console, Plans and billing). Finishing Phase 3 needs about: eval 14 questions ≈ $0.35, demo 5 copilot turns ≈ $0.25, one rerun after fixes ≈ $0.60, so about $1.50; $5 leaves room.
   Options: A) add credit, then reply "credits added": I run `npm run check:anthropic`, the full eval, judge it per REPORTING §5, fix tools or prompt if needed and rerun, run the demo rehearsal, then complete this report, commit and tag phase-3 B) use a different key
   My default if no answer: wait.

## 7. Known issues and risks
1. The eval and demo are not done (Q1). The copilot's answer quality is verified only for Q01, Q03 and Q04 of run 1, before the prompt change.
2. The rate limit (30 per hour per IP) and the copilot conversation are in memory: a server restart or a new Vercel instance resets them.
3. Not deployed yet. Vercel will also need ANTHROPIC_API_KEY, ANTHROPIC_MODEL and DATABASE_URL_READONLY.
4. Spend-cap and credit errors are not retryable: the panel shows the error, the question stays on screen, and it is left out of the history sent next time, so asking it again works cleanly.

## 8. Files changed (tree, new files marked +)
```
+ lib/copilot/ chat.ts, tools.ts, proposals.ts, query-data.ts, calculate.ts, system-prompt.ts
+ app/api/chat/route.ts  + app/api/proposals/[id]/{confirm,reject}/route.ts  + app/copilot/page.tsx
+ components/copilot/ copilot-provider.tsx, copilot-chat.tsx, copilot-panel.tsx, proposal-card.tsx
+ lib/server/{audit, rate-limit}.ts  lib/server/db.ts (read only client)  lib/writes/entities.ts (audit context)
app/ layout (provider, toggle, Q26), page (Q8), diagnose (U1), pipeline (U4, U5), settings (U3), tasks (U5, flag), campaigns (U5)
lib/engine/analytics.ts (grouped ranking)  lib/format.ts (labels)  components/{nav-links, create-opportunity-fields}.tsx
+ scripts/{eval-copilot, check-anthropic}.ts  + tests/tools.test.ts  + e2e/{layout, demo}.spec.ts  e2e/{flows, screens}.spec.ts  playwright.config.ts
+ eval/results/2026-11-26T21-54-04.{md,json}  + reports/phase-3-screens/*.png (9)  + reports/phase-3.md
package.json (@anthropic-ai/sdk 1.8.0, mathjs 15.2.0, react-markdown 10.1.0, remark-gfm 4.0.1; scripts eval:copilot, demo:rehearse, check:anthropic)  SPEC.md (§4.4, §4.7)  docs/DECISIONS.md (+8)
```

## 9. How the owner can see it
`npm run dev`, open any page and click Copilot in the header (or open /copilot). Until credit is added, the panel shows the API error. Recent changes is at the bottom of Settings.

## 10. Ready for next phase?
NO. Q1 first; then I finish the eval and demo and tag phase-3.

## Appendix A. `npm run verify` (demo DB; unchanged since the Phase 2 reset)
```
VERIFY  db=ep-gentle-river-bibkvct8-pooler.c-5.ap-southeast-1.aws.neon.tech  simulation_date=2025-04-20  source_rows=2308  app_rows=0  at=2026-11-27T03:35:44.116+05:30
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
