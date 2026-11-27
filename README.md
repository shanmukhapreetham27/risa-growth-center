# RISA Growth Center (Challenge B, Sponsorship Growth)

Author: Shanmukha Preetham Bukka.

## 1. What it is

A working command center for the sponsorship team of a college festival: an analytics dashboard, a campaign, pipeline, collections and task manager, and an embedded AI copilot, all on one live Postgres database. It replays the CampusFest 2025 sponsor dataset (15 Jan to 20 Apr 2025) as last year's baseline for a new Bengaluru edition, whose goal is to maximise sponsorship cash collected before the festival.

Every number is tagged **Sourced** (the provided dataset or edits made in the app), **Simulated** (payments, budgets, spend, seed tasks: the source has none) or **Assumption** (stage weights, collection rate, stale days, cash goal, set in Settings).

## 2. Live link

**https://risa-growth-center-one.vercel.app** (Vercel Hobby, functions in region sin1, Singapore; data in the Neon `main` branch, aws-ap-southeast-1). The copilot panel opens from the header on any page; the full page view is /copilot.

The demo database is shared by everyone who opens the link. Settings > "Reset to original data" restores the provided data (see §13).

## 3. Demo script (SPEC §6.5)

1. **Overview at 20 Apr 2025:** 24 confirmed partnerships against a goal of 28; the campaign table shows SC01 Brand Discovery Email STOP, SC03 Brand Leader LinkedIn and SC06 Past Conversation Revival CHANGE, the three warm campaigns SCALE.
2. **Ask the copilot** (button in the header, or /copilot): "Why are we behind on partnerships?" It separates evidence (cold channels: 33 opportunities, 0 confirmed; all 26 open deals stale) from inference and names what the data cannot show (no loss reasons).
3. **Follow up:** "Which stuck deals are worth the most?" A ranked list with ids; it flags the six-way tie at ₹90,000 and names the tie break rule.
4. **Act:** "Pause Brand Discovery Email and create a task for Riya to follow up the top negotiating deals by 25 April." Two proposal cards appear; nothing is written until you click Confirm on each.
5. **See the writes:** Campaigns shows SC01 paused; Tasks shows the new task marked Copilot; Settings > Recent changes shows both writes with actor copilot.
6. **A question the data cannot answer:** "Why did Cobalt Learning withdraw?" It says there is no reason field, shows what the record does contain (O006 confirmed 25 Feb, withdrawn 20 Mar), and offers a task to ask.
7. **Change the data:** on Pipeline, open O028 Cedar Pantry and move it to partner_confirmed. Overview shows 25 at once, and the copilot answers 25 and names the app edit.

A recorded rehearsal of these steps with the live model (transcript and one screenshot per step) is in `reports/phase-4-demo/`.

## 4. How it maps to the brief

| Brief item (Part 2) | Feature |
|---|---|
| 1. Measure performance | Overview: KPI cards (confirmed vs goal, qualified vs goal, confirmed cash and in kind, cash collected vs team cash goal, open and weighted pipeline, projected cash before the festival), the funnel with stage conversion, trend chart with the goal step line, campaign table with KPIs, budget, spend and cash per rupee |
| 2. Diagnose performance | Diagnose: stage conversion by campaign and by warm / cold channel group with the bottleneck, stale deals, median days in stage, owner and industry breakdowns, what changed week over week |
| 3. Support decisions | SCALE / CHANGE / STOP / WATCH badge per campaign from explicit rules (§8), shown with the rule that fired |
| 4. Manage execution | Campaigns, Pipeline, Collections and Tasks pages; every edit is saved, audited, and flows into every metric at once |
| 5. AI copilot | Claude through the Anthropic Messages API with 14 tools over the live database; confirm before write; honest about gaps (§9) |
| Persistent changes, reliable updates | Postgres (Neon), append-only history for versioned records, audit log, Reset to original data |
| Original data kept for testing | `data/source_csv` is never modified; Reset reloads it |

## 5. Architecture

```
Browser ── Next.js App Router pages (server components, rendered per request)
             │  read: lib/server/data → lib/engine (pure TypeScript metrics over the v_* views, loaded once per request)
             │  write: server actions → lib/writes (append-only versions, stamp rule, audit_log)
             └─ Copilot panel / page ── POST /api/chat (NDJSON progress events)
                   lib/copilot/chat.ts: Messages API tool loop (max 6 tool rounds), grounding check
                   lib/copilot/tools.ts: 12 read tools on the same engine as the pages, query_data (read only role),
                                         calculate (mathjs), 2 propose tools → chat_proposals (pending)
                   POST /api/proposals/:id/confirm | reject ── lib/writes as actor copilot
Postgres (Neon): source tables (raw, with duplicates) → v_* dedupe views; app tables settings, tasks,
                 chat_proposals, audit_log, copilot_usage
```

- **One engine:** pages, copilot tools, tests and `npm run verify` all call the same functions (`computeSnapshot(data, asOf)` and the analytics in `lib/engine`), so a number in a copilot answer equals the number on the page.
- **Time:** all business logic in Asia/Kolkata. "As of date D" means end of day D IST. A shared simulation date (header picker, default 20 Apr 2025) is "today" for every page and tool.
- **Writes:** versioned records (opportunity stage and value, brand qualification, interactions, targets) are append only: an edit inserts a new version with an `APP-` id, stamped at the simulation date (stamp rule, SPEC §2.4), so earlier snapshots never change. Confirming a cash deal creates simulated installments; moving it out of confirmed voids the unpaid ones. Every write goes to `audit_log`.

## 6. Data sources

| Kind | What | Where |
|---|---|---|
| Sourced | Brands, contacts, sponsor campaigns, interactions, qualification history, opportunities and their version history, targets, activations, festival dates; plus edits made in the app | `data/source_csv/*.csv` (exact export of the provided workbook, duplicates kept; views dedupe them) |
| Simulated | Payment installments and payments (50% advance, 50% balance), campaign budgets and spend, six seed tasks | `data/simulated/*.csv`, fixed seed, generated by `scripts_reference/reference_engine.py` |
| Assumption | Stage weights, collection rate, stale days (7), team cash goal (₹24,46,000 = the strategy base case) | `settings` table, editable in Settings |

## 7. Metric definitions

Exact definitions are in [SPEC.md §3](SPEC.md). They reproduce `reference_metrics.json` exactly: `npm test` checks every metric at all 10 reference dates, and `npm run verify` checks 132 values on the live demo database.

## 8. Decision rules (SPEC §5)

meeting rate = conversations ÷ contacted; closed = confirmed + lost or withdrawn; win rate = confirmed ÷ closed. In order: WATCH if under 5 opportunities and under 3 closed; SCALE if 3 or more closed, win rate 50% or more and meeting rate 40% or more; STOP if 0 confirmed from 8 or more opportunities with a meeting rate under 25%; otherwise CHANGE, with the reason.

## 9. Copilot design and guardrails

- **Model:** `claude-sonnet-5-5` (env `ANTHROPIC_MODEL`) through `@anthropic-ai/sdk` 1.8.0; docs checked 2026-11-27. Effort medium, adaptive thinking (kept and passed back unchanged), tool choice auto, prompt caching on the tools, the system prompt and the conversation. The API key stays on the server.
- **Tools (14):** get_overview, get_funnel, compare_snapshots, list_opportunities, get_opportunity_history, get_campaign_decisions, get_collections, get_budgets, list_tasks, query_data (one read only SELECT over the v_* views through the `risa_readonly` role, 3 s, 200 rows), calculate (restricted mathjs), data_dictionary (fields, origins and the list of gaps), propose_task, propose_campaign_status. Every read takes an as of date and returns it with the origin of each figure. List tools return every matching row (up to 200) with a summary over all of them (counts, totals, oldest, newest, largest, ranges, by stage, owner and campaign).
- **Rules (system prompt):** numbers only from tools; arithmetic only through `calculate`; always the as of date and the Sourced / Simulated / Assumption tag; evidence separated from inference; say plainly when the data cannot answer and name the missing field; state ties and the tie break rule; ids with every deal, campaign, installment or task it names; absence of a record is not evidence.
- **Grounding check (in code, not only in the prompt):** before an answer is shown, every number must trace to a tool or calculate result in the conversation; every id must come from a tool result and the name beside it must be that record; counts and ranges must come from a tool call made for that answer. A failing answer goes back to the model once; anything left is shown to the user as a notice. A proposal whose title, notes or reason fails the check is not created.
- **Confirm before write:** propose tools only store a pending proposal; the card has Confirm, Edit and Cancel; only Confirm writes, through the same write module as the UI, with actor copilot in the audit log. The copilot never says an action happened before the confirmed result exists.
- **Cost guards:** 30 requests per hour per IP, and 300 requests per day for everyone together (counted in the database, resets at midnight IST). Token usage and cost are logged per request.

## 10. Setup and env vars

Requirements: Node.js 22, a Neon project with a `main` branch (demo) and a `test` branch (tests), a read only role `risa_readonly` on both (SPEC §2.3), an Anthropic API key.

```
npm install
cp .env.example .env.local     # fill in the values; .env.local is never committed
npm run db:reset               # migrations + load source and simulated CSVs into the demo database
npm run dev                    # http://localhost:3000
```

| Variable | Used for |
|---|---|
| `DATABASE_URL` | demo database (Neon `main`, pooled), the app at runtime |
| `DATABASE_URL_UNPOOLED` | demo database, direct: migrations and Reset |
| `DATABASE_URL_READONLY` | `risa_readonly` on `main`: the copilot's query_data |
| `DATABASE_URL_TEST` | Neon `test` branch, direct: tests only (they reset it); the test setup aborts if it points at the demo endpoint |
| `DATABASE_URL_READONLY_TEST` | `risa_readonly` on `test`: query_data tests |
| `ANTHROPIC_API_KEY` | server side only |
| `ANTHROPIC_MODEL` | default `claude-sonnet-5-5` |

## 11. Tests and the copilot eval

| Command | What it checks |
|---|---|
| `npm test` | Vitest on the test branch: every metric equals `reference_metrics.json` at all reference dates, write semantics (confirm, pay, withdraw, reset), every copilot read tool equals the engine, query_data through the read only role, the grounding check, the eval checks, the daily cap |
| `npm run verify` | read only check of the live demo database against the reference (132 values), plus the count of app writes since reset |
| `npm run test:e2e` | Playwright on a production build against the test branch: user flows and a no-clipping layout check on every page at 1280 and 1440 px |
| `npm run eval:copilot` | the 20 questions in `copilot_eval_questions.json` against the live model on the test branch; transcripts in `eval/results/` |
| `npm run demo:rehearse` | the §3 demo, driven by Playwright with the live model; transcript and screenshots in `reports/phase-4-demo/` |

### Eval summary

Run of record: `eval/results/2026-11-27T04-18-00.md`, on the Neon test branch, reset first, simulation date 20 Apr 2025. Q04 continues Q03's conversation. O028 is confirmed through the write module before Q14, and stale days is set to 45 before Q20, as a user would in the UI.

**20 of 20 answers pass** when graded by hand against the expected answers, with every figure checked against the engine. **All 6 auto checks pass**: they are exact matches on ids and numbers, with the expected values computed from the engine at run time. The **id-number check finds no mismatch in any answer**. Cost $0.51 for 20 questions; every question read from the prompt cache (558,454 cache-read tokens).

| Q | Type | Verdict | Auto check (engine value) | Id-number check | Reason |
|---|---|---|---|---|---|
| Q01 | fact | PASS | - | no mismatch | 24 vs 28 (revised plan, 15 Mar), 4 short, as of 20 Apr 2025 |
| Q02 | calc | PASS | - | no mismatch | SC05 Creator Network Referrals ₹7,25,000 cash from 9; SC02 ties at ₹7,85,000 with in kind |
| Q03 | diagnosis | PASS | - | no mismatch | Cold 33 opportunities, 0 confirmed; all 26 open deals stale and cold; evidence vs inference; no loss reasons |
| Q04 | follow_up | PASS | - | no mismatch | O028 Cedar Pantry ₹1,10,000 first; six-way ₹90,000 tie with the rule |
| Q05 | snapshot | PASS | - | no mismatch | 15 and ₹12,60,000 cash at 10 Mar; launch plan goal 20; O006 counted then, withdrawn 20 Mar |
| Q06 | calc_caveat | PASS | - | no mismatch | ₹18,42,500, ₹17,90,000 before the festival, ₹1,57,500 overdue in 3; simulated |
| Q07 | cannot_answer | PASS | - | no mismatch | No reason field; full stage history of O006; 'no later qualification change'; task offered |
| Q08 | cannot_answer | PASS | - | no mismatch | No footfall per sponsor; activation note is an association only; task offered |
| Q09 | calc | PASS | - | no mismatch | ₹91,667 cash plus in kind (6) and ₹97,500 cash only (4), via calculate |
| Q10 | calc_caveat | PASS | - | no mismatch | Simulated; undefined, not zero, for the 3 cold campaigns |
| Q11 | action | PASS | - | no mismatch | Proposal for Riya, 25 Apr: O028, O053, O038; tie and rule named; alternative offered; 0 writes |
| Q12 | calc_caveat | PASS | - | no mismatch | PAY033, PAY034 (₹55,000, 29 Mar), PAY032 (₹47,500, 26 Mar), days overdue; simulated |
| Q13 | cannot_answer | PASS | - | no mismatch | No forecast; baseline, weighted pipeline as assumption, cash goal as a target |
| Q14 | changed_data | PASS | - | no mismatch | 25 after the app edit to O028, named |
| Q15 | fact | PASS | O035 Cedar Wellness, 89 days: PASS | no mismatch | graded by the auto check |
| Q16 | calc | PASS | 9 of 9: PASS | no mismatch | graded by the auto check |
| Q17 | calc | PASS | ₹420000 across 8 deals: PASS | no mismatch | graded by the auto check |
| Q18 | fact | PASS | O030, O035, O036, O037, O045, O046, O053, O055, O056: PASS | no mismatch | graded by the auto check |
| Q19 | snapshot | PASS | 17: PASS | no mismatch | graded by the auto check |
| Q20 | changed_data | PASS | 16 (stale days 45): PASS | no mismatch | graded by the auto check |

**What changed between runs.**

1. Phase 3 had seven runs. Hand-graded results went from 7 PASS / 7 PARTIAL to 13 / 1 as fixes landed:
   - the tools started to expose what the model had been guessing;
   - the prompt required `calculate` for every derived number;
   - a grounding check started returning untraced numbers to the model.
2. Review then found three wrong facts that had been graded PASS, because each number existed somewhere in the tool results:
   - an oldest deal named wrongly (the list was cut at 20 rows);
   - "30 to 41 days" for a set whose true range was 30 to 47;
   - "two of them" where the answer was three.
3. Phase 4 fixed those classes of error:
   - list tools return every row with a summary;
   - every record is named with its id;
   - the check also verifies ids, the name beside each id, counts and ranges, and proposal text;
   - the eval gained Q15 to Q20 with auto checks and the id-number check.
4. Phase 4 run 1 (`2026-11-27T04-06-28`): 6 of 6 auto checks, 19 PASS and 1 PARTIAL by hand. Q05 said Cobalt Learning "was confirmed on 10 March"; it was confirmed on 25 Feb and was still confirmed on 10 Mar. The id-number check flagged two correct answers, so the checker was fixed, not the answers. Run 2 is the run of record.

## 12. Tools and plans used

| Tool | Plan or version | Use |
|---|---|---|
| [Next.js](https://nextjs.org) | 16.4.6 (App Router), React 19.3 | app and API routes |
| [Tailwind CSS](https://tailwindcss.com), [shadcn/ui](https://ui.shadcn.com) (Base UI), [Recharts](https://recharts.org) | 4.3, 4.23, 3.10 | UI and charts |
| [Neon](https://neon.tech) Postgres | Free plan, aws-ap-southeast-1, branches `main` and `test` | database |
| [postgres.js](https://github.com/porsager/postgres) | 3.4.7 | database client |
| [Vercel](https://vercel.com) | Hobby, region sin1 | hosting |
| [Anthropic API](https://platform.claude.com/docs) | pay as you go, `claude-sonnet-5-5`, `@anthropic-ai/sdk` 1.8.0 | copilot |
| [mathjs](https://mathjs.org) | 15.2.0 | the copilot's calculate tool |
| [Vitest](https://vitest.dev), [Playwright](https://playwright.dev) | 5.1.2, 1.65.1 | tests, e2e, demo rehearsal |
| [Claude Code](https://claude.com/claude-code) | | wrote the code, tests and reports under the owner's direction |

**Reused:** the provided CampusFest 2025 dataset (unchanged, `data/source_csv`); `reference_metrics.json`, `scripts_reference/` and the simulated CSVs supplied with the spec; the create-next-app scaffold and shadcn/ui component sources. **Modified:** shadcn components only for layout and labels. **Verified:** every metric against `reference_metrics.json` (`npm test`, `npm run verify`), every copilot tool against the engine, writes and reset on a separate test branch, the copilot with a 20 question eval (with mechanical checks on ids and numbers) and a scripted end-to-end demo.

## 13. Known limitations

1. **Shared state and Reset:** there is no login (out of scope); everyone who opens the link edits the same demo database and the same simulation date. Settings > Reset to original data restores the provided data for everyone.
2. **Nondeterministic answers:** the copilot's wording, the tools it picks and occasionally its reading of an ambiguous request vary between runs. The grounding check and the tool summaries limit wrong numbers but do not make answers identical; the eval reports a single run.
3. **Simulated data:** payments, budgets, spend and seed tasks are simulated (the source has none), so cash collected, overdue installments and cost per partnership are illustrations, and are labelled Simulated everywhere.
4. **Assumptions:** stage weights, collection rate, stale days and the cash goal are editable assumptions; projected cash depends on them.
5. **Rate limits:** the per IP limit lives in server memory and starts again on a new server instance; the daily cap of 300 copilot requests is shared by all users.
6. **Fictional, small dataset:** 58 opportunities; rates are directional.
7. **A strict accuracy check:** a deal, brand or campaign named without its id in the same sentence produces a visible notice under the answer, even when the statement is right (for example "the brand (Cobalt Learning)" after the answer already named O006). Copilot actions are limited to tasks and campaign status changes, and an answer takes 5 to 20 seconds.

## 14. Decision log

Every deviation and judgement call, with date, spec reference and reason: [docs/DECISIONS.md](docs/DECISIONS.md). Phase reports: `reports/`.

## 15. Strategy, research and calculations

The rest of this section is `docs/STRATEGY_NOTES.md`, included verbatim.

# Strategy, research and calculations

Author: Shanmukha Preetham Bukka · Challenge B, Sponsorship Growth · City: Bengaluru

This section backs the three slide deck. Every figure is labelled:
**Sourced** comes from the provided CampusFest 2025 sponsor dataset;
**External** comes from cited research (links in §9);
**Assumption** is my estimate, with its basis stated;
**Simulated** is data generated for the app with a fixed seed (payments, budgets, spend, seed tasks).

The deck treats CampusFest 2025 as last year's baseline and plans a new Bengaluru edition. The app replays the 2025 campaign as a command center.

## 1. Goal and headline

Goal: maximise sponsorship **cash collected before the festival**.

| Case | Cash collected before the fest | Signed value | Deals | vs 2025 confirmed cash (₹20,00,000) |
|---|---|---|---|---|
| Base | ₹24,46,227 (₹24.5L) | ₹27,31,255 | 28.1 | 1.2x |
| Stretch | ₹52,83,518 (₹52.8L) | ₹55,99,915 | 50.8 | 2.6x |

## 2. Why Bengaluru

1. **Students (External):** Bengaluru Urban has 1,148 colleges, the most of any district in India (AISHE 2023 to 24). Jaipur is next with 742.
2. **Brands (External):** Bengaluru is one of India's top two D2C hubs, with $3.4B raised across 342 deals between 2015 and Q1 2026. Delhi NCR is first, with $3.5B across 434 deals (Inc42 D2C 3.0 Report 2026). Bengaluru also drew about $4.6B across nearly 300 deals in 2025, close to 45% of India's startup funding.
3. **Fit with last year's sponsors (Sourced):** the 2025 sponsor categories (Food and beverage, Consumer products, Mobility, Education, Media, Personal care) are the consumer and youth categories these hubs produce.
4. **Why not Delhi NCR (Inference):** NCR edges Bengaluru on D2C funding, but its brands and colleges are spread across Delhi, Gurugram and Noida. Bengaluru puts a near equal brand base and the country's largest college cluster in one city, which keeps sampling and stall logistics simple.

## 3. Baseline: what CampusFest 2025 shows (Sourced)

**Data handling.**
1. Duplicates were removed by stable id: interactions 953 to 950, qualification 434 to 433, opportunity history 230 to 228.
2. Every metric uses the latest version of each record as of end of day IST, so no future outcome leaks into an earlier date.
3. The app reproduces every number below; `npm run verify` checks 132 of them against a reference.

**Funnel as of 20 Apr 2025:**
1. 180 prospect brands, all of them contacted.
2. 109 brands responded.
3. 60 discovery conversations (meeting held).
4. 58 opportunities, of which 46 reached proposal.
5. 24 confirmed partnerships (24 brands), against a goal of 28 (revised plan, 15 Mar).

Confirmed value is ₹22,40,000: ₹20,00,000 cash across 20 deals and ₹2,40,000 in kind across 4. Qualified brands are 60 against a goal of 55, so the gap is conversion, not lead volume.

| Channel group | Contacted | Responded | Conversations | Opportunities | Proposals | Confirmed |
|---|---|---|---|---|---|---|
| Warm: SC02 Warm Partner Introductions, SC04 Partner Interest Form, SC05 Creator Network Referrals | 44 | 44 | 36 | 25 | 25 | 24 |
| Cold: SC01 Brand Discovery Email, SC03 Brand Leader LinkedIn, SC06 Past Conversation Revival | 141 | 70 | 24 | 33 | 21 | 0 |

Other findings:
1. **Cobalt Learning:** O006 came from a cold channel (SC03). It was confirmed on 25 Feb at ₹80,000 and withdrew on 20 Mar. Cold shows 0 confirmed only as of 20 Apr.
2. **Stale pipeline:** all 26 open opportunities at 20 Apr are cold, and all are stale (no update in more than 7 days). Their proposed value is ₹14,40,000. The longest untouched is O035 Cedar Wellness, at 89 days. Cold deals spent longer in every stage: median 3, 4, 5 and 6 days, versus 2, 3, 3 and 2 for warm deals. They were also smaller, with a median proposed value of ₹55,000 against ₹90,000 for warm.
3. **Speed and size:** confirmed deals took a median 10 days from opportunity to confirmation and 16 days from first touch. Confirmed values ranged from ₹35,000 to ₹2,00,000, with a median of ₹92,500. The average cash deal was ₹1,00,000.

**Conclusion:** the engine is warm relationships. Cold outreach produced conversations but no lasting deals, and the cold pipeline died of neglect rather than rejection: only 7 of its 33 opportunities were lost or withdrawn, and the other 26 are still open but stale.

## 4. Who we target, why they pay, how we pick

**Motivations by category (Assumption, from the 2025 sponsor mix):**
1. Food, beverage and consumer products: sampling and trial.
2. Personal care: sampling plus creator content.
3. Mobility: app installs and test rides.
4. Education and edtech: lead capture.
5. Media: content and subscriptions.

**Selection criteria.** A brand enters the pipeline only if it meets all of the first four:
1. Its product sells to 18 to 24 year olds.
2. It has a Bengaluru marketing budget or team.
3. A warm path in exists: an alumnus, a past partner or a creator. This is the strongest predictor in the 2025 data: 24 of 25 warm opportunities were won, against 0 of 33 cold by 20 Apr.
4. It can pay cash on our terms.

Category clashes with exclusive partners are excluded.

## 5. Slide 1 model

**Formula, per engine:** cash = prospects × meeting rate × proposal rate × signed rate × average deal × collection rate.

| Engine | Prospects base / stretch | Meeting rate | Proposal rate | Signed rate | Avg deal | Collection | Basis |
|---|---|---|---|---|---|---|---|
| A Renewal and upsell desk | 24 / 24 | 90% / 95% | 85% / 90% | 65% / 75% | ₹95,000 / ₹1,20,000 | 92% / 96% | Pool = last year's 24 partners. Renewal overall about 50% base, 64% stretch (Assumption: no reliable public benchmark; validated in week 12 calls). Deal anchored on the 2025 average cash deal of ₹1,00,000 |
| B Warm intro engine | 50 / 70 | 80% / 82% | 65% / 70% | 50% / 65% | ₹90,000 / ₹95,000 | 92% / 96% | Meeting and proposal rates from 2025 warm channels (82%, 69%). Signed rate cut from the observed 96% to 50%, because referred leads close about 26% at the sales conversation stage (External) and 25 opportunities is a small sample. 44 warm brands in 2025, 50 to 70 planned |
| C Near miss reactivation | 26 / 40 | 50% / 60% | 70% / 75% | 25% / 40% | ₹55,000 / ₹60,000 | 92% / 96% | Pool = 26 stalled 2025 opportunities (stretch adds 14 engaged brands). Deal = cold median proposed ₹55,000 plus a ₹40,000 starter tier |
| D Anchor partner ABM | 12 / 15 | 40% / 50% | 60% / 70% | 30% / 40% | ₹3,50,000 / ₹4,00,000 | 70% / 85% | Large Bengaluru brands for presenting and category slots. Low collection because procurement can pay after the event (Assumption) |

**Base case:**

| Engine | Prospects | Meetings | Proposals | Signed | Avg deal | Signed value | Collect | Cash |
|---|---|---|---|---|---|---|---|---|
| A Renewal and upsell desk | 24 | 21.6 | 18.4 | 11.9 | ₹95,000 | ₹11,33,730 | 92% | ₹10,43,032 |
| B Warm intro engine | 50 | 40.0 | 26.0 | 13.0 | ₹90,000 | ₹11,70,000 | 92% | ₹10,76,400 |
| C Near miss reactivation | 26 | 13.0 | 9.1 | 2.3 | ₹55,000 | ₹1,25,125 | 92% | ₹1,15,115 |
| D Anchor partner ABM | 12 | 4.8 | 2.9 | 0.9 | ₹3,50,000 | ₹3,02,400 | 70% | ₹2,11,680 |
| **Total** | **112** | **79.4** | **56.3** | **28.1** | ₹97,200 | **₹27,31,255** | 90% | **₹24,46,227** |

**Stretch case:**

| Engine | Prospects | Meetings | Proposals | Signed | Avg deal | Signed value | Collect | Cash |
|---|---|---|---|---|---|---|---|---|
| A Renewal and upsell desk | 24 | 22.8 | 20.5 | 15.4 | ₹1,20,000 | ₹18,46,800 | 96% | ₹17,72,928 |
| B Warm intro engine | 70 | 57.4 | 40.2 | 26.1 | ₹95,000 | ₹24,81,115 | 96% | ₹23,81,870 |
| C Near miss reactivation | 40 | 24.0 | 18.0 | 7.2 | ₹60,000 | ₹4,32,000 | 96% | ₹4,14,720 |
| D Anchor partner ABM | 15 | 7.5 | 5.2 | 2.1 | ₹4,00,000 | ₹8,40,000 | 85% | ₹7,14,000 |
| **Total** | **149** | **111.7** | **84.0** | **50.8** | | **₹55,99,915** | | **₹52,83,518** |

**Constraints that cap the model:**
1. **Capacity:** the base case needs 79 conversations, which is 4 owners at last year's pace of about 20 each (60 conversations across 3 opportunity owners). The stretch case needs 112 conversations, so about 5 owners at 25 each.
2. **Inventory:** the rate card below has 63 slots worth ₹62,50,000. The stretch case sells about 90% of it by value.

   | Tier | Slots | Price | Value |
   |---|---|---|---|
   | Presenting partner | 1 | ₹6,00,000 | ₹6,00,000 |
   | Category exclusive partner | 4 | ₹3,00,000 | ₹12,00,000 |
   | Zone partner | 8 | ₹1,50,000 | ₹12,00,000 |
   | Experience partner (stall, activation, digital) | 25 | ₹90,000 | ₹22,50,000 |
   | Sampling partner | 25 | ₹40,000 | ₹10,00,000 |
   | **Total** | **63** | | **₹62,50,000** |

3. **Timeline:** 12 weeks. Contracts take 50% at signing and the balance 3 weeks before the festival. Anyone signing inside those 3 weeks pays 100% upfront. This mirrors standard event sponsorship contracts (External: SPE, ASCE). With a 16 day median from first touch to confirmation, the last warm intro must arrive about 5 weeks out.
4. **Collection:** 92% with cash first terms versus 80% without (Assumption). The source has no bank receipts, so this is tracked weekly in the app.

**Downside sensitivity (base case):**

| Scenario | Cash collected |
|---|---|
| Base | ₹24,46,227 |
| Signed rates 10 points lower for engines A and B | ₹20,70,480 |
| No anchor partner signs | ₹22,34,547 |
| No cash first terms (80% and 60% collection) | ₹21,24,524 |
| All three at once | ₹16,16,348 |

## 6. Slide 2: prioritisation

**Framework:** a cash version of RICE. Score = expected base case cash × confidence ÷ person weeks.

To avoid double counting, bets 1, 3, 4 and 5 are valued at the 80% collection rate we would get without new terms. Bet 2 (cash first terms) carries the extra cash those terms collect. The five contributions then add up exactly to the totals.

| Rank | Bet | Base cash | Stretch cash | Confidence | Person weeks | Score | Call |
|---|---|---|---|---|---|---|---|
| 1 | Renewal and upsell desk | ₹9,06,984 | ₹14,77,440 | 0.8 | 4 | 1.81 | Double down |
| 2 | Cash first contracting and collections | ₹3,21,703 | ₹9,71,586 | 0.7 | 3 | 0.75 | Guardrail |
| 3 | Warm intro engine | ₹9,36,000 | ₹19,84,892 | 0.6 | 20 | 0.28 | Double down |
| 4 | Near miss reactivation, ₹40,000 starter tier | ₹1,00,100 | ₹3,45,600 | 0.5 | 3 | 0.17 | Small bet |
| 5 | Anchor partner ABM | ₹1,81,440 | ₹5,04,000 | 0.3 | 8 | 0.07 | Option, decide by week 6 |
| | **Total** | **₹24,46,227** | **₹52,83,518** | | **38 of 60** | | |

**Resources.** The team is 5 people × 12 weeks = 60 person weeks. The five bets use 38; the other 22 go to delivery (activations, reporting). Budgets total ₹95,000:

| Bet | Budget | What it pays for |
|---|---|---|
| Renewals | ₹15,000 | Recap reports |
| Cash first | ₹5,000 | Payment links |
| Warm intros | ₹40,000 | Connector thank yous and creator referral fees |
| Reactivation | ₹5,000 | Outreach |
| Anchors | ₹30,000 | Custom pitches |

**Dependencies and overlap:**
1. Renewed partners become connectors for the warm intro engine.
2. Anchors must lock by week 6, before category slots are sold to competitors.
3. Each brand has one owner, so reactivation and intros never count the same brand twice.

**Rejected:**
1. **Scaling cold email or LinkedIn:** in 2025 these channels contacted 141 brands and produced 33 opportunities, with 0 confirmed by 20 Apr.
2. **Counting in kind deals as revenue:** ₹2,40,000 of value, ₹0 of cash.
3. **Discounting to close:** it cuts cash, so we use a starter tier instead.
4. **Bought lead lists:** they are cold outreach by another name.

## 7. Slide 3: signals and thresholds

| Bet | Critical variable and biggest risk | Early signal | Scale if | Change if | Stop if |
|---|---|---|---|---|---|
| Renewals | Renewal intent; partners saw no ROI proof | Share of 24 partners booked by week 10 | 60% or more intent by week 9: sell upgrades | 35% to 60%: ROI recap plus early pay bonus | Under 35%: owner moves to warm intros |
| Cash first | Advance paid within 7 days; procurement pays net 60 | First 5 contracts | 80% or more on time: keep terms for all | 60% to 80%: reminders, escalate at day 10 | Under 60%: hold stall and logo until paid |
| Warm intros | Intros per connector; weak or slow intros | Intros received in week 11 | 1.5 or more per connector: recruit more | Under 1 per connector: target list plus reward | A connector group with 0 meetings in 2 weeks |
| Reactivation | Reply within 5 days; budget already spent | Replies from the first 10 | 25% or more: add the 28 engaged brands | 10% to 25%: lead with the ₹40,000 starter tier | Under 10% after 2 touches |
| Anchors | Decision maker access; cash lands after the fest | Meetings by week 9 | 2 or more proposals by week 8: add a slot | Meetings but no proposal: offer category exclusive | No signature by week 6: resell the slots |

**Portfolio rule, reviewed weekly:** if projected cash stays under 85% of plan for two weeks running, move person weeks from bets 4 and 5 into bets 1 and 3.

**How the Growth Center supports these calls:**
1. **Measure:** the funnel, targets versus actuals and projected cash on any date, plus a stale alert after 7 days without an update.
2. **Decide:** every campaign gets a badge from fixed rules, checked in this order (meeting rate = conversations ÷ contacted; win rate = confirmed ÷ closed):
   1. **Watch:** under 5 opportunities and under 3 closed.
   2. **Scale:** 3 or more closed, win rate of 50% or more, and meeting rate of 40% or more.
   3. **Stop:** 0 confirmed from 8 or more opportunities, with a meeting rate under 25%.
   4. **Change:** anything else.

   On the 2025 data at 20 Apr, the warm channels show Scale, Brand Discovery Email shows Stop, and LinkedIn and Past Conversation Revival show Change.
3. **Act:** the AI copilot answers from the live database with the as of date. It labels simulated figures, says when the data cannot answer, and turns recommendations into tasks or campaign changes only after the user confirms.

## 8. Limitations of the strategy

1. The 2025 data is fictional and small (58 opportunities), so its rates are directional. The warm win rate of 96% is implausibly high, which is why it is cut to 50%.
2. Renewal and collection rates are assumptions with no reliable public benchmark. Both have early checks in the first two weeks.
3. The rate card is my design, anchored to the 2025 deal range of ₹35,000 to ₹2,00,000. Pricing is not tied to footfall, because the sponsor data has no audience per sponsor.
4. Payments, budgets and spend in the app are simulated, because the source has none.

## 9. Sources

- **CampusFest 2025 sponsor dataset** (provided with the assignment): `data/Sponsor Dataset.xlsx` and the CSV export in `data/source_csv/`.
- **AISHE 2023 to 24 district college counts:**
  - https://www.freepressjournal.in/analysis/the-aishe-report-institutional-network-of-higher-education
  - https://zeenews.india.com/education/50-districts-30-of-indias-colleges-the-hidden-geography-of-higher-education-3060810.html
- **Inc42 D2C 3.0 Report 2026, city hubs:** https://inc42.com/buzz/delhi-ncr-emerges-as-indias-top-d2c-hub/
- **Inc42, Bengaluru 2025 startup funding:** https://inc42.com/lists/list-of-ecommerce-d2c-startups-in-bengaluru/
- **Referral versus cold close rates (SalesGravy):** https://salesgravy.com/reduce-cold-calls-shorten-sales-cycle-referrals/
- **Sponsorship payment terms:**
  - SPE sponsorship contract: https://www.spe.org/binaries/content/assets/spe-events/2021/symposium/21twid/21twid_20aca1-sponsorship_contract_fillablefinal.pdf
  - ASCE terms: https://www.asce.org/advertise-or-sponsor/asce-sales-terms-conditions
- **Model and reference calculations:** `scripts_reference/growth_model.py`, `docs/growth_model.json`, `scripts_reference/reference_engine.py`, `reference_metrics.json`.
