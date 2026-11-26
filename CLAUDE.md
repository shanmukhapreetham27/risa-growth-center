# Project rules for Claude Code

RISA Growth APM assignment, Challenge B (Sponsorship Growth).
Read in this order before any task: `docs/CONTEXT.md` (why, who reviews, binding clarifications), `SPEC.md` (what to build), `docs/REPORTING.md` (how to report). Build exactly what SPEC.md says. Do not add features that are not in it; ask instead.

Hard rules
1. Never modify `data/`, `reference_metrics.json`, `copilot_eval_questions.json`, `scripts_reference/` or `docs/assignment_brief.pdf`. They are ground truth.
2. The metric engine is correct only when `npm test` and `npm run verify` agree with `reference_metrics.json`. Never change an expected value to make a test pass; fix the code.
3. Tests that reset data run only against `DATABASE_URL_TEST` (a Neon branch), never the demo DB. The test setup must abort if the two URLs are equal.
4. All business logic runs in Asia/Kolkata. As of date D means end of day D IST.
5. Versioned history tables are append only (SPEC §2.4). Every app write goes to `audit_log`.
6. The copilot gets numbers only from tools, does arithmetic only via `calculate`, and never writes without a confirmed proposal.
7. Label every simulated or assumption based number in the UI and in copilot answers.
8. Secrets live in `.env.local` (never committed). Keep `.env.example` current.
9. Log every deviation or judgement call in `docs/DECISIONS.md` (date, spec ref, decision, reason).
10. Messages starting with `REVIEWER NOTE` are authoritative. `SPEC CHANGE` means: update SPEC.md, implement, log in DECISIONS.md.
11. End every phase or fix with the report from `docs/REPORTING.md`, commit, tag `phase-<n>`, print the report, then stop and wait.
