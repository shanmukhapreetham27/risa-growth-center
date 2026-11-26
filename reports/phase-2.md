# PHASE 2 REPORT
STATUS: COMPLETE
COMMIT: 534948c on main   TAG: phase-2 (on the commit that adds this report, directly on top of 534948c)

## 0. REVIEWER NOTE 04: decisions and security (done first)
| Item | Change made | Verified by | Result |
|---|---|---|---|
| D1 (Q1 B) | A confirmed deal moved to any non-confirmed stage (lost, withdrawn or open) voids its unpaid installments; paid ones stay and are flagged. SPEC §2.4 updated | writes.test.ts "D1": unpaid voided, paid kept, cash collected unchanged; re-confirm bills value − paid | PASS |
| D2 (Q2 B) | Fully paid deal whose confirmed value rises gets one `top_up` installment for the difference, due max(balance due, effective + 7 days). `installment` check allows `top_up`. SPEC §2.2, §2.4 updated | writes.test.ts "D2": amount 20,000, due date, confirmed cash and outstanding +20,000; lowering rescales it to 0 | PASS |
| D3 (Q3 B) | `git filter-branch --tree-filter` replaced only the CONTEXT §1 owner line in every commit; tags phase-0 and phase-1 re-pointed; refs/original and reflog removed; `gc --prune=now` | Per commit old vs new: first 5 commits differ only in that 1 line of docs/CONTEXT.md, the last 3 trees are identical. Searching `git log -p --all`, every stored object and every commit message for the previous owner name: 0 matches. New commit 1 vs a fresh zip extraction: `diff -r` shows that one line only | PASS |
| S1 | neondb_owner and risa_readonly passwords rotated on both branches with `ALTER ROLE ... WITH PASSWORD` from a local script (4 new random 40-character passwords, one per role and branch). The Neon MCP reset tool returns the password in its output, so it was not used. .env.local rewritten without output | SELECT 1 on all 5 URLs: OK, OK, OK, OK, OK. Old passwords: rejected (28P01) on main and test, owner and read only | PASS |
| S2 | CLAUDE.md rule 12: never print, cat, grep or search .env.local or any secret; exclude .env* from every search | CLAUDE.md | PASS |

History after the rewrite (`git log --format="%h %s"`; all 10 commits are `Shanmukha Preetham Bukka <ep23b006@smail.iitm.ac.in>` as author and committer):
```
534948c Phase 2 ... | 91d524f REVIEWER NOTE 04 ... | a6d3d60 Phase 1 report (tag phase-1) | 995f9e9 Phase 1 ... | ed6f196 REVIEWER NOTE 03 A3-A4 ...
b5db584 Fix report 01 | 69adc89 SPEC CHANGE: apply REVIEWER NOTE 01 (tag phase-0) | 4acc673 Env template ... | 673a8c8 Phase 0 report | e79d155 Ground truth pack
```
Every commit hash changed in the rewrite, so the hashes in reports/phase-1.md and fix-01.md refer to the old history.

## 1. Done (map to spec): what each page shows
| Spec ref | Page or item | Status | How verified |
|---|---|---|---|
| §4 header | Simulation date picker (writes settings.simulation_date, 15 Jan to 20 Apr), days to festival, Sourced / Simulated / Assumption legend | done | e2e flow 1 switches 20 Apr → 10 Mar → 20 Apr |
| §4.1 | Overview: 6 KPI cards (partnerships and qualified vs goal, confirmed cash + in kind, cash collected vs team goal, open and weighted pipeline, projected cash), funnel with conversions, daily trend charts with step goal lines, campaign table with badges | done | analytics.test.ts (funnel and campaign rows equal the engine at all 10 dates); e2e flows 1, 3, 6; 01-overview.png |
| §4.2 | Diagnose: stage conversion by channel group and by campaign with the bottleneck highlighted, stale deals (26 at 20 Apr, ranked, ties marked), median days in stage warm vs cold, by owner and by industry, what changed D vs D − 7 | done | analytics.test.ts (cold 33 opps / 0 confirmed, six ₹90,000 ties in tie-break order, cold slower in every stage, stale list = snapshot); 02-diagnose.png |
| §4.3, §5 | Campaigns: list with badge and the rule that fired, create, edit (all fields + planned budget), set status, add spend, spend entries | done | e2e flow 4 (SC01 paused on Campaigns and Overview); 03-campaigns.png |
| §4.4 | Pipeline: opportunity table at D with filters, tie-break order and stale flag; drawer with version history, change stage, change values, log interaction, brand qualification history and change; create opportunity with new brand and contact | done | e2e flow 1 (drawer confirms O028 → Overview 25); 04-pipeline.png, 05-pipeline-drawer.png |
| §4.5 | Collections: totals, status filter, installments with paid / due / overdue / upcoming / voided at D, flags, record payment with the date limits | done | analytics.test.ts (overdue and paid totals = snapshot at all dates); e2e flow 2; 06-collections.png |
| §4.6 | Tasks: create, edit, delete (confirm), owner, due date, status, links to campaign, opportunities and brand, overdue vs D, created_by with copilot tasks highlighted | done | e2e flow 5; 07-tasks.png |
| §4.7 | Settings: simulation date, assumptions form, targets form (new version, label default "App plan n") and version list, Reset to original data (confirm dialog), data dictionary (14 views with columns and origin, 87 field guide rows), gaps list §6.4 | done | e2e flows 3 and 6; 08-settings.png |
| Note 04 item 5 | Vercel prep: `outputFileTracingIncludes` for data/ and db/migrations/, `vercel.json` regions sin1 | done | .nft.json of every page: 16 CSVs, 3 migrations; `next build` 0 warnings, all 8 routes dynamic (ƒ) |
| Copilot panel | Right side panel and full page view | not started | Phase 3 |

## 2. Tests
Command: npm test (vitest, TZ=UTC, test branch only). Result: 726/726 passed, 0 failed, 0 skipped (5 files, 76 s): metrics 642, writes 23 (+2 for D1, D2), analytics 48 (new), db 8, guard 5.
Command: npm run test:e2e and npm run screens (Playwright 1.65.1, Chromium, production build, test branch only). Result: 14/14 passed (6 flows + 8 screenshots, 1.7 min):
1 Pipeline confirm O028 → Overview 25 at 2025-04-20, 15 at 2025-03-10 · 2 record PAY032 → cash collected ₹18,42,500 → ₹18,90,000 on Collections and Overview · 3 targets form 30 → Overview goal 30 · 4 SC01 paused shows paused · 5 new task shows Riya Kapoor and 25 Apr 2025 · 6 Reset → 24 confirmed, goal 28, cash ₹18,42,500, SC01 active.
Failures fixed while iterating, with no expected value changed: the screenshot spec needed `.first()` because Settings has two date pickers. Other UI fixes came from screenshot review (fonts, conversion table width, Overview table width).
Screenshots: reports/phase-2-screens/01-overview.png … 08-settings.png (1440 px wide, full page, simulation date 2025-04-20, freshly reset test branch = same rows as the demo DB).

## 3. Verify output
Full output in Appendix A: `SUMMARY  132/132 OK   0 MISMATCH`, `APP WRITES SINCE RESET: 0` (demo DB, after `npm run db:reset` with the new schema and new passwords).

## 4. Deviations from SPEC
None. Phase 2 judgement calls are in docs/DECISIONS.md (8 rows dated 2026-11-27, after the 5 rows for note 04).

## 5. Assumptions I made where SPEC was silent
1. Each number carries its origin through the tag on its card, column header or section; stale counts are Assumption (stale days).
2. Ranking value = confirmed value for confirmed deals, else proposed (lost and withdrawn rank by proposed).
3. Cash per ₹ spent = cash collected on the campaign's deals ÷ spend to D (both simulated).
4. Stage conversion steps contacted → responded → conversations → opportunities → proposals → confirmed; bottleneck = lowest conversion.
5. Median days in stage counts only stage spans that ended by D; consecutive versions in one stage are one span.
6. Collections lists installments of deals first confirmed by D.
7. Overview's campaign table shows badges only (rule on hover); Campaigns shows the rule and reasons.

## 6. Questions for reviewer
Q1 [NON-BLOCKING]: §6.5 step 5 says "audit log has both writes", but §4 has no audit log view.
   Options: A) add a read-only "Recent changes" table (last 50 audit_log rows: time, actor, action, record) to Settings B) leave it to `npm run verify`, which prints the audit tail
   My default if no answer: B (not built, since it is not in §4). I recommend A for the demo.
Q2 [NON-BLOCKING]: Should lost and withdrawn deals be ranked among open and confirmed ones in Pipeline (by proposed value)?
   Options: A) as now, one list by value B) closed deals after open and confirmed
   My default if no answer: A

## 7. Known issues and risks
1. Neon's console "reveal password" and Connect modal may still show the pre-rotation owner password, because the rotation used SQL, which Neon's docs list as a supported route. Use the strings in .env.local. Vercel env vars must use the new strings.
2. Page render is about 0.5 to 1.5 s from India: each request loads all views (about 2,400 rows) from Singapore. On Vercel sin1, next to the DB, it should be lower (not verified until deployed).
3. The native date input shows the browser's locale format (20-04-2025); the value is ISO.
4. The app is not deployed yet (prep only). Deployment needs DATABASE_URL, DATABASE_URL_UNPOOLED and DATABASE_URL_READONLY set in Vercel.
5. `next build` still notes the unrelated package-lock.json in the owner's home folder (benign).

## 8. Files changed (tree, new files marked +)
```
+ app/actions.ts (server actions)   app/layout.tsx (header)   app/page.tsx (Overview)
+ app/diagnose/page.tsx  + app/campaigns/page.tsx  + app/pipeline/page.tsx  + app/collections/page.tsx  + app/tasks/page.tsx  + app/settings/page.tsx
+ components/ action-form, create-opportunity-fields, decision-badge, kpi, nav-links, reset-button, sim-date-picker, tag, trend-chart, url-sheet
+ components/ui/ alert-dialog, badge, card, dialog, input, label, native-select, separator, sheet, table, textarea (shadcn)
+ lib/engine/analytics.ts  lib/engine/{snapshot (campaignIds), breakdowns (open, lost), types (top_up), index}.ts  + lib/dictionary.ts  + lib/format.ts
+ lib/server/{db, data, lookups}.ts   lib/writes/opportunity.ts (D1, D2)   lib/db/reset.ts (tracing hints)   db/migrations/001_schema.sql (top_up)
+ e2e/{global-setup.ts, flows.spec.ts, screens.spec.ts}  + playwright.config.ts  + scripts/{test-server.ts, reset-test.ts}  + tests/analytics.test.ts  tests/writes.test.ts
next.config.ts  + vercel.json  package.json (recharts 3.10.1, @playwright/test 1.65.1, scripts test:e2e, screens, db:reset:test)  .gitignore
CLAUDE.md (rule 12)  SPEC.md (D1, D2)  docs/DECISIONS.md (+13 rows)  + reports/phase-2-screens/*.png (8)  + reports/phase-2.md
```

## 9. How the owner can see it
`npm run dev`, then open http://localhost:3000. That uses the demo DB, and edits there show in `npm run verify`. To try edits safely: `npx tsx scripts/test-server.ts dev 3100` serves the same app on the test branch. Screenshots for the reviewer are in `reports/phase-2-screens/`.

## 10. Ready for next phase?
YES. Phase 3 (copilot) needs ANTHROPIC_API_KEY filled in .env.local by the owner. Q1 decides whether Settings gets an audit log table.

## Appendix A. `npm run verify` (demo DB, after `npm run db:reset`)
```
VERIFY  db=ep-gentle-river-bibkvct8-pooler.c-5.ap-southeast-1.aws.neon.tech  simulation_date=2025-04-20  source_rows=2308  app_rows=0  at=2026-11-27T02:41:27.788+05:30
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
