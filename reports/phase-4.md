# PHASE 4 REPORT
STATUS: COMPLETE (P6 skipped: no GitHub repo given)
COMMIT: 75c6edd on main   TAG: phase-4 (on the commit that adds this report)
PRODUCTION URL: https://risa-growth-center-one.vercel.app
Order as asked: accuracy fixes, then the eval tables, then deployment. The body is 131 lines; the file is longer only because the appendices hold the four required full answers and the full `npm run verify` output.

## 0. REVIEWER NOTE 06 accuracy fixes
| Item | Change | Verified by | Result |
|---|---|---|---|
| Evidence 1 to 3 | Reproduced on the engine before fixing: O035 Cedar Wellness 89 days (O036 Cedar Threads 79, O056 Evergreen Threads 61); O028, O048, O033, O027 at 33, 47, 30, 41 days (range 30 to 47); SC01 open deals 9, all Riya's, 3 of them in the task | scratch script on the demo DB (read only) | confirmed |
| E1 | list_opportunities, get_collections, list_tasks return every match up to 200 (limit max 200) with total_matching, returned, truncated and a summary over all matches: count, totals, highest / lowest, oldest / newest (id, name, days, tied ids), min/max ranges, counts and values by stage, owner, campaign. New filters: opportunity_ids, days_since_update_over (list_opportunities), opportunity_id (get_collections). Prompt rule 10 | tools.test: summary = engine, oldest O035 89, opportunity_ids [O028,O048,O033,O027] gives range 30 to 47 and SC01 count 3, filters for Q16 to Q18 | PASS |
| E2 | Rule 11 (id with every name). Check: every id must be in a tool result or app note; a name beside an id must be that record; a deal or campaign name without its id in the same sentence or row is reported. Recompute round on any of these | grounding.test: "O036 Evergreen Threads" flagged as `O036 is Cedar Threads`; name without id flagged; unknown id flagged | PASS |
| E3 | Counts (digits and words zero to ten counting items, "N of them / of the M", "all N"; not ranks, list numbers, "one per owner") must come from this turn's tool results or calculate; ranges must be a min/max pair from this turn's tool results or two calculate results | grounding.test: "Two of them (O048 and O033)" flagged without a fresh tool call, "Three of them" passes with one; "30 to 41" flagged against a 30 to 47 summary | PASS |
| E4 | propose_task (title, notes) and propose_campaign_status (reason) pass the same check before the row exists; a failure returns an error to the model and no card | grounding.test; demo step 4: two proposals refused ("All 9", "4 negotiating deals" with no tool call), then re-proposed with "30 to 47 days" and "Three of Riya's negotiating deals (O048, O033, O027) belong to that campaign" | PASS |
| E5 | Rule 12: absence of a record is not evidence | Q07 run of record: "The data has no later qualification change." | PASS |
| E6 | Grounding check kept (Q1 A) with E2 to E4; task reading stays stated and editable (Q2 A) | DECISIONS 2026-11-27 | done |
The final-answer recompute is now one extra model call on top of the 6 tool rounds (it used to count as one of the 6). SPEC §6.1, §6.2, §6.3 updated (SPEC CHANGE); 14 DECISIONS rows added.

## 1. Eval hardening and results (V1 to V3)
- V1: Q15 to Q20 appended to copilot_eval_questions.json (one time exception to CLAUDE.md rule 1, logged; 62 lines added, the 14 existing entries unchanged per git diff). Each has an `auto_check` (kind and parameters); the script computes the expected ids and numbers from the engine at run time and grades by exact match plus the as of date. Q18 requires exactly the 9 ids (no extra opportunity id).
- V2: for every answer the script takes each opportunity, campaign, installment or task id with the numbers next to it (same sentence or table row, up to the next id of the same kind or a clause break) and checks them against the engine's figures for that record; a mismatch fails the answer. Calibrated on the 70 saved Phase 3 answers: 0 false failures.
- V3: two full runs (limit 3). Run of record: eval/results/2026-11-27T04-18-00.md. **20 PASS by hand, 0 PARTIAL, 0 FAIL; auto checks 6 of 6; V2 mismatches 0.** Every hand verdict was checked against the engine. Run cost $0.5094; total input 176, output 17,685, cache read 558,454, cache write 110,523 tokens; cache reads above 0 on every question.
| Q | Type | Verdict | Tools called | Latency s | Input | Output | Cache read | Auto check (V1) | V2 | One line reason |
|---|---|---|---|---|---|---|---|---|---|---|
| Q01 | fact | PASS | get_overview, calculate | 8.7 | 12 | 484 | 25,609 | - | ok | 24 vs 28 (revised plan, 15 Mar), 4 short (85.7% via calculate), as of 20 Apr |
| Q02 | calc | PASS | get_campaign_decisions | 4.7 | 6 | 522 | 14,325 | - | ok | SC05 ₹7,25,000 cash from 9; SC02 ties at ₹7,85,000 with in kind; collected labelled simulated |
| Q03 | diagnosis | PASS | get_overview, get_funnel, list_opportunities, get_campaign_decisions, get_opportunity_history, calculate, calculate | 19.3 | 12 | 2623 | 53,205 | - | ok | Cold 33 opps / 0 confirmed, warm 24 of 25; all 26 open stale and cold (21 to 89 days); evidence vs inference; no loss reasons |
| Q04 | follow_up | PASS | calculate, list_opportunities, list_opportunities | 13.8 | 12 | 1755 | 91,150 | - | ok | O028 ₹1,10,000 first; six ₹90,000 deals tied, rule named; 7 deals ₹6,50,000, 21 to 73 days (tool call this turn) |
| Q05 | snapshot | PASS | get_overview, list_opportunities | 10.4 | 12 | 925 | 34,041 | - | ok | 15, ₹12,60,000 cash, ₹1,35,000 in kind at 10 Mar; launch plan goal 20; O006 counted then, withdrawn 20 Mar; 5 later confirmations with ids |
| Q06 | calc_caveat | PASS | get_overview | 4.7 | 6 | 308 | 14,319 | - | ok | ₹18,42,500 / ₹17,90,000 before festival / ₹1,57,500 overdue in 3; simulated, no bank receipts |
| Q07 | cannot_answer | PASS | get_opportunity_history, data_dictionary | 10.4 | 10 | 990 | 31,397 | - | ok | No reason field; O006 history; 'The data has no later qualification change' (E5); task offered |
| Q08 | cannot_answer | PASS | data_dictionary, get_opportunity_history, query_data | 14.8 | 12 | 1499 | 50,675 | - | ok | No footfall per sponsor; activation is an association only; task offered (a 'Beardo (no id)' notice remains, see §8) |
| Q09 | calc | PASS | query_data, get_funnel, calculate, calculate, calculate | 10.2 | 14 | 852 | 39,938 | - | ok | ₹91,667 (6, cash + in kind) and ₹97,500 (4, cash only) via calculate |
| Q10 | calc_caveat | PASS | get_budgets, calculate, get_opportunity_history | 11.1 | 12 | 1341 | 31,790 | - | ok | Simulated; undefined, not zero, for SC01, SC03, SC06; ₹55,100 for SC01 + SC03 via calculate |
| Q11 | action | PASS | list_opportunities, propose_task | 10.7 | 8 | 1052 | 24,336 | - | ok | P-1: Riya, 25 Apr, O028, O053, O038; tie and rule named; Riya's own deals offered; 0 writes |
| Q12 | calc_caveat | PASS | get_collections, calculate | 10.5 | 12 | 953 | 33,069 | - | ok | PAY033, PAY034 (₹55,000, 29 Mar, 22 days), PAY032 (₹47,500, 26 Mar, 25 days); 69.8% via calculate; simulated |
| Q13 | cannot_answer | PASS | get_overview | 6.4 | 6 | 555 | 14,323 | - | ok | No forecast; baseline, weighted pipeline as assumption, cash goal a target |
| Q14 | changed_data | PASS | get_overview | 4.6 | 6 | 261 | 14,320 | - | ok | 25 after the app edit, names O028 Cedar Pantry |
| Q15 | fact | PASS | list_opportunities, get_overview | 5.5 | 6 | 377 | 14,323 | PASS | ok | engine: O035 Cedar Wellness, 89 days |
| Q16 | calc | PASS | list_opportunities, list_opportunities | 6 | 6 | 392 | 14,330 | PASS | ok | engine: 9 of 9 |
| Q17 | calc | PASS | list_opportunities, get_overview | 4.7 | 6 | 411 | 14,331 | PASS | ok | engine: ₹420000 across 8 deals |
| Q18 | fact | PASS | list_opportunities, get_overview | 8.4 | 6 | 1194 | 14,326 | PASS | ok | engine: O030, O035, O036, O037, O045, O046, O053, O055, O056 |
| Q19 | snapshot | PASS | get_overview, list_opportunities | 5.9 | 6 | 597 | 14,329 | PASS | ok | engine: 17 |
| Q20 | changed_data | PASS | list_opportunities, get_overview | 6.1 | 6 | 594 | 14,318 | PASS | ok | engine: 16 (stale days 45) |

Auto checks (V1), run of record:
| Q | Question | Engine value at run time (reviewer's value) | Answer | Result |
|---|---|---|---|---|
| Q15 | Which open deal has gone the longest without an update? | O035 Cedar Wellness, 89 days (O035 Cedar Wellness, 89 days) | O035 Cedar Wellness, 89 days, 20 Apr 2025 | PASS |
| Q16 | How many of Brand Discovery Email's open deals does Riya own? | 9 of 9 (9 of 9) | all 9 of SC01's 9 open deals are Riya's | PASS |
| Q17 | What is the total proposed value of open deals in Past Conversation Revival? | ₹420000 across 8 deals (₹4,20,000 across 8) | ₹4,20,000, 8 open deals, all Nisha Rao | PASS |
| Q18 | Which open deals were last updated more than 60 days ago? | O030, O035, O036, O037, O045, O046, O053, O055, O056 (the nine ids) | table of exactly those 9 ids, 61 to 89 days | PASS |
| Q19 | As of 15 March 2025, how many open opportunities were stale? | 17 (17) | 17 of the 30 open, as of 15 Mar 2025 | PASS |
| Q20 | How many open deals are stale now? | 16 (stale days 45) (16, states 45 days) | 16 of 25, 'more than 45 days ... the stale-days setting' | PASS |

Run history in Phase 4: run 1 (2026-11-27T04-06-28, $0.4549): auto checks 6 of 6; V2 flagged Q15 ("O035 ... if you want one": a pronoun read as 1) and Q18 ("SC01 ... have 3 deals each": a correct subset count). Both were checker errors, fixed in the checker (number words only when they count items; V2 also accepts figures the engine returned for that id through the question's tools); replaying run 1 with the fixed checker gives 0 problems. Hand grading run 1: 19 PASS, 1 PARTIAL (Q05: "O006 Cobalt Learning was confirmed on 10 March"; it was confirmed 25 Feb and still confirmed on 10 Mar). Run 2 is the run of record. Full answers for Q03, Q04, Q07, Q11: Appendix A (no FAIL or PARTIAL in the run of record).

Demo rehearsal (V3): `npm run demo:rehearse` on the reset test branch, live model: 1 passed (1.8 min), 5 copilot turns, $0.1920. reports/phase-4-demo/transcript.md and 11 screenshots. Steps 1 to 7 as SPEC §6.5; step 4 shows E4 at work (above); step 6 answered from the step 2 history with a correct stage list, and ended with the notice "Cobalt Learning (no id)" for "The brand (Cobalt Learning)" (§8 item 1).

## 2. Phase 4
| Item | Change | Verified by | Result |
|---|---|---|---|
| P1 | Global cap 300 /api/chat requests per IST day: migration 004 copilot_usage (day, requests); one INSERT ... ON CONFLICT DO UPDATE ... WHERE requests < 300 RETURNING per request, after the 30 per hour per IP check; 429 with a friendly message and Retry-After to midnight IST; 503 if the check itself fails. Reset keeps the table so it cannot lift the cap | tests/daily-cap.test.ts: 5 concurrent requests against a cap of 3 give 3 ok; next IST day starts again; survives resetDatabase | PASS |
| P2 | Vercel project risa-growth-center (owner's personal scope), Hobby, region sin1 (vercel.json). The owner signed in via the Vercel device page in the browser pane. 7 env vars added to Production from .env.local, values passed on stdin and never printed: DATABASE_URL, DATABASE_URL_UNPOOLED, DATABASE_URL_READONLY, DATABASE_URL_TEST, DATABASE_URL_READONLY_TEST, ANTHROPIC_API_KEY (sensitive), ANTHROPIC_MODEL. `.vercelignore` excludes .env*, test output, eval, reports. Migration 004 applied to main with npm run db:reset (main had 0 app rows) | `vercel env ls production` lists the 7 names; deploy log: build OK in 56 s; GET / /pipeline /settings 200; header x-vercel-id bom1::sin1::... | PASS |
| P3 | Production smoke (e2e/smoke.spec.ts, playwright.smoke.config.ts, SMOKE_URL) then reset | verify on main before: 132/132; smoke 2 passed (31 s): Overview 24; O028 to partner_confirmed persists after reload and Overview shows 25; copilot answers Q01 "As of 20 Apr 2025 ... 25 ... goal 28" (it counted the smoke edit); "Create a task for Kabir Shah ..." gave a card, Tasks showed 0 copilot tasks before Confirm and 1 after (APP-TSK-1). Verify then showed 7 mismatches and the 4 smoke writes in the audit tail; `npm run db:reset` on main; verify after: 132/132, APP WRITES 0; live Overview 24, no APP- task. Record: reports/phase-4-smoke.md | PASS |
| P4 | README.md per SPEC §8 (15 sections): live link, demo script, brief mapping, architecture, data sources, metric definitions, decision rules, copilot design and guardrails, setup and env vars, tests and eval (pass counts, auto check table, what changed between runs), tools and plans with links, reused / modified / verified, known limitations (shared state and Reset, nondeterministic answers, simulated payments and spend), decision log, and docs/STRATEGY_NOTES.md verbatim (owner's file, copied byte for byte, checked with cmp) | read through; no placeholders left | done |
| P5 | Audit of the live app against Part 2 of the brief | §2a | done |
| P6 | No GitHub repo URL given; nothing pushed | owner's answer "No repo, skip P6" | skipped |

### 2a. P5 audit of the live app (Part 2 of the brief)
| Brief bullet | Where it is | Missing or weak |
|---|---|---|
| Measure: funnel, campaign KPIs, targets vs actuals, conversion, budgets, projected outcomes | Overview (KPI cards, funnel with conversion, trend vs goal, campaign table with budget, spend, cash per ₹) | Weak: projected cash before the festival equals cash collected once the festival has started, so at the default date (20 Apr) there is no forward projection unless the simulation date is moved before 12 Apr; no projection of partnerships against the goal. Budgets and spend are simulated (labelled) |
| Diagnose: well and under performing, bottlenecks, what drives changes | Diagnose (conversion by group and campaign with the bottleneck, stale deals, median days in stage, owner and industry, week over week change); badges | Weak: "what is driving changes" is metric deltas only (D vs D-7); no attribution of a change to campaigns or deals on the page (the copilot's changed_after_as_of covers part of it) |
| Support decisions: prioritise, allocate resources, scale / change / stop | Badges with the rule that fired (Overview, Campaigns); copilot recommendations | Weak: no resource allocation view (budget or people by campaign or bet); the deck's five bets are not modelled as initiatives in the app |
| Manage execution: campaigns, tasks, owners, deadlines, action items; edits update analytics | Campaigns, Pipeline, Collections, Tasks; edits audited and reflected at once (e2e flows, smoke) | Opportunity owner cannot be changed in the UI (SPEC: stage and values); no notifications (out of scope) |
| Copilot: understand data, analyse, recommend, connect to execution with confirmation, handle uncertainty | 14 tools on the live DB; evidence vs inference; propose and Confirm; gaps and notices | Weak: actions are limited to tasks and campaign status (no proposed stage, budget or payment changes); answers take 5 to 20 s and wording varies between runs |
| Follow ups and "data cannot answer" | Q04, demo steps 3 and 6; Q07, Q08, Q13 | none found |
| Persistent changes, reliable updates, original data for testing | Postgres, append-only versions, audit log, Recent changes, Reset to original data | Shared state: no login, so all visitors share one dataset and one simulation date |
| Submission: working product link, README | https://risa-growth-center-one.vercel.app; README.md | The three-slide PDF is outside this repo (owner's deck) |

## 3. Tests
- `npm test` (vitest, test branch only): 798 passed (798), 8 files (173 s): metrics 642, writes 23, analytics 48, tools 56, grounding 12, db 8, guard 5, daily cap 4.
- `npm run test:e2e` (Playwright, production build, test branch): 28 passed (1.5 min). Demo rehearsal 1 passed. Production smoke 2 passed.
- lint 0 problems; tsc clean; local `next build` (inside test:e2e and the demo) and the Vercel build clean.

## 4. Verify output
Appendix B (demo DB = production, after the smoke reset): `SUMMARY  132/132 OK   0 MISMATCH`, `APP WRITES SINCE RESET: 0`.

## 5. Deviations from SPEC
| Spec ref | What I did instead | Why | Reversible? |
|---|---|---|---|
| §2.3 "drops all tables" | Reset keeps copilot_usage | A reset must not lift the daily cap; it holds no app data | yes (one line in lib/db/reset.ts) |
| Note 06 P2 "every env var from .env.local" | 7 app variables pushed; VERCEL_OIDC_TOKEN, which `vercel link` itself wrote to .env.local, was not | It is a Vercel-managed short-lived token, not app config | n/a |

## 6. Assumptions I made where SPEC was silent
1. "This turn" (for counts and ranges) = after the last message the user or the app wrote; tool results from earlier turns do not support a count or range.
2. The names-without-ids check covers opportunity (brand) and campaign names; a brand id (A001) next to the brand name satisfies it.
3. Production env vars are set for the Production environment only; preview deployments are not used.
4. P3 "reset production data" used `npm run db:reset` on main, the same reset as the Settings button.
5. The daily cap counts requests that pass the per IP limit; it is counted per IST calendar day of the server clock, not the simulation date.

## 7. Questions for reviewer (all NON-BLOCKING)
Q1: The names-without-ids check is per sentence, so "the brand (Cobalt Learning)" after "O006 Cobalt Learning" earlier in the answer leaves a visible notice. Options: A) keep it per sentence B) accept a name whose id appears anywhere in the same answer. Default: A.
Q2: The test branch URLs are in Vercel Production because the note said every env var; production never reads them. Options: A) keep B) remove DATABASE_URL_TEST and DATABASE_URL_READONLY_TEST from Vercel. Default: A.

## 8. Known issues and risks
1. Strict id check notices on correct answers (demo step 6, eval Q08); wording explains it, but it is visible.
2. Answers vary between runs; two Phase 4 runs gave 19 + 1 PARTIAL and 20 PASS.
3. Shared demo data: graders' edits affect each other until someone presses Reset; the 300 per day cap is shared and Reset does not clear it.
4. The per-deployment URL (risa-growth-center-2ozi3muet-...vercel.app) asks for a Vercel login (302); share the alias https://risa-growth-center-one.vercel.app.
5. Vercel build warns that eslint 9.39.5 is deprecated (no effect on the build).
6. API spend in Phase 4: eval $0.45 + $0.51, demo $0.19, smoke 2 requests: about $1.20.

## 9. Files changed since phase-3 (tree, new files marked +)
```
lib/copilot/{tools, grounding, chat, system-prompt}.ts  + lib/copilot/ids.ts  + lib/copilot/eval-checks.ts  + lib/server/daily-cap.ts
app/api/chat/route.ts (daily cap)  lib/db/reset.ts (keeps copilot_usage)  + db/migrations/004_copilot_usage.sql
scripts/{eval-copilot, grounding-replay}.ts  tests/{tools, grounding}.test.ts  + tests/daily-cap.test.ts
e2e/demo.spec.ts (output reports/phase-4-demo)  + e2e/smoke.spec.ts  + playwright.smoke.config.ts  + .vercelignore
copilot_eval_questions.json (+Q15 to Q20)  SPEC.md  docs/DECISIONS.md (+14)  + docs/STRATEGY_NOTES.md  + README.md
+ eval/results/2026-11-27T04-06-28, 04-18-00 (.md, .json)  + reports/phase-4-demo/ (transcript, 11 png)  + reports/phase-4-smoke.md  + reports/phase-4.md
```

## 9b. How the owner can see it
Open https://risa-growth-center-one.vercel.app. Copilot button in the header (or /copilot). Demo script: README §3. Settings > Reset to original data restores the data.

## 10. Ready for next phase?
This was the last planned phase. Ready to submit: YES, after the owner reads README.md and the §2a list.

## Appendix A. Full answers from the run of record (Q03, Q04, Q07, Q11)
**Q03** (diagnosis, PASS): Why are we behind on partnerships?
```text
We have 24 confirmed partnerships against a goal of 28 in the Sponsor revised plan, as of 20 Apr 2025 (sourced). That is 4 short. All 24 came from warm channels. Cold channels have 0 confirmed as of this date.

**Evidence**

| | Warm (SC02, SC04, SC05) | Cold (SC01, SC03, SC06) |
|---|---|---|
| Brands contacted | 44 | 141 |
| Responded | 44 | 70 |
| Conversations | 36 | 24 |
| Opportunities | 25 | 33 |
| Proposals | 25 | 21 |
| Confirmed | 24 | 0 |

- **Cold channels hold all the open pipeline.** All 26 open opportunities are cold, worth ₹14,40,000 proposed (₹6,27,000 weighted, an assumption).
- **Every open deal is stale.** With the stale setting at 7 days (an assumption), all 26 have gone 21 to 89 days without an update. Eight are in negotiating, worth ₹7,20,000.
- **The stale deals are spread across all three cold campaigns and all three owners.**
  - SC03 Brand Leader LinkedIn has 9, SC01 Brand Discovery Email has 9, and SC06 Past Conversation Revival has 8.
  - Riya Kapoor has 10, Nisha Rao has 8, and Meera Iyer has 8.
- **Cold campaigns have low meeting rates (conversations divided by contacted brands).**
  - SC01 Brand Discovery Email is at 7.7%, SC03 Brand Leader LinkedIn at 27% and SC06 Past Conversation Revival at 35%.
  - Warm campaigns run from 76.5% (SC04 Partner Interest Form) to 100% (SC02 Warm Partner Introductions).
- **Decision badges:** SC01 is STOP, SC03 and SC06 are CHANGE, and SC02, SC04 and SC05 Creator Network Referrals are SCALE.
- **The qualified-brands goal is met.** We have 60 against a goal of 55. The shortfall is in closing deals, not in finding brands.
- **Warm channels close almost everything.** 24 of 25 warm proposals were confirmed.
- **Cold deals are not converting.** The cold-channel bottleneck is proposals to confirmed. 21 cold proposals produced 0 confirmed as of 20 Apr 2025.
- **One cold deal did close, briefly.** O006 Cobalt Learning festival partnership (SC03) was confirmed on 25 Feb 2025 and withdrawn on 20 Mar 2025.

**Likely explanation (inference)**
- Cold deals stalled because nobody followed up on them. The warm channels were limited by how many warm leads existed, not by how well they converted.
- The festival ended on 13 Apr 2025, so the stale deals are probably past the point of closing for this edition.

**What the data can't show**
- It has no loss or withdrawal reasons, so I can't say why cold brands didn't convert, including why O006 Cobalt Learning was withdrawn.
- It has no record of follow-up attempts beyond the last update date.

I can propose follow-up tasks for the 8 stale negotiating deals, or a status change for SC01 Brand Discovery Email. Tell me which you'd like.
```
**Q04** (follow_up, PASS): Of those stuck deals, which are worth the most?
```text
As of 20 Apr 2025, the most valuable stuck deal is O028 Cedar Pantry at ₹1,10,000 proposed (sourced). It is in negotiating, in SC03 Brand Leader LinkedIn, owned by Riya Kapoor. It was last updated 33 days ago. "Stuck" means no update in more than 7 days, which is the stale setting (an assumption). All 26 open deals meet that.

Six deals tie at ₹90,000 for second place. All six are in negotiating. I've listed them in tie-break order (value descending, then oldest last update first, then id).

| Rank | Deal | Campaign | Owner | Days since update |
|---|---|---|---|---|
| 1 | O028 Cedar Pantry (₹1,10,000) | SC03 Brand Leader LinkedIn | Riya Kapoor | 33 |
| 2 (tie) | O053 Evergreen Living | SC06 Past Conversation Revival | Nisha Rao | 73 |
| 2 (tie) | O038 Daybreak Pantry | SC06 Past Conversation Revival | Nisha Rao | 56 |
| 2 (tie) | O048 Evergreen Pantry | SC01 Brand Discovery Email | Riya Kapoor | 47 |
| 2 (tie) | O058 Fable Pantry | SC03 Brand Leader LinkedIn | Meera Iyer | 38 |
| 2 (tie) | O033 Cedar Living | SC01 Brand Discovery Email | Riya Kapoor | 30 |
| 2 (tie) | O043 Daybreak Living | SC03 Brand Leader LinkedIn | Meera Iyer | 21 |

Together these 7 deals come to ₹6,50,000 proposed. They are all cold and all cash. Their days since update range from 21 to 73. By owner, Riya Kapoor has 3, Nisha Rao has 2 and Meera Iyer has 2.

The next most valuable stuck deal is O027 Bramble Works at ₹70,000, also in negotiating.

If you want a follow-up task, tell me which deals to cover. I'd default to these 7, assigned to their current owners.
```
**Q07** (cannot_answer, PASS): Why did Cobalt Learning withdraw?
```text
The data doesn't say why O006 Cobalt Learning festival partnership was withdrawn. Stage history records only the stage, and no field holds a loss or withdrawal reason. This is as of 20 Apr 2025.

**What the data shows (sourced)**
- O006 Cobalt Learning festival partnership is a cash deal from SC03 Brand Leader LinkedIn. Riya Kapoor owned it throughout.
- It moved from prospecting (15 Feb 2025) to contacted (17 Feb), proposal_sent (20 Feb) and negotiating (23 Feb).
- It was confirmed on 25 Feb 2025 at ₹80,000.
- It was withdrawn on 20 Mar 2025. The confirmed value went to ₹0, and the proposed value stayed at ₹80,000.
- The brand's qualification history shows it as qualified since 10 Feb 2025, with the reason "Audience and partnership fit confirmed through the conversation." The data has no later qualification change.
- The deal has no installments, so no payments are recorded against it.

**Not in the data:** the reason for the withdrawal, and any note, interaction or message about it. I won't guess at a cause.

I can propose a task for Riya Kapoor to ask the brand why O006 Cobalt Learning festival partnership was withdrawn and record the answer. Do you want me to?
```
**Q11** (action, PASS): Create a task for Riya to follow up the three most valuable negotiating deals by 25 April.
```text
I've proposed the task for your confirmation. It isn't created until you click Confirm. The proposal assigns Riya Kapoor to follow up the three deals by 25 Apr 2025.

The data is as of 20 Apr 2025. The deals are ranked by proposed value (sourced), and the proposal covers:
- **O028 Cedar Pantry:** ₹1,10,000. It is clearly the top deal.
- **O053 Evergreen Living:** ₹90,000.
- **O038 Daybreak Pantry:** ₹90,000.

**Tie:** Six negotiating deals are tied at ₹90,000: O053 Evergreen Living, O038 Daybreak Pantry, O048 Evergreen Pantry, O058 Fable Pantry, O033 Cedar Living and O043 Daybreak Living. I used the tie break rule (value descending, then oldest last update first, then id). That gave O053 Evergreen Living and O038 Daybreak Pantry the last two places.

**Owners:** Nisha Rao currently owns O053 Evergreen Living and O038 Daybreak Pantry, so Riya would be following up deals that aren't hers.

**Alternative:** I could limit it to Riya's own negotiating deals instead. Those are O028 Cedar Pantry, O048 Evergreen Pantry and O033 Cedar Living. Use Edit or Cancel on the card, or tell me and I'll propose that version.
```

## Appendix B. `npm run verify` (demo DB = production, after the reset)
```
VERIFY  db=ep-gentle-river-bibkvct8-pooler.c-5.ap-southeast-1.aws.neon.tech  simulation_date=2025-04-20  source_rows=2308  app_rows=0  at=2026-11-27T11:11:18.680+05:30
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
