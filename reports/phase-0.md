# PHASE 0 REPORT
STATUS: BLOCKED. Reading and planning are complete. `.env.local` does not exist and the Neon account has no project for this app, so SELECT 1 could not run (Q1).
COMMIT: none. The folder is not a git repo yet (Q2).   TAG: none

## 1. Done (map to spec)
| Spec ref | Restated in one line | Approach I will take | Status |
|---|---|---|---|
| P0 | Read the docs before building | Read in full: CLAUDE.md, CONTEXT, SPEC, REPORTING, brief (4 pp). Also checked reference_metrics.json, copilot_eval_questions.json, reference_engine.py and every CSV against SPEC | done |
| §0 | Brief items 1 to 5 map to 7 pages and a copilot; no auth or extras | Build only what is listed; anything else goes to §6 as a question | planned |
| §1 | Next.js App Router + TS, Tailwind, shadcn/ui, Recharts, Neon, Anthropic SDK, Vitest, Vercel Hobby | postgres.js everywhere (app, scripts, tests), raw SQL migrations, no Drizzle, Node runtime, Vercel region sin1 next to Neon ap-southeast-1 | planned |
| §2.1 | Source CSVs raw, simulated CSVs, ground-truth files never edited | Loader reads them only; nothing in data/ or the reference files gets written | planned |
| §2.2 | Raw tables mirror CSVs (+source, ingest_row); `v_*` views are the only read surface; 4 app tables | Dedupe views use `DISTINCT ON (id) ORDER BY id, ingest_row` (duplicates checked: 3/1/2 IDs, identical payloads, matches 953/950, 434/433, 230/228) | planned |
| §2.3 | `npm run db:reset` and the Settings button run the same reset | One TS function; drop, migrate and load inside one transaction on the UNPOOLED URL, so a failed reset keeps the old data | planned |
| §2.4 | History is append only (APP- ids), uses the stamp rule, and every write is audited | One write module: stamp, insert and audit_log in one transaction; per-prefix sequences for APP- ids | planned |
| §3 | Exact metric definitions; as of D = end of day D IST | Pure TS `computeSnapshot(data, asOf, opts)`, a line-by-line port of reference_engine.py; cutoff = `< start of D+1 IST` | planned |
| §4 | Global header: simulation date, days to festival, Sourced/Simulated/Assumption legend | Date stored in `settings`; every figure carries a provenance tag computed with the metric | planned |
| §4.1 | Overview: KPI cards, funnel, trend with step goal, campaign table + badge | Daily series = snapshot per day, cached per request | planned |
| §4.2 | Diagnose: stage conversion by campaign/group, stale list, median days in stage, owner/industry, D vs D-7 | Same engine; definitions open in Q10 to Q13 | planned |
| §4.3-4.6 | Campaigns, Pipeline, Collections, Tasks: edits flow into analytics | Server actions → write module → `revalidatePath`; no client caching of metrics | planned |
| §4.7 | Settings: date, assumptions, reset, dictionary, gaps list | Gaps list is one constant shared with `data_dictionary()` | planned |
| §5 | WATCH/SCALE/STOP/CHANGE from explicit rules | Port `decide()`; show the rule that fired plus the CHANGE reasons | planned |
| §6.1 | `/api/chat` Messages API tool loop, max 6 rounds, retries, caching, 30 req/h/IP | Manual loop (not Tool Runner); append-only history returned to the client; usage logged | planned |
| §6.2 | 14 tools; reads take `as_of`; propose tools only insert pending proposals | Read tools call the same engine; `query_data` through a read-only role; `calculate` = mathjs | planned |
| §6.3 | 9 system-prompt rules | `lib/copilot/system-prompt.ts`, static text so the cache prefix stays stable | planned |
| §6.4 | 8 data gaps the copilot must name | Shared constant (Settings + tool) | planned |
| §6.5 | One complete demo workflow (7 steps) | Rehearse it on the test branch, then add it to the README | planned |
| §7 | metrics/writes/tools tests, `verify`, `eval:copilot` | Tests run only on DATABASE_URL_TEST, behind an endpoint-identity guard (risk 3) | planned |
| §8 | README sections incl. STRATEGY_NOTES verbatim | Phase 4; STRATEGY_NOTES.md is not in the pack yet | planned |

## 2. Tests
Command: none. No code exists yet, as instructed.
Phase 0 environment checks (values never printed):
| Check | Result | How verified |
|---|---|---|
| `.env.local` | MISSING: not in the pack and not in the project folder | `ls -la` of project root |
| DATABASE_URL / DATABASE_URL_UNPOOLED / DATABASE_URL_TEST / ANTHROPIC_API_KEY | all MISSING (file absent; also unset in the shell env) | file check + shell env presence check |
| SELECT 1, demo DB | NOT RUN: no URL, and the Neon account has 1 unrelated project and none for this app | Neon MCP `list_projects` |
| SELECT 1, test DB | NOT RUN: no `test` branch exists for this app | same |
| Local tools | node 22.20.0, npm 10.9.3, git 2.50, vercel CLI 59.13.1; psql and neonctl absent; machine TZ = IST | `--version` |

## 3. Verify output
Not applicable. `scripts/verify.ts` is built in Phase 1.

## 4. Deviations from SPEC
None. DECISIONS.md is unchanged: the defaults in §5 and §6 are proposals and will be logged when adopted.

## 5. Assumptions I made where SPEC was silent
1. Cutoff is implemented as `t < start of (D+1) IST`. This equals `≤ 23:59:59.999999` and avoids JS millisecond precision.
2. Stale means strictly older than stale_days×24h (the reference uses `>`). The metric name stays `..._7d` and the UI label uses the live stale_days.
3. The projected-cash branch compares EOD(D) with festival start, so 12 Apr already uses the post-festival branch (reference behaviour).
4. "Open cash opportunities" in projection = `support_type='cash'` (reference: weighted 5,32,500 total vs 4,99,500 cash on 10 Mar).
5. A zero denominator gives 0 inside the decision rules (reference `decide()`), shown as "n/a" in the UI. Cost per partnership with 0 confirmed is "undefined" (Q10 eval).
6. Campaign rows count distinct entities, so they do not sum to totals: 12 brands were touched by more than one campaign (prospects 192 vs 180, qualified 65 vs 60). The UI says so.
7. Channel group = distinct entities across the group's campaigns, not a sum of rows. Mapping email/linkedin = cold and introduction/web_inbound = warm reproduces SPEC's ID lists and classifies new campaigns.
8. `confirmed_value_inr` in by_owner/by_industry is cash + in kind (sums to 22,40,000) and is labelled so.
9. support_type, originating campaign and brand industry are read-only, since they are unversioned and editing them would rewrite past snapshots.
10. Every app-created opportunity gets an initial `opportunity_history` row, because the engine sees opportunities only through history.
11. Campaign status is current state, not time-versioned, and changes no metric or badge. `propose_campaign_status.reason` is stored in the proposal payload and the audit_log.
12. Spend as of D = `spent_at ≤ D`. Planned budget is unversioned. New campaigns get `APP-SC-<n>` and start as WATCH.
13. Tasks are not snapshot-filtered: all are shown, flagged when created after the simulation date. Overdue = `due_date < simulation date` and status open/in_progress.
14. App-created rows have created_at from the stamp rule and `ingest_row` NULL. App rows live in the same raw tables with `source='app'`.
15. Team dictionary = T01 Riya Kapoor, T02 Kabir Shah, T03 Meera Iyer, T05 Nisha Rao (all four appear in the data; T04 does not exist).
16. "Confirmed partnership" is never called "signed": there is no contract field (§6.4).
17. `get_opportunity_history(name)` matches the opportunity or brand name. Multiple matches (Beardo: O001, O002) come back as a list.
18. The copilot uses INR with Indian grouping everywhere. The eval file mixes styles (₹1,842,500 and ₹7,25,000), and I read that as formatting only.
19. Copilot call: non-streaming, `max_tokens` 16000, adaptive thinking left on (it cannot be disabled on this model), effort `medium` (Q18).

## 6. Questions for reviewer (blocking first)
Q1 [BLOCKING] No credentials or databases exist for this app. Options: A) I create a Neon project (ap-southeast-1), a `test` branch and a read-only role through Neon MCP and write the URLs into .env.local, and the owner adds ANTHROPIC_API_KEY; B) the owner creates everything and fills .env.local. Default: wait.
Q2 [BLOCKING] The pack sits in a temporary session folder that is not a git repo, and CLAUDE.md rule 11 needs commit + tag. Options: A) move it to a permanent folder, `git init`, commit and tag phase-0 there, and add the GitHub remote in Phase 1; B) stay here. Default: A.
Q3 [BLOCKING for schema] `tasks.opportunity_id` is a single column, but `propose_task` takes `opportunity_ids` (Q11 links 3 deals). Options: A) an `opportunity_ids text[]` column; B) one task per deal; C) a link table. Default: A (SPEC CHANGE).
Q4 [BLOCKING for schema] Confirming a deal in the app creates no installments, so Collections has nothing to record and outstanding cash grows. Withdrawing leaves its installments. Options: A) on a cash confirm, create advance/balance rows with §2.1 terms (`source='app'`), and void unpaid ones on lost/withdrawn; B) no installments. Default: A.
Q5 [NON-BLOCKING] Record payment: A) full amount, `paid_at` from the stamp rule; B) user-chosen date ≤ simulation date, partial allowed. With A at the default 20 Apr, no edit can move "cash collected before festival", the brief's goal metric. Default: A. Rows stay `simulated`, with the audit_log showing who recorded them.
Q6 [NON-BLOCKING] §2.3 says tests must pass "against the live DB" after reset, but CLAUDE.md rule 3 restricts reset tests to the test branch. Default: on the demo DB run `npm run verify` only (read-only); run the full `npm test` on the test branch.
Q7 [NON-BLOCKING] §2.4 defines writes for targets, qualification and new brand/contact, but no page in §4 exposes them, and graders "change constraints". Options: A) small forms: targets in Settings, qualification in a drawer, brand+contact inside create-opportunity; B) none. Default: A.
Q8 [NON-BLOCKING] Overview "cash collected vs team cash goal": total (18,42,500) or before festival (17,90,000, the brief's goal)? The goal 24,46,000 is the next-edition base case (growth_model.json) set against 2025 replay data. Default: before-festival vs goal, total shown second, label "team assumption: next-edition base case".
Q9 [NON-BLOCKING] DATABASE_URL_READONLY points at the demo DB, so tools.test cannot exercise `query_data` on the test branch. Also: is DATABASE_URL_TEST pooled or direct? Default: add DATABASE_URL_READONLY_TEST; DATABASE_URL_TEST = direct string of the `test` branch.
Q10 [NON-BLOCKING] Owner for brand-level funnel stages is undefined (Clarification 5 covers opportunities only; Kabir Shah owns 126 brands and 0 opportunities). Default: owner breakdowns use opportunity metrics only, matching by_owner_final.
Q11 [NON-BLOCKING] Median days in stage has no definition or reference value. Default: completed spells only (first version in a stage → next version with a different stage, ≤ D); current open spells shown separately.
Q12 [NON-BLOCKING] The funnel mixes brands, opportunities (Beardo has 2) and INR. Is the "bottleneck" the lowest % or the largest absolute drop? Default: lowest %; the confirmed→cash step = collected ÷ confirmed cash.
Q13 [NON-BLOCKING] CHANGE reason "stale share ≥ 40%": the denominator is not given. Default: stale_open ÷ open ("n/a" when open = 0).
Q14 [NON-BLOCKING] "Cash per ₹ spent": collected (Clarification 6) or confirmed cash? Default: collected ÷ spend to D, labelled simulated.
Q15 [NON-BLOCKING] Confirms happen outside the message history, so the model does not learn the outcome. Default: the client appends (never edits) a text block to the next user turn, e.g. "Proposal P3 confirmed: TSK007". Alternative: a new `get_proposal` tool.
Q16 [NON-BLOCKING] §6.1 says return "final text + tool calls", but Clarification 9 needs the full blocks (thinking, tool_use, tool_result). Default: return the appended blocks, final text, tool-call summary and usage.
Q17 [NON-BLOCKING] Sonnet 5.5 can return `stop_reason: "refusal"` (HTTP 200), which SPEC does not cover. Options: A) show a clear message; B) also use the server-side fallback beta. Default: A.
Q18 [NON-BLOCKING] Effort: SPEC is silent and the model default is `high`. Default: `medium`, checked against the 14 eval questions in Phase 3 and logged.
Q19 [NON-BLOCKING] eval:copilot assumes unedited data at 20 Apr, and Q14 needs a UI edit. Default: run on the test branch (reset, set 20 Apr, Q01-Q13, apply the Q14 edit through the write module, ask Q14).
Q20 [NON-BLOCKING] Q04 lists 4 of the 6 deals tied at 90,000 (O033, O038, O043, O048, O053, O058) in an order no rule reproduces (not by id, name or last update). Default: sort by value, then oldest update, then id; always state the tie. Please grade on the tie, not the order.
Q21 [NON-BLOCKING] Q09 "average deal size, Food and beverage": 6 deals, 5,50,000 includes 2 in-kind deals (O005 1,00,000, O026 60,000). Cash-only = 3,90,000 / 4 = 97,500. Default: answer 91,667 (cash + in kind) and also state the cash-only figure.
Q22 [NON-BLOCKING] CONTEXT says cold channels made "0 deals". That holds at 20 Apr only: Cobalt (O006) is SC03 and was confirmed from 25 Feb to 20 Mar. Default: the copilot always cites the as-of date and never says cold "never" converted.
Q23 [NON-BLOCKING] `verify` on the demo DB: if someone changes settings (stale days, weights, rate), metrics drift from the reference. Default: compute with the reference assumptions, print live settings, and flag the difference.
Q24 [NON-BLOCKING] No view exists for `event` (festival start), and `read_me`/`field_guide` are documentation sheets. Default: add `v_event`, load all 12 CSVs, and expose the field guide through `data_dictionary()`.
Q25 [NON-BLOCKING] Stamp rule with a past simulation date: the edit lands after an entity's latest version, possibly after the date on screen, so it is invisible there. Default: allow it and show "effective <timestamp>, after the simulation date".
Q26 [NON-BLOCKING] Days to festival at the default date (20 Apr) is negative. Default: show "Festival held 12-13 Apr (8 days ago)".
Q27 [NON-BLOCKING] REPORTING says reports stay under 150 lines, and this one needed to be thorough. I kept one line per item. Tell me if you want an appendix instead.

## 7. Known issues and risks
1. Neon setup: nothing is provisioned (Q1). Free plan: per-branch storage cap (data < 1 MB, fine) and monthly compute shared by demo and test; scale-to-zero adds a cold start on the first request after idle.
2. Neon pooler (PgBouncer transaction mode): use postgres.js `prepare: false` on the pooled URL; `SET LOCAL statement_timeout` inside a transaction for `query_data`; migrations and reset on the direct URL.
3. Test guard: pooled and direct strings of the same branch differ, so a string compare can pass while pointing at the demo DB. The guard compares endpoint id (strip `-pooler`) + database name.
4. Reset recreates views, so grants to the read-only role are lost unless the migration re-grants them. Reset runs in one transaction so concurrent requests never see empty tables.
5. Shared state by design (no auth): one simulation date, one dataset and a public Reset. Graders can collide. Settings shows app writes since reset and the audit tail.
6. Anthropic cost: claude-sonnet-5-5 costs $2 / $10 per MTok (cache read $0.10). Each round resends the growing history, so my estimate is about US$0.05-0.20 per question (not measured; Phase 3 logs real usage). Prompt caching needs a ≥512-token prefix, which system + tools will exceed; I will check `cache_read_input_tokens > 0`.
7. Anthropic limits: 429 and 529 are retried by the SDK (2 retries by default, plus our backoff), but a spend-cap 429 is not retryable and would stop the copilot until the cap resets. Rate limits depend on the owner's tier (unknown).
8. Anthropic API rules on this model: non-default temperature/top_p/top_k, forced tool_choice and disabled thinking each return 400. History must be append-only with thinking blocks passed back unchanged, or the next request errors or drops reasoning. SPEC already respects this.
9. Copilot grounding: the model may skip `calculate`, the as-of date or provenance labels. Every tool result carries `as_of` and tags, and the eval is judged strictly.
10. Vercel Hobby: the terms are for non-commercial use (owner to confirm); 300 s default duration is fine for 6 rounds. The 4.5 MB request body caps the client-held history, so tool results stay compact (row limits) and a long chat prompts "start a new chat".
11. Vercel region: functions default to US East while Neon will be in Singapore, about 200 ms per query. Pin functions to sin1; the engine loads views once per request.
12. The in-memory 30 req/h limit is per function instance, so it is approximate, and graders behind one NAT share it.
13. Node: local is 22.20 while Vercel defaults to 26. Pin `engines` to the same major.
14. Timezone: this machine runs IST and Vercel runs UTC, so `new Date('2025-04-20')` and `toLocaleDateString()` bugs would pass locally and fail in prod. Run tests with `TZ=UTC`; parse Postgres `date` as a string (postgres.js turns it into UTC midnight); build instants with explicit +05:30.
15. Rounding: Python `round` is half-to-even and `Math.round` is half-up. No reference value ends in .5 (all multiples of 50), but float summation order must follow the reference; tests will catch a drift.
16. CSV parsing (checked): UTF-8, no BOM, LF, every timestamp ISO +05:30, 7 quoted fields contain commas, so use a real parser (csv-parse). IDs stay text (O006, SCON080). Empty → NULL (373 origin_interaction_id, 3 paid_at, task links). `True` → boolean (event.fictional). Money stays integer. `ingest_row` = 1-based data row.

## 8. Files changed (tree, new files marked +)
```
risa-growth-center/   (pack extracted unchanged)
└── reports/
    └── + phase-0.md
```

## 9. How the owner can see it
Open `reports/phase-0.md`. There is no app yet.

## 10. Ready for next phase?
NO. Needs Q1 (Neon project, `test` branch, read-only role, Anthropic key in .env.local) and Q2 (permanent folder + git). Q3 and Q4 shape the schema; their defaults apply if there is no answer.
