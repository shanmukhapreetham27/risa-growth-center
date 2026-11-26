# FIX REPORT 01
STATUS: COMPLETE
COMMIT: e162ca8 on main (tag `phase-0`). This report is committed on top of it.
| Directive | Change made | Verified by | Result |
|---|---|---|---|
| D1 | Project at `Projects/risa-growth-center` in the owner's home folder. `git init -b main`. Commits: `9227f8f` Ground truth pack, `9c54f8c` Phase 0 report, `b1373c1` env template, `e162ca8` SPEC CHANGE (tag `phase-0`) | `diff -r` of a fresh zip extraction against commit 1: identical; `git ls-files` = 32 = the zip's 32 files | PASS |
| D2 | Neon project `risa-growth-center` (aws-ap-southeast-1, Postgres 18), branch `test` from `main`, read only login role `risa_readonly` usable on both branches. `.env.local` has all 7 keys (ANTHROPIC_API_KEY empty for the owner). `.env.example` updated. Unrelated Neon project not touched | SELECT 1 on all 5 database URLs: 5/5 OK (the note said four; there are five, so all were checked). Write probe as `risa_readonly`: blocked (SQLSTATE 25006) on both branches. `git check-ignore`: `.env.local` ignored. See Appendix A | PASS |
| D3 | SPEC §2.2: `tasks.opportunity_ids text[]`; seed `opportunity_id` → one element array (blank → empty array) | `git diff`: each replacement asserted to match exactly once | PASS |
| D4 | SPEC §2.1 (terms incl. value ÷ 2 rounded down), §2.2 (`voided_at`), §2.4 (create on cash confirm, void on lost/withdrawn, rescale on value change, outstanding unchanged), §3 overdue, §4.5 statuses + "paid on a withdrawn deal", §7 writes tests (d) and (e) | same | PASS |
| D5 | SPEC §2.4: full amount; user-picked date (default simulation date), ≤ simulation date and ≥ first confirmation date; `paid_at` = date 15:00 IST; stamp rule exempts payments. §4.5 date picker; §7 writes test (f) | same | PASS |
| D6 | SPEC §2.4, §4.4 (brand section with qualification change; brand + contact inside create opportunity), §4.7 (targets form; label default "App plan <n>") | same | PASS |
| D7 | SPEC §1 env list, §6.2 `query_data`, §7 tools test; CONTEXT §5.2 (TEST is the direct string; READONLY_TEST added) | same + Appendix A | PASS |
| D8 | SPEC §2.2: all 12 CSVs loaded, `v_event` added, no views for `read_me`/`field_guide`; §6.2 `data_dictionary()` serves field guide rows | same | PASS |
| D9 | SPEC §4 (one tie break for every ranked list), §4.4 pipeline sort, §6.2 `list_opportunities` says which items tie, §6.3 rule 6 (always state ties, name the rule) | same | PASS |
| Defaults | One DECISIONS.md row: Q6, Q8, Q10-Q19 (Q17 option A), Q23, Q25, Q26 and assumptions 1-19, as written in reports/phase-0.md | `docs/DECISIONS.md` | PASS |
| D10 | `copilot_eval_questions.json`: only the `expect` text of Q04, Q09, Q11 replaced with the reviewer's wording | `git diff`: exactly 3 lines changed, all `expect`; file reparses (14 questions); `data/`, `reference_metrics.json`, `scripts_reference/`, brief unchanged since commit 1 (`git diff --stat` empty) | PASS |
| D11 | CONTEXT §3 findings 2-3 contain the given text verbatim. I kept the channel lists, the 33-opportunity count and the stale facts from the old finding 3, since the note did not dispute them. The "never" rule was added to CONTEXT and to SPEC §6.3 rule 2 so Phase 3 builds it | `git diff docs/CONTEXT.md SPEC.md` | PASS |
| D12 | REPORTING §2 heading (250 lines, Appendix), Appendix block in the template, §6 bullet for all reports | `git diff docs/REPORTING.md` | PASS |

Every D-row also has one line in `docs/DECISIONS.md` (13 new rows).

Verify output: not available yet; `scripts/verify.ts` is built in Phase 1. The database checks that replace it for now are in Appendix A.

New questions (all NON-BLOCKING; the default applies if there is no answer):
N1 D4 rescale when payments already exceed the new confirmed value. Default: unpaid installments become 0 and the deal is flagged "paid exceeds confirmed value".
N2 D4 re-confirming a lost or withdrawn deal. Default: create new installments for (confirmed value − already paid) on §2.1 terms from the new confirmation; voided rows stay voided.
N3 D4 + D5 recording a payment on a voided installment (for example, dated before the void). Default: not allowed; the deal must be re-confirmed first.
N4 §4.5 "due" and "upcoming" are undefined. Default: overdue = `due_at` ≤ D and unpaid; due = `due_at` within the 7 days after D; upcoming = later; paid and voided are their own statuses.
N5 D5 "on or after the first confirmation" is a date rule, so a payment on the confirmation day gets 15:00 IST even if the confirmation was stamped later that day. Default: allow it, as written.

## Appendix
### A. Database checks (scratch script with postgres.js 3.4.7, values never printed)
```
DATABASE_URL                present
DATABASE_URL_UNPOOLED       present
DATABASE_URL_READONLY       present
DATABASE_URL_TEST           present
DATABASE_URL_READONLY_TEST  present
ANTHROPIC_API_KEY           EMPTY   (owner to fill; needed from Phase 3)
ANTHROPIC_MODEL             present (claude-sonnet-5-5)

DATABASE_URL                SELECT 1 = 1 OK  endpoint=ep-gentle-river-bibkvct8 pooled role=neondb_owner  read_only=off
DATABASE_URL_UNPOOLED       SELECT 1 = 1 OK  endpoint=ep-gentle-river-bibkvct8 direct role=neondb_owner  read_only=off
DATABASE_URL_READONLY       SELECT 1 = 1 OK  endpoint=ep-gentle-river-bibkvct8 pooled role=risa_readonly read_only=on statement_timeout=3s write blocked (25006)
DATABASE_URL_TEST           SELECT 1 = 1 OK  endpoint=ep-bitter-sea-bis8rxm7   direct role=neondb_owner  read_only=off
DATABASE_URL_READONLY_TEST  SELECT 1 = 1 OK  endpoint=ep-bitter-sea-bis8rxm7   direct role=risa_readonly read_only=on statement_timeout=3s write blocked (25006)

guard: main endpoint ep-gentle-river-bibkvct8 vs test endpoint ep-bitter-sea-bis8rxm7 -> different (ok)
```
Role check on `main`: `rolsuper=false, rolcreatedb=false, rolcreaterole=false, rolcanlogin=true`, not a member of `neon_superuser`. It was created with SQL before branching, so `test` inherited it and the same login works there.

### B. Notes for Phase 1
1. First connections took 1.5-3.8 s from this machine because the compute starts cold (scale to zero). Free plan defaults: compute 0.25 CU, branch size limit 1 GiB.
2. Neon's strings include `channel_binding=require`; postgres.js connects with the string unchanged (checked), so no stripping is needed.
3. `risa_readonly` has no grants yet. Phase 1 migrations grant SELECT on `v_*` and `REVOKE TEMP ON DATABASE ... FROM PUBLIC` is worth adding then (logged when done).
4. The test guard will compare Neon endpoint ids (pooled and direct strings of one branch differ), which is stricter than string equality and still meets CONTEXT §5.2.
5. Git author for this repo is set repo-local to the owner's name and email; check it before pushing to a public remote.

### C. Tree (new or changed since commit 1)
```
risa-growth-center/
├── .env.example                 changed (5 DB URLs, comments)
├── .env.local                 + git-ignored, not committed
├── SPEC.md                      changed (D3-D9, D11 rule 2)
├── copilot_eval_questions.json  changed (D10, 3 expect fields)
├── docs/CONTEXT.md              changed (D7, D11)
├── docs/DECISIONS.md            changed (+13 rows)
├── docs/REPORTING.md            changed (D12)
└── reports/
    ├── phase-0.md             +
    └── fix-01.md              +
```
