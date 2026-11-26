# Reporting protocol (Claude Code → reviewer)

The reviewer cannot see the repo, run code or open the app. It only sees what the owner pastes back. Every report must therefore be self contained, factual and short. Never claim something works without saying how it was verified.

## 1. When to report

- At the end of every phase (Prompt 0 to Prompt 4) and after every `REVIEWER NOTE`.
- Stop after writing the report. Do not start the next phase until the owner sends the next prompt.
- If you are blocked (missing credentials, a spec contradiction, a failing external service), stop and write a report with `STATUS: BLOCKED`.

Write the report to `reports/phase-<n>.md` (or `reports/fix-<nn>.md` for a REVIEWER NOTE), commit it, and print it in full in the terminal as your final message.

## 2. Phase report template (keep under 250 lines; long lists go in an Appendix section at the end)

```
# PHASE <n> REPORT
STATUS: COMPLETE | PARTIAL | BLOCKED
COMMIT: <short hash> on <branch>   TAG: phase-<n>

## 1. Done (map to spec)
| Spec ref | Item | Status | How verified |
|---|---|---|---|
| §3 | Metric engine | done | tests/metrics.test.ts 212/212 |

## 2. Tests
Command: npm test
Result: <passed>/<total> passed, <failed> failed, <skipped> skipped
Failures (name: expected vs actual, one line each):

## 3. Verify output
Paste the full output of `npm run verify` here (see §4).

## 4. Deviations from SPEC
| Spec ref | What I did instead | Why | Reversible? |
(write "None" if none; every deviation is also logged in docs/DECISIONS.md)

## 5. Assumptions I made where SPEC was silent
1. ...

## 6. Questions for reviewer (blocking first)
Q1 [BLOCKING | NON-BLOCKING]: <question>
   Options: A) ... B) ...
   My default if no answer: A

## 7. Known issues and risks
1. ...

## 8. Files changed (tree, new files marked +)

## 9. How the owner can see it
Commands or URL, and which page to open.

## 10. Ready for next phase?
YES / NO, and what is needed.

## Appendix (optional)
Long lists (questions, checks, trees) that would crowd the sections above.
```

## 3. Fix report template (after a REVIEWER NOTE)

```
# FIX REPORT <nn>
STATUS: COMPLETE | PARTIAL | BLOCKED
COMMIT: <hash>
| Directive | Change made | Verified by | Result |
|---|---|---|---|
| D1 | ... | test name / verify line | PASS |
Verify output: <paste npm run verify>
New questions: <or None>
```

## 4. `npm run verify` (build this in Phase 1, keep it working)

A script (`scripts/verify.ts`) that reads the database named by `DATABASE_URL` (the demo DB; read only, it must not write) and prints plain text in exactly this layout:

```
VERIFY  db=<host without credentials>  simulation_date=<date>  source_rows=<n>  app_rows=<n>  at=<ISO time>
SNAPSHOT CHECKS (engine on live DB vs reference_metrics.json)
date        metric                                   reference    actual       ok
2025-03-10  confirmed_partnerships                   15           15           OK
...one line for each of these metrics at every reference date:
    confirmed_partnerships, confirmed_value_cash_inr, qualified_brands, proposals,
    conversation_brands, open_opportunities, stale_open_opportunities_7d,
    cash_collected_inr_simulated, projected_cash_before_festival_inr,
    qualified_brands_goal, confirmed_partnerships_goal
CAMPAIGN CHECKS (2025-04-20)
SC01 confirmed=0 ref=0 OK | decision=STOP ref=STOP OK
...
EDGE CASES
cobalt_confirmed_2025_03_10 true ref=true OK
cobalt_confirmed_2025_04_20 false ref=false OK
dedupe interactions 950 ref=950 OK
SUMMARY  <ok>/<total> OK   <mismatch> MISMATCH
APP WRITES SINCE RESET: <n> (if > 0, mismatches may be expected; list the last 10 audit_log rows: at, actor, action, record_id)
```

If the demo DB contains app edits, mismatches can be legitimate. Always show the audit_log tail so the reviewer can tell the difference.

## 5. Copilot eval output (Phase 3)

`npm run eval:copilot` writes `eval/results/<timestamp>.md`. For the report, include a table:

```
| Q | Type | Verdict (PASS/FAIL/PARTIAL) | Tools called | One line reason |
```

Also paste the full answer text for every FAIL or PARTIAL and for Q03, Q04, Q07 and Q11. Judge each answer against the `expect` field. Be strict: a right number without the as of date, or a simulated figure without the label, is PARTIAL.

## 6. Writing style for reports

- Facts, numbers and file paths. No marketing language.
- Say "verified by <command or test>" or "not verified".
- If you changed your mind on something, say what and why.
- Prefer one line per item.
- Any report (phase or fix) may run to 250 lines. Put long lists in an Appendix section at the end.
