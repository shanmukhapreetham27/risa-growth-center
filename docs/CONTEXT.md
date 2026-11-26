# Context for Claude Code

Read this before SPEC.md. SPEC.md says *what* to build. This file says *why*, who reviews your work, and where builds like this usually go wrong.

## 1. Who is involved

- **Owner:** Shanmukha Preetham Bukka, a candidate for a Growth APM role at RISA Labs. The work is submitted under the owner's name, and the owner must be able to explain every part of it in an interview.
- **Reviewer:** a separate Claude instance (claude.ai) that wrote SPEC.md, computed `reference_metrics.json`, and is writing the 3 slide strategy deck. It cannot see this repo. It only sees the reports you write (docs/REPORTING.md). Write reports for that reader.
- **You (Claude Code):** you build, test and deploy the working product.

Instructions arrive from the owner, often relayed from the reviewer, as messages that start with `REVIEWER NOTE`. Treat them as authoritative. When a note says `SPEC CHANGE`, update SPEC.md, apply the change, and log it in docs/DECISIONS.md.

## 2. What is being graded (from the brief)

| Weight | Area | What this means for you |
|---|---|---|
| 20% | Dashboard and management | Accurate funnel analytics, usable campaign and task tracking, saved changes, insight to action workflow |
| 20% | AI chatbot | Grounded answers from current data, reliable calculations, diagnosis, execution support, honest uncertainty |
| 60% | Strategy and communication | Mostly the deck (not your job). Your README and DECISIONS.md count toward the 5% for "ownership and communication" |

The graders say they **will change campaign data and constraints, ask unfamiliar questions, check calculations, and check whether the chatbot says when the data cannot answer**. They also say a polished UI alone earns little. So priorities are:

1. Correctness against `reference_metrics.json`
2. Edits that persist and update everything
3. A copilot that never invents numbers
4. Clarity of the UI
5. Visual polish (last)

## 3. The business story the product must support

The data is CampusFest 2025: a fictional two day festival, 12 and 13 April 2025, with sponsor records from 15 Jan to 20 Apr 2025. In the deck it is framed as *last year's baseline* for a new Bengaluru edition. The app replays the 2025 campaign as a command center.

Verified findings (all reproduced in `reference_metrics.json`):

1. 180 brands, 60 discovery conversations, 46 proposals, 24 confirmed partnerships. Confirmed value is ₹20,00,000 cash plus ₹2,40,000 in kind. Goal was 28 (revised plan from 15 Mar). 60 brands are qualified against a goal of 55.
2. **All 24 confirmed deals came from warm channels:** SC02 Warm Partner Introductions, SC04 Partner Interest Form, SC05 Creator Network Referrals.
3. **The cold channels produced 33 opportunities and 0 deals:** SC01 Brand Discovery Email, SC03 Brand Leader LinkedIn, SC06 Past Conversation Revival. All 26 open opportunities went stale (no update in more than 7 days). Some had not been touched since January.
4. Cold deals spent about twice as long in each stage and were smaller (median proposed ₹55K vs ₹90K).
5. Traps:
   1. Duplicate import rows.
   2. Cobalt Learning (O006) was confirmed on 25 Feb and withdrawn on 20 Mar.
   3. Beardo has two opportunities.
   4. In kind value is not cash.
   5. The target changed on 15 Mar.

Strategy in the deck (the app supports it; do not build strategy features beyond SPEC):

- **Goal:** cash collected before the festival. Base ₹24.46L (the app's default `cash_goal_inr` = 2446000). Stretch ₹52.8L.
- **The five bets:**
  1. Renewal and upsell desk
  2. Cash first contracting and collections
  3. Warm intro engine
  4. Near miss reactivation
  5. Anchor partner ABM
- **The app's Scale, Change or Stop badges are the evidence for those bets.** Warm channels show SCALE, SC01 shows STOP, and SC03 and SC06 show CHANGE.

## 4. Sourced vs simulated vs assumption (must stay visible everywhere)

- **Sourced:** everything in `data/source_csv`.
- **Simulated:** payments, budgets, spend, seed tasks (`data/simulated`, `source='simulated'`). The source has no bank receipts or spend.
- **Assumption:** stage weights, collection rate, stale days, cash goal (the `settings` table).

## 5. Clarifications to SPEC.md (binding)

1. **Simulation date:** stored in `settings.simulation_date`. The header picker writes it, so it is persistent and shared. Every page and every copilot tool defaults to it. Writes are stamped from it (SPEC §2.4).
2. **Test isolation:** tests that reset data must never run against the demo database. Use a Neon branch named `test`, with its connection string in `DATABASE_URL_TEST`. The test runner refuses to start if `DATABASE_URL_TEST` equals `DATABASE_URL`.
3. **Connections:** the app uses Neon's pooled connection string (host contains `-pooler`). Migrations and reset use the direct string (`DATABASE_URL_UNPOOLED`).
4. **Engine approach:** the dataset is tiny (under 2,500 rows). Load the `v_*` views into memory once per request and compute every metric in pure TypeScript functions: `computeSnapshot(data, asOf, opts)`. Pages, copilot tools and tests all call the same functions. Do not write separate SQL for the same metric in two places.
5. **Owner and industry breakdowns:** owner = `owner_name` of the opportunity's latest version. Industry = the brand's industry.
6. **Per campaign cash:** payments of opportunities whose originating campaign is that campaign.
7. **Latest version tie break:** max `effective_at`, then the lexicographically greatest `history_id`. The source has no same timestamp ties. The stamp rule keeps app versions strictly later.
8. **Rounding:** all reference values are integers. Use `Math.round` only at the end.
9. **Copilot history:** keep the full Anthropic `messages` array on the client, including assistant `tool_use` and `thinking` blocks and the user `tool_result` blocks, and send it back every turn unchanged so follow ups have context.
10. **API limits and cost:** the owner pays for Anthropic API usage. Expect occasional 429 or 529; retry with backoff. The eval script runs questions one at a time. Keep `max_tokens` reasonable and use prompt caching on the system prompt and tools.

## 6. Common failure modes to avoid

1. **Timezone drift.** `new Date('2025-04-20')` is UTC midnight. Build as of instants explicitly in IST (+05:30).
2. **CSV parsing.** Keep IDs as text. Empty strings become null. `True`/`False` become booleans. Integers stay integers.
3. **Counting rows instead of entities.** Repeated outreach is not a new brand. A new status version is not a new opportunity.
4. **Leaking the future.** Never use final outcomes when computing an earlier snapshot.
5. **Copilot doing mental math or answering from priors.** Every number must come from a tool. Derived numbers must go through `calculate`.
6. **Saying an action happened before the user confirmed it.**
7. **Editing expected test values.**
8. **Adding features not in SPEC** (auth, notifications, extra charts). Ask instead.
