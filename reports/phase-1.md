# PHASE 1 REPORT
STATUS: COMPLETE
COMMIT: b8922f9 on main   TAG: phase-1 (on the commit that adds this report, directly on top of b8922f9)

## 0. REVIEWER NOTE 03: author fix (done before Phase 1)
| Directive | Change made | Verified by | Result |
|---|---|---|---|
| A1 | Repo-local `user.name` "Shanmukha Preetham Bukka", `user.email` ep23b006@smail.iitm.ac.in (the owner gave this address for the note's YOUR_EMAIL placeholder) | `git config --local user.name / user.email` | PASS |
| A2 | All 5 existing commits rewritten (`git rebase -r --root --exec`, author and committer replaced, original author dates kept). Each rewritten commit has the same tree hash as the old one. Annotated tag `phase-0` recreated on the rewritten SPEC CHANGE commit (290cf79, tagger = owner). Old objects pruned (`reflog expire`, `gc --prune=now`). The Co-Authored-By trailers are removed from every message, and new commits have none | log check below; `git for-each-ref refs/tags` | PASS |
| A3 | The old name appeared only in `docs/CONTEXT.md` §1. It now names Shanmukha Preetham Bukka and refers to "the owner" without pronouns. No other owner name or email anywhere in the tree. Protected files checked: CSVs, xlsx (inside the zip), PDF text, JSON and scripts all contain no name | ripgrep over the repo excluding `.env.local`; Python check of the xlsx and PDF | PASS |
| A4 | One DECISIONS.md row for the author fix, plus one row accepting N1 to N5 as written | `docs/DECISIONS.md` | PASS |

`git log --format="%an <%ae> | %cn <%ce>"` (all 7 commits before this report's commit; the report commit uses the same identity):
```
Shanmukha Preetham Bukka <ep23b006@smail.iitm.ac.in> | Shanmukha Preetham Bukka <ep23b006@smail.iitm.ac.in>
Shanmukha Preetham Bukka <ep23b006@smail.iitm.ac.in> | Shanmukha Preetham Bukka <ep23b006@smail.iitm.ac.in>
Shanmukha Preetham Bukka <ep23b006@smail.iitm.ac.in> | Shanmukha Preetham Bukka <ep23b006@smail.iitm.ac.in>
Shanmukha Preetham Bukka <ep23b006@smail.iitm.ac.in> | Shanmukha Preetham Bukka <ep23b006@smail.iitm.ac.in>
Shanmukha Preetham Bukka <ep23b006@smail.iitm.ac.in> | Shanmukha Preetham Bukka <ep23b006@smail.iitm.ac.in>
Shanmukha Preetham Bukka <ep23b006@smail.iitm.ac.in> | Shanmukha Preetham Bukka <ep23b006@smail.iitm.ac.in>
Shanmukha Preetham Bukka <ep23b006@smail.iitm.ac.in> | Shanmukha Preetham Bukka <ep23b006@smail.iitm.ac.in>
```
`git log --format="%h %s"` and trailers:
```
b8922f9 Phase 1: Next.js scaffold, schema and views, reset loader, metric engine, write semantics, tests, verify
b8370f9 REVIEWER NOTE 03 A3-A4: owner name in CONTEXT, decisions for author fix and N1-N5
bf22bc5 Fix report 01
290cf79 SPEC CHANGE: apply REVIEWER NOTE 01 (D3-D12)
e66d800 Env template for Neon branches and read only role (REVIEWER NOTE 01 D2, D7)
fc247e2 Phase 0 report
d922da2 Ground truth pack
Co-Authored-By lines in all commit messages: 0
```
The old name is still inside the *file contents* of commits d922da2 to bf22bc5, because their CONTEXT.md is the file as delivered. D1 requires commit 1 to match the zip byte for byte, so I did not rewrite contents. See Q3.

## 1. Done (map to spec)
| Spec ref | Item | Status | How verified |
|---|---|---|---|
| §1 | Next.js 16.4.6 App Router + TS, Tailwind 4, shadcn/ui (base-nova), Node 22 pinned (`engines` 22.x, `.nvmrc`) | done | `npm run build` OK, `npm run typecheck` OK, `npm run lint` 0 problems |
| §2.2 | 16 raw tables (12 source + 3 simulated + tasks) with `source` and `ingest_row`; app tables settings, tasks (`opportunity_ids text[]`), chat_proposals, audit_log; `sponsor_campaigns.status`, `payment_installments.voided_at` | done | tests/db.test.ts schema (3) |
| §2.2 | 14 views (3 dedupe, 11 plain incl. `v_event`); no views for read_me / field_guide | done | db.test.ts: exactly 14 views; raw/unique 953/950, 434/433, 230/228 |
| §2.3 | `npm run db:reset`: one transaction on DATABASE_URL_UNPOOLED, drops everything, runs `db/migrations`, loads all 16 CSVs with csv-parse (typed, strict) | done | demo DB reset: 2,308 rows in 4.1 s; verify 132/132 |
| §2.3 | Migration 003: SELECT on the 14 `v_*` views to `risa_readonly` (re-granted on every reset), REVOKE TEMPORARY ON DATABASE from PUBLIC and `risa_readonly` | done | db.test.ts read only role (5): views readable; raw/app tables 42501; temp/create table 42501 even in a READ WRITE transaction; 3 s timeout 57014 |
| §2.4 | Write functions (`lib/writes`): stage/value change with create, void and rescale installment rules; record payment (D5 date limits, 15:00 IST); qualification; interaction; create opportunity with new brand and contact; targets (App plan n); campaign create/edit/status; budget; spend; task CRUD; settings. Stamp rule, APP- ids, audit_log on every write | done (UI calls them in Phase 2) | writes.test.ts (21) |
| §2.4 | Append only history: DB triggers reject UPDATE and DELETE on the 4 versioned tables | done | writes.test.ts "history tables are append only" |
| §3 | Engine `computeSnapshot(data, asOf, opts)`: line by line port of reference_engine.py, in memory from the views, IST end of day, campaign filter, settings-driven assumptions; daily series; voided installments excluded from overdue | done | metrics.test.ts: every reference metric exact |
| §5 | `decide()` / `campaignDecisions()`: badge, rule text, CHANGE reasons | done | 12 decisions exact (20 Apr and 15 Mar) |
| §7 | tests/metrics.test.ts, tests/writes.test.ts (a) to (f), on DATABASE_URL_TEST only, endpoint id guard, TZ=UTC | done | 676/676 |
| §7 | `npm run verify` per REPORTING §4, read only transaction on DATABASE_URL | done | 132/132 OK (Appendix A) |
| §7 | tests/tools.test.ts, `npm run eval:copilot` | not started | Phase 3 (the copilot tools do not exist yet) |

## 2. Tests
Command: npm test   (vitest 5.1.2, TZ=UTC, files run one after another on DATABASE_URL_TEST = test branch endpoint ep-bitter-sea-bis8rxm7)
Result: 676/676 passed, 0 failed, 0 skipped (4 files, 103 s)
- metrics.test.ts 642: snapshots 280 (10 dates x 28 keys), by_campaign_final 150, by_campaign_2025-03-15 150, owners 10, industries 19, edge cases 7, budgets 6, decisions 13, runtime TZ checks 2, traps 5
- writes.test.ts 21: (a) x2, (b), (c), (d), (e), (f), start state, plus paid installments survive a withdrawal, stamp rule +1 s, rescale, re-confirm (N2), payment validation, append only, qualification, interaction, create opportunity with new brand and contact, targets, copilot-actor audit, audit coverage, settings date range
- db.test.ts 8 (schema, typed load, read only role); guard.test.ts 5 (guard unit tests)
- Guard proof: running with DATABASE_URL_TEST set to main's direct string gives "ABORT: DATABASE_URL_TEST and DATABASE_URL point at the same endpoint (ep-gentle-river-bibkvct8)", no tests loaded, exit 1.
Failures: none. Failures fixed while iterating, with no expected value changed: (1) `@next/env` skips .env.local when NODE_ENV=test, so the guard aborted (env loading fixed); (2) my precondition in (c) assumed partnerships ≠ 24 after the writes, but they net back to 24, so it now checks that the snapshot differs from the reference; (3) the read only insert probe returns 42501 before 25006 (both mean blocked; the test accepts either and adds a CREATE probe for 25006); (4) (c) hit the 60 s timeout. Reset was rewritten to one round trip (11 to 21 s down to 4 to 5 s) and the test now has 180 s.

## 3. Verify output
Full output in Appendix A: `SUMMARY  132/132 OK   0 MISMATCH`, `APP WRITES SINCE RESET: 0` (demo DB, right after `npm run db:reset`).

## 4. Deviations from SPEC
| Spec ref | What I did instead | Why | Reversible? |
|---|---|---|---|
| REPORTING §4 | verify adds 7 EDGE CASES lines (Cobalt id, Beardo, raw and dedupe counts for 3 tables) and exits 1 on any MISMATCH | more checks, same layout | yes |
All 13 Phase 1 judgement calls are in docs/DECISIONS.md (2026-11-27 rows).

## 5. Assumptions I made where SPEC was silent
1. Confirming without a confirmed value uses the proposed value. Every other stage carries confirmed value 0, as in all source versions.
2. Installments are created when a cash deal becomes confirmed with no live unpaid installments, for confirmed value − paid (N2); if unpaid ones exist, they are rescaled. A new opportunity starts in an open stage, so this rule lives in one place.
3. Interaction time = max(simulation date at the IST wall clock, brand and contact created_at). Form dates for spend get 18:00 IST, and planned campaign dates get 09:00 / 18:00 IST, as in the source.
4. The simulation date is limited to 15 Jan to 20 Apr 2025. Owners must be in the team dictionary (T01, T02, T03, T05). `audit_log.at` is real time, and the simulated event time is in `after`.
5. CHANGE gets the reason "fewer than 3 closed deals" when closed < 3, so a CHANGE never has an empty reason list.

## 6. Questions for reviewer (all NON-BLOCKING)
Q1 [NON-BLOCKING]: What should happen to installments when a confirmed deal moves back to an open stage (not lost/withdrawn)?
   Options: A) leave them unchanged (SPEC only names lost/withdrawn) B) void unpaid ones like lost/withdrawn
   My default if no answer: A
Q2 [NON-BLOCKING]: What if the confirmed value is raised after every installment is paid?
   Options: A) no new installment; outstanding_confirmed_cash shows the gap B) add a top-up balance installment
   My default if no answer: A
Q3 [NON-BLOCKING]: The old owner name remains in the file contents of the 5 rewritten commits (CONTEXT.md as delivered). Should history be rewritten?
   Options: A) leave it; commit 1 stays identical to the delivered pack (D1) B) rewrite CONTEXT.md §1 in every commit, after which commit 1 no longer matches the zip
   My default if no answer: A. The current tree and all authorship are clean, and nothing has been pushed.

## 7. Known issues and risks
1. During the A3 search, a grep printed parts of the two database passwords from `.env.local` into this local session's tool output. Nothing reached a file or a commit. I recommend rotating the `neondb_owner` and `risa_readonly` passwords on both branches; the owner decides.
2. Neon latency: about 80 to 180 ms per round trip and 1 to 4 s for the first query after idle. `npm test` takes 75 to 185 s and does 4 resets of the test branch.
3. Phase 2: the Settings "Reset to original data" button on Vercel needs `data/` and `db/migrations/` bundled into the function (`outputFileTracingIncludes`), plus DATABASE_URL_UNPOOLED in Vercel env.
4. Stamp rule edge: a write within a second of 23:59:59 IST wall clock time, plus the +1 s floor, can land on D+1 and not show at D. This is inherent to the rule.
5. `next build` warns that it ignored an unrelated `package-lock.json` in the owner's home folder. Benign; nothing was changed there.
6. Python's `round` rounds half to even, while the engine uses `Math.round` (CONTEXT §5.8). Every reference value matches, but a future .5 value could differ by 1 from a pandas recomputation.

## 8. Files changed (tree, new files marked +)
```
.gitignore (keeps .env.example tracked) + .nvmrc + AGENTS.md + package.json, package-lock.json, next.config.ts, tsconfig.json, eslint.config.mjs, components.json, vitest.config.mts
+ app/ (layout.tsx, page.tsx placeholder, globals.css, favicon.ico)   + components/ui/button.tsx (shadcn)
+ db/migrations/ 001_schema.sql, 002_views.sql, 003_readonly_grants.sql   + scripts/ db-reset.ts, verify.ts
+ lib/db/ client.ts, csv.ts, guard.ts, reset.ts, stats.ts      + lib/env.ts, lib/utils.ts
+ lib/engine/ types.ts, time.ts, load.ts, snapshot.ts, decisions.ts, breakdowns.ts, index.ts
+ lib/writes/ common.ts, opportunity.ts, payments.ts, entities.ts, index.ts
+ tests/ global-setup.ts, helpers.ts, metrics.test.ts, writes.test.ts, db.test.ts, guard.test.ts
docs/CONTEXT.md (A3)  docs/DECISIONS.md (+15 rows)  + reports/phase-1.md
```
Protected files unchanged: `git diff --stat` for data/, reference_metrics.json, copilot_eval_questions.json, scripts_reference/ and the brief is empty.

## 9. How the owner can see it
No pages yet (Phase 2). Run `npm install`, then `npm test` (resets and tests the `test` branch only), `npm run verify` (read only check of the demo DB) and `npm run db:reset` (reloads the demo DB).

## 10. Ready for next phase?
YES. Phase 2 (UI) needs nothing new. Phase 3 needs ANTHROPIC_API_KEY filled in `.env.local`. Owner decision pending: password rotation (§7.1).

## Appendix A. `npm run verify` (demo DB, after `npm run db:reset`)
```
VERIFY  db=ep-gentle-river-bibkvct8-pooler.c-5.ap-southeast-1.aws.neon.tech  simulation_date=2025-04-20  source_rows=2308  app_rows=0  at=2026-11-27T01:27:15.179+05:30
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
