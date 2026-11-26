# RISA Growth Center: Build Spec (Challenge B, Sponsorship Growth)

Read this whole file before writing code. Build exactly what is here, nothing extra.
The assignment brief is `docs/assignment_brief.pdf`. This spec maps every brief requirement to a feature.

## 0. Scope (brief requirement → feature)

| Brief item | Feature in this spec |
|---|---|
| 1. Measure performance | Overview page: funnel, targets vs actuals, campaign KPIs, conversion rates, budgets, projected outcomes (§4.1) |
| 2. Diagnose performance | Diagnose page: campaign comparison, bottlenecks, stale deals, week over week change (§4.2) |
| 3. Support decisions | Scale / Change / Stop / Watch badge per campaign from explicit rules (§5) |
| 4. Manage execution | Campaigns, Pipeline, Collections, Tasks pages with persistent edits that flow into analytics (§4.3 to §4.6) |
| 5. AI copilot | Claude (Anthropic Messages API) tool use over live DB, confirm before write, honest about gaps (§6) |
| Persistent changes, reliable updates | Postgres, append only history for versioned entities, audit log, reset to original (§2, §3) |
| Original data kept for testing | `data/source_csv` is never mutated; Settings has "Reset to original data" (§2) |

Out of scope: auth, multi tenancy, email sending, real payment integration, mobile app, anything not listed.

## 1. Stack

- Next.js (App Router) + TypeScript, Tailwind, shadcn/ui, Recharts.
- Postgres on Neon (free plan; compute scales to zero and resumes automatically, which avoids Supabase free tier pausing).
- SQL migrations in `db/migrations`. Use `postgres` (postgres.js) or `@neondatabase/serverless`. Drizzle is optional.
- LLM: Anthropic Messages API via the official TypeScript SDK `@anthropic-ai/sdk`, using tool use. Model id from env `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`. Before coding the copilot, read the current docs for tool use and for this model (https://platform.claude.com/docs/en/models/sonnet-5-5/overview and its "What's new" and migration pages) and follow them. Known points to respect: setting `temperature`, `top_p` or `top_k` to non default values returns an error; forced tool use (`tool_choice` forcing a specific tool) returns an error, so leave tool choice on auto; adaptive thinking is on, so pass every assistant content block (including thinking blocks) back unchanged in the next request. Record the model id and the date the docs were checked in DECISIONS.md and the README.
- The API key is server side only (`/api/chat` route). Never send it to the browser.
- Tests: Vitest. Deploy: Vercel (Hobby).
- Env vars: `DATABASE_URL` (Neon pooled, demo DB), `DATABASE_URL_UNPOOLED` (direct, for migrations and reset), `DATABASE_URL_READONLY` (read only role, see §6.2), `DATABASE_URL_TEST` (Neon branch `test`, used only by tests), `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`.
- Binding clarifications are in `docs/CONTEXT.md` §5. Reporting rules are in `docs/REPORTING.md`.
- Money: integers in INR. Display with Indian grouping: ₹7,25,000 and ₹22.4L for compact cards.
- Time: all business logic in Asia/Kolkata (IST). Source timestamps are ISO with +05:30. Store as `timestamptz`.

## 2. Data

### 2.1 Files

- `data/source_csv/*.csv`: exact export of the provided `Sponsor Dataset.xlsx`, one CSV per sheet, raw, including the duplicate import rows. Do not edit these files.
- `data/simulated/*.csv`: data the source does not contain, generated with a fixed seed by `scripts_reference/reference_engine.py`, every row tagged `source='simulated'`:
  - `payment_installments.csv`: two installments (50% advance, 50% balance) per confirmed cash deal. Terms: advance due 7 days after confirmation, balance due 22 Mar 2025 18:00 IST or 7 days after confirmation if later.
  - `campaign_budgets.csv`, `campaign_spend.csv`: planned budget and monthly posted spend per sponsor campaign.
  - `tasks.csv`: six seed tasks.
- `reference_metrics.json`: ground truth numbers your metric engine must reproduce exactly (§7).
- `copilot_eval_questions.json`: 14 copilot test questions with expected answers.

### 2.2 Schema

Load every source CSV into a table with the same name and columns, plus `source text default 'source'` and `ingest_row int` (row order in file). Keep duplicates in the raw tables.

Create dedupe views (the only objects the app and copilot read from):

- `v_interactions`: distinct on `interaction_id` from `sponsor_interactions`.
- `v_qualification_history`: distinct on `history_id` from `brand_qualification_history`.
- `v_opportunity_history`: distinct on `history_id` from `opportunity_history`.
- Plain views over the rest: `v_brands`, `v_contacts`, `v_campaigns`, `v_opportunities`, `v_targets`, `v_activations`, `v_payments`, `v_budgets`, `v_spend`, `v_tasks`.

App tables (new):

- `settings` (single row): `simulation_date date default '2025-04-20'`, `stale_days int default 7`, `stage_weights jsonb default {"prospecting":0.10,"contacted":0.20,"proposal_sent":0.40,"negotiating":0.60}`, `collection_rate numeric default 0.90`, `cash_goal_inr int default 2446000` (team goal = strategy base case, label it "team assumption").
- `tasks`: `task_id, title, sponsor_campaign_id, opportunity_id, brand_id, owner_id, owner_name, due_date, status (open|in_progress|done|cancelled), notes, created_at, created_by (seed|user|copilot), source`.
- `sponsor_campaigns` gets extra columns: `status (active|paused|stopped) default 'active'`. Budget lives in `campaign_budgets`.
- `chat_proposals`: `proposal_id, action_type, payload jsonb, status (pending|confirmed|rejected), created_at, resolved_at, result jsonb`.
- `audit_log`: `id, at, actor (user|copilot), action, table_name, record_id, before jsonb, after jsonb`.

Team dictionary (owners): T01 Riya Kapoor, T02 Kabir Shah, T03 Meera Iyer, T05 Nisha Rao. Build it from distinct owner columns in the data; do not invent new people.

### 2.3 Seeding and reset

- `npm run db:reset` drops all tables, runs migrations, loads source + simulated CSVs.
- Settings page button "Reset to original data" runs the same reset (with a confirm dialog). After reset, tests in §7 must pass against the live DB.

### 2.4 Write semantics (this is how changed data stays correct)

Versioned entities are append only. Never update or delete a source history row.

- Change opportunity stage or value → insert a new row into `opportunity_history` with `history_id = 'APP-OH-<n>'`, all fields of the latest version carried over plus the change, `source='app'`.
- Change brand qualification → new row in `brand_qualification_history` (`APP-BQ-<n>`).
- Log an interaction → new row in `sponsor_interactions` (`APP-SI-<n>`).
- New brand / contact / opportunity → new rows with `APP-` prefixed ids.
- Change targets → new row in `targets` (new `target_version`).
- Record a payment → update `paid_at` and `amount_paid_inr` on the installment row (payments are events with their own timestamp, so snapshots stay correct).
- Campaign fields, budgets, spend, tasks → normal insert/update.

Stamp rule for every app write that needs an event time:
`effective_at = max(simulation_date at the current IST wall clock time, latest existing version of that entity + 1 second, entity created_at)`.
Every write also goes to `audit_log`.

## 3. Metric definitions (exact; must match `reference_metrics.json`)

As of date D means end of day D in IST (`D 23:59:59.999999 +05:30`). An entity or event counts only if its timestamp is ≤ that instant. Use the dedupe views. Latest version = max `effective_at`, tie broken by `history_id`.

| Metric | Definition |
|---|---|
| prospects_brands | brands with `created_at` ≤ D |
| contacted_brands | distinct brands with an interaction of type `outreach_sent`, `introduction_received` or `web_inbound` ≤ D |
| responded_brands | distinct brands with an interaction of type `replied` (any outcome) ≤ D |
| positive_reply_brands | distinct brands with `replied` and outcome `positive` ≤ D |
| conversation_brands | distinct brands with `meeting_held` ≤ D (this is "conversations" in the funnel) |
| qualified_brands | brands whose latest qualification version ≤ D has status `qualified` |
| opportunities_created | opportunities with `created_at` ≤ D |
| proposals | opportunities with any version ≤ D in stage `proposal_sent`, `negotiating` or `partner_confirmed` |
| confirmed_partnerships | opportunities whose latest version ≤ D has stage `partner_confirmed` |
| confirmed_value_cash / in_kind / total | sum of `confirmed_value_inr` of confirmed opportunities, split by `support_type` |
| lost_or_withdrawn | latest stage `lost` or `withdrawn` |
| open_opportunities, open_pipeline_proposed_inr | latest stage in prospecting, contacted, proposal_sent, negotiating; sum of latest `proposed_value_inr` |
| stale_open_opportunities_7d | open opportunities whose latest version is older than `stale_days` × 24h before the as of instant |
| weighted_open_pipeline_inr | Σ open proposed value × `stage_weights[stage]` (assumption) |
| cash_collected_inr_simulated | Σ `amount_paid_inr` with `paid_at` ≤ D |
| cash_collected_before_festival | same, with `paid_at` < festival start (12 Apr 2025 10:00 IST) |
| outstanding_confirmed_cash | confirmed cash value − cash collected |
| overdue installments / amount | installments with `due_at` ≤ D and not paid by D |
| projected_cash_before_festival_inr | if D ≥ festival start: cash collected before festival. Else: collected + (confirmed cash − collected) × collection_rate + Σ(open cash opportunities × stage weight) × collection_rate |
| targets in force | latest `targets` row with `effective_at` ≤ D (launch plan 40/20, revised plan from 15 Mar 2025: 55/28) |

Per campaign: filter interactions by `sponsor_campaign_id` and opportunities by their originating `sponsor_campaign_id`. Per campaign "prospects" = distinct brands touched by that campaign's interactions. Per campaign qualified = brands touched by that campaign whose latest qualification is qualified.

Known traps the engine must handle (tests cover them): duplicate import rows; Cobalt Learning (O006) confirmed 25 Feb then withdrawn 20 Mar (counts on 10 Mar, not on 20 Apr); Beardo has two opportunities (count partnerships by opportunity, report brands separately); in kind value is not cash; target change on 15 Mar.

Daily series (for trend charts): compute the snapshot for every day from 15 Jan 2025 to the simulation date. Cache per request is fine.

## 4. Pages

Global header on every page: simulation date picker (default 2025-04-20, range 15 Jan to 20 Apr 2025, label "Simulation date"), days to festival, and a small legend: Sourced / Simulated / Assumption. Every number that depends on simulated data or an assumption gets that tag.

### 4.1 Overview (Measure)
- KPI cards: confirmed partnerships vs goal; qualified brands vs goal; confirmed cash value (+ in kind shown separately); cash collected (simulated) vs team cash goal; open pipeline and weighted pipeline; projected cash before festival.
- Funnel: prospects → contacted → responded → conversations → proposals → confirmed → cash collected, with stage to stage conversion %.
- Trend chart: confirmed partnerships and qualified brands per day with the goal as a step line (changes on 15 Mar).
- Campaign table: brands touched, conversations, opportunities, confirmed, cash confirmed, win rate, meeting rate, stale open, budget, spend, cash per ₹ spent, decision badge (§5).

### 4.2 Diagnose
- Stage conversion by campaign and by channel group (warm = SC02, SC04, SC05; cold = SC01, SC03, SC06), largest drop highlighted as the bottleneck.
- Stale deals list (open, no update in > stale_days) sorted by value.
- Median days in stage by channel group.
- Breakdown by owner and by industry.
- "What changed": key metrics at D vs D − 7 days.

### 4.3 Campaigns (Manage)
List, create, edit (name, channel, objective, audience, owner, planned dates, status, planned budget), add spend entries. Show decision badge and the rule that fired.

### 4.4 Pipeline
Opportunity table at the simulation date (stage, values, owner, campaign, last update, stale flag) with filters. Row drawer: full version history; actions: change stage, change values, log interaction, create opportunity.

### 4.5 Collections
Installments with status (paid, due, overdue, upcoming) at the simulation date; record payment.

### 4.6 Tasks
CRUD with owner, due date, status, links to campaign, opportunity, brand; overdue relative to simulation date; `created_by` shown (copilot created tasks are visibly marked).

### 4.7 Settings / Data
Simulation date, assumptions (stage weights, collection rate, stale days, cash goal), Reset to original data, data dictionary, and a "What this data cannot tell you" list (§6.4).

Copilot: a right side panel available on every page, plus a full page view.

## 5. Decision rules (per campaign, at the simulation date)

meeting_rate = conversation_brands / contacted_brands; closed = confirmed + lost_or_withdrawn; win_rate = confirmed / closed.

1. WATCH if opportunities_created < 5 and closed < 3 (not enough evidence)
2. SCALE if closed ≥ 3 and win_rate ≥ 0.5 and meeting_rate ≥ 0.4
3. STOP if confirmed = 0 and opportunities_created ≥ 8 and meeting_rate < 0.25
4. CHANGE otherwise, with the reason (stale share ≥ 40%, win rate < 50%, meeting rate < 40%)

Expected on 20 Apr and 15 Mar 2025: SC01 STOP, SC02 SCALE, SC03 CHANGE, SC04 SCALE, SC05 SCALE, SC06 CHANGE.

## 6. Copilot

### 6.1 Architecture
`/api/chat` route. Client sends the full message history each turn (follow ups must work). Server runs the Messages API tool use loop: call the model with the system prompt, the tool definitions and the history; while `stop_reason` is `tool_use`, execute every `tool_use` block, append one user turn containing the matching `tool_result` blocks (by `tool_use_id`), and call again (max 6 rounds). Then return the final text plus a list of the tool calls made (shown collapsed under each answer as "Data used"). Set a sensible `max_tokens`. Retry with backoff on 429 and 529 and show a clear message if it still fails. Mark the system prompt and tool definitions with prompt caching (`cache_control`) to cut cost. Cost guard: limit `/api/chat` to 30 requests per hour per IP (in memory is fine) and log token usage per request to the server console.

### 6.2 Tools (all reads take optional `as_of`, default = simulation date)
- `get_overview(as_of)`: all §3 metrics + targets.
- `get_funnel(as_of, group_by?: campaign|channel_group|owner|industry, campaign_id?)`
- `compare_snapshots(date_a, date_b)`
- `list_opportunities(as_of, stage?, campaign_id?, owner_id?, stale_only?, min_value?, sort?, limit?)`
- `get_opportunity_history(opportunity_id | name)`
- `get_campaign_decisions(as_of)`: badges + metrics + rule fired
- `get_collections(as_of, status?: paid|due|overdue|upcoming|all)`
- `get_budgets(as_of)`
- `list_tasks(status?, owner_id?, overdue_only?)`
- `query_data(sql)`: read only SELECT against `v_*` views only, through `DATABASE_URL_READONLY` (a Postgres role with SELECT on views only), `statement_timeout` 3s, auto `LIMIT 200`, reject anything that is not a single SELECT. For long tail questions the fixed tools do not cover.
- `calculate(expression)`: safe math (mathjs). Every number the model derives must go through this.
- `data_dictionary()`: tables, fields, which are sourced / simulated / assumption, and the gaps list (§6.4).
- `propose_task(title, owner_id, due_date, sponsor_campaign_id?, opportunity_ids?, brand_id?, notes?)`
- `propose_campaign_status(sponsor_campaign_id, status, reason)`

Propose tools only insert a `chat_proposals` row (status pending) and return it. The UI renders a card with Confirm, Edit, Cancel. Only Confirm (a normal user click calling `/api/proposals/:id/confirm`) performs the write, logs to `audit_log` with actor copilot, and updates the card with the created record. The copilot must never say an action is done before the confirmed result exists.

### 6.3 System prompt rules (put in `lib/copilot/system-prompt.ts`)
1. Use tools for every fact and number. Never answer data questions from general knowledge.
2. Always state the as of date used. Tag figures as sourced, simulated or assumption.
3. Do arithmetic with `calculate`, never in your head.
4. Separate "Evidence" (from tools) from "Likely explanation" (inference) when diagnosing.
5. If the data cannot answer, say so plainly, say which field or table is missing, and offer what you can do instead (for example propose a task to collect it).
6. When results tie or the request is ambiguous, say so and either ask or state the tie break rule used.
7. For actions, call a propose tool and wait for the user's confirmation.
8. Be concise. Use a small table when comparing more than three items. INR with Indian grouping.
9. Only discuss this festival's sponsorship data and plan; politely decline unrelated requests.

### 6.4 Gaps the copilot must recognise (also shown in Settings)
No bank receipts in source (payments are simulated); no spend or budget in source (simulated); no loss or withdrawal reasons; no sponsor satisfaction or ROI; activations do not prove incremental visitors; no contract terms in source; no data for a next edition or another city; no footfall per sponsor.

### 6.5 The one complete workflow to demo (brief: "Demonstrate one complete workflow")
1. Overview at 20 Apr: 24 confirmed vs 28 goal, cold campaigns badged STOP / CHANGE.
2. Ask: "Why are we behind on partnerships?" → evidence: cold channels 33 opportunities, 0 confirmed; all 26 open deals stale.
3. Follow up: "Which stuck deals are worth the most?" → ranked list, flags the ₹90,000 tie.
4. Ask: "Pause Brand Discovery Email and create a task for Riya to follow up the top negotiating deals by 25 April" → two proposal cards → user confirms both.
5. Campaigns page shows SC01 paused; Tasks page shows the new copilot task; audit log has both writes.
6. Ask: "Why did Cobalt Learning withdraw?" → says the data has no reason field, offers a task.
7. Edit an opportunity stage on Pipeline → Overview and the copilot both reflect it immediately.
Add a "Demo script" section to the README with these steps.

## 7. Tests (must pass before UI work is called done)

- `tests/metrics.test.ts`: for every date in `reference_metrics.json.snapshots`, every metric equals the reference exactly. Same for `by_campaign_final`, `by_campaign_2025-03-15`, `by_owner_final`, `by_industry_final`, `edge_cases`, decisions.
- `tests/writes.test.ts`: on a fresh reset DB with simulation date 2025-04-20, (a) changing one open opportunity to partner_confirmed raises confirmed_partnerships to 25 at 20 Apr and leaves the 10 Mar snapshot at 15; (b) recording a payment raises cash collected by that amount; (c) reset restores the reference numbers.
- `tests/tools.test.ts`: each copilot read tool returns numbers identical to the engine.
- `scripts/verify.ts` (`npm run verify`): read only check of the demo DB against the reference, exact output format in `docs/REPORTING.md` §4.
- All reset based tests run on `DATABASE_URL_TEST` only.
- `scripts/eval-copilot.ts` (`npm run eval:copilot`): runs `copilot_eval_questions.json` against the live model, saves transcripts to `eval/results/<timestamp>.md`. Not part of CI; reviewed by hand.

## 8. README (write `README.md`)
Sections: what it is; live link; demo script (§6.5); how it maps to the brief (table from §0); architecture; data sources (sourced vs simulated vs assumption); metric definitions (link to this spec); copilot design and guardrails; setup and env vars; tests and how to run the copilot eval; tools and plans used (with links) and what was reused, modified, verified; known limitations; decision log (`docs/DECISIONS.md`). Leave a section "Strategy, research and calculations" that includes `docs/STRATEGY_NOTES.md` verbatim (supplied separately).
