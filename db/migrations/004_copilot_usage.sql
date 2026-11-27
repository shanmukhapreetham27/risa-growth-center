-- 004_copilot_usage.sql: global cost guard for the copilot (REVIEWER NOTE 06 P1).
-- One row per calendar day in IST with the number of /api/chat requests that day; the route allows at
-- most 300 per day. It is a usage counter, not app data: "Reset to original data" keeps this table
-- (lib/db/reset.ts skips it when dropping), so a reset cannot be used to lift the cap.

create table if not exists copilot_usage (
  day date primary key,
  requests int not null default 0 check (requests >= 0)
);
