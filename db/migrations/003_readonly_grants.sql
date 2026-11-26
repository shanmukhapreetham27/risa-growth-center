-- 003_readonly_grants.sql: least privilege for the copilot's query_data tool (SPEC §2.3, §6.2).
-- The role risa_readonly exists once per Neon branch (created outside migrations, with
-- default_transaction_read_only = on and statement_timeout = 3s on the role). Every reset re-runs
-- this file, so the grants come back after the tables and views are recreated.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'risa_readonly') then
    raise exception 'role risa_readonly is missing on this branch; create it before running migrations (SPEC §2.3)';
  end if;
end $$;

-- Nothing but SELECT on the v_* views. Views run with the owner's rights, so no grant on the
-- underlying tables is needed or given.
grant select on
  v_interactions, v_qualification_history, v_opportunity_history,
  v_brands, v_contacts, v_campaigns, v_opportunities, v_targets, v_activations,
  v_payments, v_budgets, v_spend, v_tasks, v_event
to risa_readonly;

-- A read only default can be switched off by the session (SET / BEGIN READ WRITE), so also take
-- away temporary tables: PUBLIC holds TEMP on a new database by default.
do $$
begin
  execute format('revoke temporary on database %I from public', current_database());
  execute format('revoke temporary on database %I from risa_readonly', current_database());
end $$;

-- PostgreSQL 15+ already denies CREATE on schema public to PUBLIC; state it explicitly.
revoke create on schema public from public;
