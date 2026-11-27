# RISA Growth Center (Challenge B, Sponsorship Growth)

Author: Shanmukha Preetham Bukka.

## 1. What it is

A working command center for the sponsorship team of a college festival: an analytics dashboard, a campaign, pipeline, collections and task manager, and an embedded AI copilot, all on one live Postgres database. It replays the CampusFest 2025 sponsor dataset (15 Jan to 20 Apr 2025) as last year's baseline for a new Bengaluru edition, whose goal is to maximise sponsorship cash collected before the festival.

Every number is tagged **Sourced** (the provided dataset or edits made in the app), **Simulated** (payments, budgets, spend, seed tasks: the source has none) or **Assumption** (stage weights, collection rate, stale days, cash goal, set in Settings).

## 2. Live link

{{LIVE_URL}}

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

{{EVAL_SUMMARY}}

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

## 14. Decision log

Every deviation and judgement call, with date, spec reference and reason: [docs/DECISIONS.md](docs/DECISIONS.md). Phase reports: `reports/`.

## 15. Strategy, research and calculations

{{STRATEGY_NOTES}}
