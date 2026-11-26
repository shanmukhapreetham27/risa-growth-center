-- 001_schema.sql: raw tables (one per CSV, same names and columns) plus app tables.
-- SPEC §2.2. Every raw table has `source` ('source' | 'simulated' | 'app') and `ingest_row`
-- (1-based row order in the CSV file; null for app rows). Raw tables keep duplicate import rows.

-- ---------- source CSVs (data/source_csv) ----------
create table event (
  event_name text, history_start timestamptz, history_end timestamptz,
  event_starts_at timestamptz not null, event_ends_at timestamptz not null,
  timezone text, currency text, fictional boolean,
  source text not null default 'source', ingest_row int
);

create table targets (
  effective_at timestamptz not null,
  qualified_brands_goal int not null, confirmed_partnerships_goal int not null,
  target_version text not null,
  source text not null default 'source', ingest_row int
);

create table brands (
  brand_name text not null, industry text, owner_name text,
  created_at timestamptz not null, brand_id text primary key, owner_id text,
  source text not null default 'source', ingest_row int
);

create table contacts (
  contact_name text not null, job_title text, brand_name text,
  created_at timestamptz not null, contact_id text primary key, brand_id text not null references brands(brand_id),
  source text not null default 'source', ingest_row int
);

create table sponsor_campaigns (
  campaign_name text not null, channel text, objective text, audience text, owner_name text,
  planned_start_at timestamptz, planned_end_at timestamptz, created_at timestamptz not null,
  sponsor_campaign_id text primary key, owner_id text,
  source text not null default 'source', ingest_row int,
  status text not null default 'active' check (status in ('active', 'paused', 'stopped'))
);

-- Raw import has duplicate rows (same interaction_id), so no primary key; v_interactions dedupes.
create table sponsor_interactions (
  brand_name text, contact_name text, campaign_name text, channel text,
  event_type text not null, outcome text, summary text, occurred_at timestamptz not null,
  interaction_id text not null, attempt_id text, origin_interaction_id text,
  brand_id text not null, contact_id text, sponsor_campaign_id text, owner_id text,
  source text not null default 'source', ingest_row int
);
create index sponsor_interactions_id on sponsor_interactions (interaction_id, ingest_row);

create table brand_qualification_history (
  brand_name text, qualification_status text not null
    check (qualification_status in ('unreviewed', 'engaged', 'qualified', 'unqualified', 'dormant')),
  reason text, source_campaign_name text, effective_at timestamptz not null,
  history_id text not null, brand_id text not null, sponsor_campaign_id text,
  source text not null default 'source', ingest_row int
);
create index brand_qualification_history_id on brand_qualification_history (history_id, ingest_row);

create table opportunities (
  opportunity_name text not null, brand_name text, primary_contact_name text, originating_campaign_name text,
  support_type text not null check (support_type in ('cash', 'in_kind')),
  created_at timestamptz not null, opportunity_id text primary key, brand_id text not null references brands(brand_id),
  primary_contact_id text, sponsor_campaign_id text references sponsor_campaigns(sponsor_campaign_id),
  source text not null default 'source', ingest_row int
);

create table opportunity_history (
  opportunity_name text, brand_name text,
  stage text not null check (stage in ('prospecting', 'contacted', 'proposal_sent', 'negotiating', 'partner_confirmed', 'lost', 'withdrawn')),
  proposed_value_inr int not null check (proposed_value_inr >= 0),
  confirmed_value_inr int not null check (confirmed_value_inr >= 0),
  owner_name text, effective_at timestamptz not null, history_id text not null,
  opportunity_id text not null references opportunities(opportunity_id), brand_id text, owner_id text,
  source text not null default 'source', ingest_row int
);
create index opportunity_history_id on opportunity_history (history_id, ingest_row);
create index opportunity_history_opp on opportunity_history (opportunity_id, effective_at);

create table sponsor_activations (
  brand_name text, opportunity_name text, attendee_campaign_name text, activation_note text,
  linked_at timestamptz, activation_id text primary key, brand_id text, opportunity_id text, attendee_campaign_id text,
  source text not null default 'source', ingest_row int
);

-- Documentation sheets: loaded for completeness (D8), no v_ view; data_dictionary() serves field_guide.
create table read_me (topic text, description text, source text not null default 'source', ingest_row int);
create table field_guide (
  source_table text, field text, data_type text, meaning text,
  source text not null default 'source', ingest_row int
);

-- ---------- simulated CSVs (data/simulated, source = 'simulated') ----------
create table payment_installments (
  installment_id text primary key, opportunity_id text not null references opportunities(opportunity_id),
  opportunity_name text, brand_id text, brand_name text,
  installment text not null check (installment in ('advance', 'balance', 'top_up')),
  amount_due_inr int not null check (amount_due_inr >= 0), due_at timestamptz not null,
  paid_at timestamptz, amount_paid_inr int not null default 0 check (amount_paid_inr >= 0),
  source text not null default 'simulated', ingest_row int,
  voided_at timestamptz  -- SPEC §2.4 (D4): null = live
);

create table campaign_budgets (
  sponsor_campaign_id text primary key references sponsor_campaigns(sponsor_campaign_id),
  campaign_name text, planned_budget_inr int not null check (planned_budget_inr >= 0), budget_note text,
  source text not null default 'simulated', ingest_row int
);

create table campaign_spend (
  spend_id text primary key, sponsor_campaign_id text not null references sponsor_campaigns(sponsor_campaign_id),
  campaign_name text, spent_at timestamptz not null, amount_inr int not null check (amount_inr >= 0), note text,
  source text not null default 'simulated', ingest_row int
);

-- ---------- app tables ----------
create table settings (
  id int primary key default 1 check (id = 1),
  simulation_date date not null default '2025-04-20',
  stale_days int not null default 7 check (stale_days > 0),
  stage_weights jsonb not null default '{"prospecting":0.10,"contacted":0.20,"proposal_sent":0.40,"negotiating":0.60}',
  collection_rate numeric not null default 0.90 check (collection_rate >= 0 and collection_rate <= 1),
  cash_goal_inr int not null default 2446000 check (cash_goal_inr >= 0)
);
insert into settings (id) values (1);

create table tasks (
  task_id text primary key, title text not null, sponsor_campaign_id text, opportunity_ids text[] not null default '{}',
  brand_id text, owner_id text, owner_name text, due_date date,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  notes text, created_at timestamptz not null default now(),
  created_by text not null check (created_by in ('seed', 'user', 'copilot')),
  source text not null default 'app'
);

create table chat_proposals (
  proposal_id text primary key, action_type text not null, payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(), resolved_at timestamptz, result jsonb
);

create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null check (actor in ('user', 'copilot')),
  action text not null, table_name text not null, record_id text,
  before jsonb, after jsonb
);

-- ---------- append only guard for versioned history (SPEC §2.4, CLAUDE.md rule 5) ----------
create function forbid_history_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'table % is append only (SPEC §2.4): % is not allowed', tg_table_name, tg_op
    using errcode = 'P0001';
end $$;

create trigger opportunity_history_append_only before update or delete on opportunity_history
  for each row execute function forbid_history_mutation();
create trigger brand_qualification_history_append_only before update or delete on brand_qualification_history
  for each row execute function forbid_history_mutation();
create trigger sponsor_interactions_append_only before update or delete on sponsor_interactions
  for each row execute function forbid_history_mutation();
create trigger targets_append_only before update or delete on targets
  for each row execute function forbid_history_mutation();
