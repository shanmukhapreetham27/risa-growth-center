-- 002_views.sql: the only objects the app and the copilot read (SPEC §2.2).
-- Dedupe views keep the first imported row per id (lowest ingest_row; app rows, which have no
-- ingest_row, sort last). Duplicate import rows in the source have identical payloads.

create view v_interactions as
  select distinct on (interaction_id) * from sponsor_interactions
  order by interaction_id, ingest_row nulls last;

create view v_qualification_history as
  select distinct on (history_id) * from brand_qualification_history
  order by history_id, ingest_row nulls last;

create view v_opportunity_history as
  select distinct on (history_id) * from opportunity_history
  order by history_id, ingest_row nulls last;

create view v_brands as select * from brands;
create view v_contacts as select * from contacts;
create view v_campaigns as select * from sponsor_campaigns;
create view v_opportunities as select * from opportunities;
create view v_targets as select * from targets;
create view v_activations as select * from sponsor_activations;
create view v_payments as select * from payment_installments;
create view v_budgets as select * from campaign_budgets;
create view v_spend as select * from campaign_spend;
create view v_tasks as select * from tasks;
create view v_event as select * from event;
