/**
 * The other SPEC §2.4 writes: qualification, interactions, new brand / contact / opportunity, targets,
 * campaigns, budgets, spend, tasks and settings. Versioned rows are appended with the stamp rule and
 * APP- ids; the rest are normal inserts and updates. Every write is audited.
 */
import type { Sql, Tx } from "../db/client";
import { istAt, isIsoDate, SECOND_MS } from "../engine/time";
import { INTERACTION_EVENTS, OPEN_STAGES, QUAL_STATUSES, type QualStatus, type Stage } from "../engine/types";
import { type Actor, asRow, assertInt, audit, lockWrites, ms, nextAppId, simulationDate, stamp, teamMember, WriteError } from "./common";

type Row = Record<string, unknown>;

async function one(tx: Tx, table: string, idCol: string, id: string, label: string): Promise<Row> {
  const [r] = await tx<Row[]>`select * from ${tx(table)} where ${tx(idCol)} = ${id}`;
  if (!r) throw new WriteError(`${label} ${id} does not exist`);
  return r;
}

async function campaignOrNull(tx: Tx, id: string | null | undefined): Promise<Row | null> {
  return id ? one(tx, "sponsor_campaigns", "sponsor_campaign_id", id, "Campaign") : null;
}

// ---------------------------------------------------------------- qualification
export interface QualificationChange {
  brand_id: string;
  qualification_status: QualStatus;
  reason?: string | null;
  sponsor_campaign_id?: string | null;
}

/** New brand_qualification_history row APP-BQ-<n> (drawer brand section, §4.4). */
export async function changeQualification(sql: Sql, input: QualificationChange, actor: Actor = "user", now = Date.now()) {
  if (!QUAL_STATUSES.includes(input.qualification_status)) throw new WriteError(`Unknown qualification status ${input.qualification_status}`);
  return sql.begin(async (tx) => {
    await lockWrites(tx);
    const sim = await simulationDate(tx);
    const brand = await one(tx, "brands", "brand_id", input.brand_id, "Brand");
    const [latest] = await tx<Row[]>`
      select * from v_qualification_history where brand_id = ${input.brand_id} order by effective_at desc, history_id desc limit 1`;
    if (latest && latest.qualification_status === input.qualification_status) throw new WriteError(`Brand ${input.brand_id} is already ${input.qualification_status}`);
    const camp = await campaignOrNull(tx, input.sponsor_campaign_id ?? (latest?.sponsor_campaign_id as string | null));
    const effectiveAt = stamp(sim, [latest ? ms(latest.effective_at as Date)! + SECOND_MS : null, ms(brand.created_at as Date)], now);
    const historyId = await nextAppId(tx, "brand_qualification_history", "history_id", "APP-BQ-");
    const row = {
      brand_name: brand.brand_name,
      qualification_status: input.qualification_status,
      reason: input.reason ?? null,
      source_campaign_name: camp?.campaign_name ?? null,
      effective_at: new Date(effectiveAt),
      history_id: historyId,
      brand_id: input.brand_id,
      sponsor_campaign_id: camp?.sponsor_campaign_id ?? null,
      source: "app",
    };
    await tx`insert into brand_qualification_history ${tx(asRow(row))}`;
    await audit(tx, actor, "qualification.change", "brand_qualification_history", historyId, latest ?? null, row);
    return { history_id: historyId, effective_at: effectiveAt };
  });
}

// ---------------------------------------------------------------- interactions
export interface InteractionInput {
  brand_id: string;
  event_type: (typeof INTERACTION_EVENTS)[number];
  contact_id?: string | null;
  sponsor_campaign_id?: string | null;
  channel?: string | null;
  outcome?: string | null;
  summary?: string | null;
}

/** New sponsor_interactions row APP-SI-<n>. */
export async function logInteraction(sql: Sql, input: InteractionInput, actor: Actor = "user", now = Date.now()) {
  if (!INTERACTION_EVENTS.includes(input.event_type)) throw new WriteError(`Unknown event type ${input.event_type}`);
  return sql.begin(async (tx) => {
    await lockWrites(tx);
    const sim = await simulationDate(tx);
    const brand = await one(tx, "brands", "brand_id", input.brand_id, "Brand");
    const contact = input.contact_id ? await one(tx, "contacts", "contact_id", input.contact_id, "Contact") : null;
    if (contact && contact.brand_id !== input.brand_id) throw new WriteError(`Contact ${input.contact_id} belongs to brand ${contact.brand_id}`);
    const camp = await campaignOrNull(tx, input.sponsor_campaign_id);
    const occurredAt = stamp(sim, [ms(brand.created_at as Date), contact ? ms(contact.created_at as Date) : null], now);
    const id = await nextAppId(tx, "sponsor_interactions", "interaction_id", "APP-SI-");
    const row = {
      brand_name: brand.brand_name,
      contact_name: contact?.contact_name ?? null,
      campaign_name: camp?.campaign_name ?? null,
      channel: input.channel ?? camp?.channel ?? null,
      event_type: input.event_type,
      outcome: input.outcome ?? null,
      summary: input.summary ?? null,
      occurred_at: new Date(occurredAt),
      interaction_id: id,
      attempt_id: null,
      origin_interaction_id: null,
      brand_id: input.brand_id,
      contact_id: contact?.contact_id ?? null,
      sponsor_campaign_id: camp?.sponsor_campaign_id ?? null,
      owner_id: (camp?.owner_id ?? brand.owner_id ?? null) as string | null,
      source: "app",
    };
    await tx`insert into sponsor_interactions ${tx(asRow(row))}`;
    await audit(tx, actor, "interaction.log", "sponsor_interactions", id, null, row);
    return { interaction_id: id, occurred_at: occurredAt };
  });
}

// ---------------------------------------------------------------- create opportunity (+ brand, contact)
export interface CreateOpportunityInput {
  /** Existing brand id, or a new brand created in the same form (§4.4). */
  brand: { brand_id: string } | { new: { brand_name: string; industry?: string | null; owner_id?: string | null } };
  /** Existing contact id, a new contact, or none. */
  contact?: { contact_id: string } | { new: { contact_name: string; job_title?: string | null } } | null;
  opportunity_name?: string;
  support_type: "cash" | "in_kind";
  sponsor_campaign_id: string;
  stage?: Stage;
  proposed_value_inr: number;
  owner_id: string;
}

export async function createOpportunity(sql: Sql, input: CreateOpportunityInput, actor: Actor = "user", now = Date.now()) {
  const stage = input.stage ?? "prospecting";
  if (!OPEN_STAGES.has(stage)) throw new WriteError("A new opportunity starts in an open stage; confirm it afterwards with a stage change");
  if (input.support_type !== "cash" && input.support_type !== "in_kind") throw new WriteError("support_type must be cash or in_kind");
  const proposed = assertInt("proposed_value_inr", input.proposed_value_inr);
  return sql.begin(async (tx) => {
    await lockWrites(tx);
    const sim = await simulationDate(tx);
    const owner = await teamMember(tx, input.owner_id);
    const camp = (await campaignOrNull(tx, input.sponsor_campaign_id))!;
    let createdAt = stamp(sim, [], now);
    const created: { brand_id?: string; contact_id?: string } = {};

    let brand: Row;
    if ("brand_id" in input.brand) {
      brand = await one(tx, "brands", "brand_id", input.brand.brand_id, "Brand");
      createdAt = Math.max(createdAt, ms(brand.created_at as Date)!);
    } else {
      const nb = input.brand.new;
      if (!nb.brand_name?.trim()) throw new WriteError("brand_name is required for a new brand");
      const brandOwner = nb.owner_id ? await teamMember(tx, nb.owner_id) : owner;
      const brandId = await nextAppId(tx, "brands", "brand_id", "APP-A-");
      brand = { brand_name: nb.brand_name.trim(), industry: nb.industry ?? null, owner_name: brandOwner.owner_name, created_at: new Date(createdAt), brand_id: brandId, owner_id: brandOwner.owner_id, source: "app" };
      await tx`insert into brands ${tx(asRow(brand))}`;
      await audit(tx, actor, "brand.create", "brands", brandId, null, brand);
      created.brand_id = brandId;
    }

    let contact: Row | null = null;
    if (input.contact && "contact_id" in input.contact) {
      contact = await one(tx, "contacts", "contact_id", input.contact.contact_id, "Contact");
      if (contact.brand_id !== brand.brand_id) throw new WriteError(`Contact ${contact.contact_id} belongs to brand ${contact.brand_id}`);
      createdAt = Math.max(createdAt, ms(contact.created_at as Date)!);
    } else if (input.contact && "new" in input.contact) {
      const nc = input.contact.new;
      if (!nc.contact_name?.trim()) throw new WriteError("contact_name is required for a new contact");
      const contactId = await nextAppId(tx, "contacts", "contact_id", "APP-SCON-");
      contact = { contact_name: nc.contact_name.trim(), job_title: nc.job_title ?? null, brand_name: brand.brand_name, created_at: new Date(createdAt), contact_id: contactId, brand_id: brand.brand_id, source: "app" };
      await tx`insert into contacts ${tx(asRow(contact))}`;
      await audit(tx, actor, "contact.create", "contacts", contactId, null, contact);
      created.contact_id = contactId;
    }

    const oppId = await nextAppId(tx, "opportunities", "opportunity_id", "APP-O-");
    const name = input.opportunity_name?.trim() || `${brand.brand_name} festival partnership`;
    const opp = {
      opportunity_name: name,
      brand_name: brand.brand_name,
      primary_contact_name: contact?.contact_name ?? null,
      originating_campaign_name: camp.campaign_name,
      support_type: input.support_type,
      created_at: new Date(createdAt),
      opportunity_id: oppId,
      brand_id: brand.brand_id,
      primary_contact_id: contact?.contact_id ?? null,
      sponsor_campaign_id: camp.sponsor_campaign_id,
      source: "app",
    };
    await tx`insert into opportunities ${tx(asRow(opp))}`;
    await audit(tx, actor, "opportunity.create", "opportunities", oppId, null, opp);

    const historyId = await nextAppId(tx, "opportunity_history", "history_id", "APP-OH-");
    const version = {
      opportunity_name: name,
      brand_name: brand.brand_name,
      stage,
      proposed_value_inr: proposed,
      confirmed_value_inr: 0,
      owner_name: owner.owner_name,
      effective_at: new Date(createdAt),
      history_id: historyId,
      opportunity_id: oppId,
      brand_id: brand.brand_id,
      owner_id: owner.owner_id,
      source: "app",
    };
    await tx`insert into opportunity_history ${tx(asRow(version))}`;
    await audit(tx, actor, "opportunity.change", "opportunity_history", historyId, null, version);
    return { opportunity_id: oppId, history_id: historyId, created_at: createdAt, ...created };
  });
}

// ---------------------------------------------------------------- targets
export interface TargetsInput {
  qualified_brands_goal: number;
  confirmed_partnerships_goal: number;
  target_version?: string;
}

/** New targets version (Settings form, §4.7) stamped after the latest one; label default "App plan <n>". */
export async function changeTargets(sql: Sql, input: TargetsInput, actor: Actor = "user", now = Date.now()) {
  const q = assertInt("qualified_brands_goal", input.qualified_brands_goal, 1);
  const c = assertInt("confirmed_partnerships_goal", input.confirmed_partnerships_goal, 1);
  return sql.begin(async (tx) => {
    await lockWrites(tx);
    const sim = await simulationDate(tx);
    const [latest] = await tx<Row[]>`select * from targets order by effective_at desc, ingest_row desc nulls first limit 1`;
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int + 1 as n from targets where source = 'app'`;
    const effectiveAt = stamp(sim, [latest ? ms(latest.effective_at as Date)! + SECOND_MS : null], now);
    const row = {
      effective_at: new Date(effectiveAt),
      qualified_brands_goal: q,
      confirmed_partnerships_goal: c,
      target_version: input.target_version?.trim() || `App plan ${n}`,
      source: "app",
    };
    await tx`insert into targets ${tx(asRow(row))}`;
    await audit(tx, actor, "targets.change", "targets", row.target_version, latest ?? null, row);
    return { target_version: row.target_version, effective_at: effectiveAt };
  });
}

// ---------------------------------------------------------------- campaigns, budgets, spend
const CAMPAIGN_FIELDS = ["campaign_name", "channel", "objective", "audience", "owner_id", "planned_start_at", "planned_end_at", "status"] as const;
export type CampaignFields = Partial<Record<(typeof CAMPAIGN_FIELDS)[number], string | null>>;

async function campaignValues(tx: Tx, f: CampaignFields): Promise<Row> {
  const out: Row = {};
  for (const k of CAMPAIGN_FIELDS) {
    if (f[k] === undefined) continue;
    if (k === "status" && !["active", "paused", "stopped"].includes(String(f.status))) throw new WriteError("status must be active, paused or stopped");
    if (k === "owner_id") {
      const o = await teamMember(tx, String(f.owner_id));
      out.owner_id = o.owner_id;
      out.owner_name = o.owner_name;
    } else if (k === "planned_start_at" || k === "planned_end_at") {
      const v = f[k];
      if (v !== null && !isIsoDate(v)) throw new WriteError(`${k} must be a YYYY-MM-DD date`);
      out[k] = v === null ? null : new Date(istAt(v as string, k === "planned_start_at" ? 9 : 18));
    } else out[k] = f[k];
  }
  return out;
}

export async function updateCampaign(sql: Sql, id: string, fields: CampaignFields, actor: Actor = "user") {
  return sql.begin(async (tx) => {
    await lockWrites(tx);
    const before = await one(tx, "sponsor_campaigns", "sponsor_campaign_id", id, "Campaign");
    const values = await campaignValues(tx, fields);
    if (Object.keys(values).length === 0) throw new WriteError("Nothing to change");
    const [after] = await tx<Row[]>`update sponsor_campaigns set ${tx(asRow(values))} where sponsor_campaign_id = ${id} returning *`;
    await audit(tx, actor, fields.status !== undefined && Object.keys(fields).length === 1 ? "campaign.status" : "campaign.update", "sponsor_campaigns", id, before, after);
    return after;
  });
}

export async function createCampaign(sql: Sql, fields: CampaignFields & { campaign_name: string; owner_id: string; planned_budget_inr?: number }, actor: Actor = "user", now = Date.now()) {
  if (!fields.campaign_name?.trim()) throw new WriteError("campaign_name is required");
  return sql.begin(async (tx) => {
    await lockWrites(tx);
    const sim = await simulationDate(tx);
    const id = await nextAppId(tx, "sponsor_campaigns", "sponsor_campaign_id", "APP-SC-");
    const row: Row = { ...(await campaignValues(tx, fields)), sponsor_campaign_id: id, created_at: new Date(stamp(sim, [], now)), source: "app" };
    await tx`insert into sponsor_campaigns ${tx(asRow(row))}`;
    await audit(tx, actor, "campaign.create", "sponsor_campaigns", id, null, row);
    if (fields.planned_budget_inr !== undefined) {
      const b = { sponsor_campaign_id: id, campaign_name: row.campaign_name, planned_budget_inr: assertInt("planned_budget_inr", fields.planned_budget_inr), budget_note: null, source: "app" };
      await tx`insert into campaign_budgets ${tx(asRow(b))}`;
      await audit(tx, actor, "budget.set", "campaign_budgets", id, null, b);
    }
    return { sponsor_campaign_id: id };
  });
}

export async function setCampaignBudget(sql: Sql, id: string, plannedBudgetInr: number, note: string | null = null, actor: Actor = "user") {
  const amount = assertInt("planned_budget_inr", plannedBudgetInr);
  return sql.begin(async (tx) => {
    await lockWrites(tx);
    const camp = await one(tx, "sponsor_campaigns", "sponsor_campaign_id", id, "Campaign");
    const [before] = await tx<Row[]>`select * from campaign_budgets where sponsor_campaign_id = ${id}`;
    const [after] = before
      ? await tx<Row[]>`update campaign_budgets set planned_budget_inr = ${amount}, budget_note = coalesce(${note}, budget_note) where sponsor_campaign_id = ${id} returning *`
      : await tx<Row[]>`insert into campaign_budgets (sponsor_campaign_id, campaign_name, planned_budget_inr, budget_note, source)
                       values (${id}, ${camp.campaign_name as string}, ${amount}, ${note}, 'app') returning *`;
    await audit(tx, actor, "budget.set", "campaign_budgets", id, before ?? null, after);
    return after;
  });
}

/** Posted spend entry; `spent_on` date gets 18:00 IST like the simulated monthly postings, default = stamp time. */
export async function addSpend(sql: Sql, input: { sponsor_campaign_id: string; amount_inr: number; spent_on?: string; note?: string | null }, actor: Actor = "user", now = Date.now()) {
  const amount = assertInt("amount_inr", input.amount_inr, 1);
  if (input.spent_on !== undefined && !isIsoDate(input.spent_on)) throw new WriteError("spent_on must be a YYYY-MM-DD date");
  return sql.begin(async (tx) => {
    await lockWrites(tx);
    const sim = await simulationDate(tx);
    if (input.spent_on && input.spent_on > sim) throw new WriteError(`Spend date ${input.spent_on} is after the simulation date ${sim}`);
    const camp = await one(tx, "sponsor_campaigns", "sponsor_campaign_id", input.sponsor_campaign_id, "Campaign");
    const id = await nextAppId(tx, "campaign_spend", "spend_id", "APP-SP-");
    const spentAt = input.spent_on ? istAt(input.spent_on, 18) : stamp(sim, [], now);
    const row = { spend_id: id, sponsor_campaign_id: camp.sponsor_campaign_id, campaign_name: camp.campaign_name, spent_at: new Date(spentAt), amount_inr: amount, note: input.note ?? null, source: "app" };
    await tx`insert into campaign_spend ${tx(asRow(row))}`;
    await audit(tx, actor, "spend.add", "campaign_spend", id, null, row);
    return { spend_id: id, spent_at: spentAt };
  });
}

// ---------------------------------------------------------------- tasks
export interface TaskInput {
  title: string;
  owner_id: string;
  due_date?: string | null;
  status?: "open" | "in_progress" | "done" | "cancelled";
  sponsor_campaign_id?: string | null;
  opportunity_ids?: string[];
  brand_id?: string | null;
  notes?: string | null;
}
const TASK_STATUSES = ["open", "in_progress", "done", "cancelled"];

async function taskValues(tx: Tx, f: Partial<TaskInput>): Promise<Row> {
  const out: Row = {};
  if (f.title !== undefined) {
    if (!f.title.trim()) throw new WriteError("title is required");
    out.title = f.title.trim();
  }
  if (f.owner_id !== undefined) {
    const o = await teamMember(tx, f.owner_id);
    out.owner_id = o.owner_id;
    out.owner_name = o.owner_name;
  }
  if (f.due_date !== undefined) {
    if (f.due_date !== null && !isIsoDate(f.due_date)) throw new WriteError("due_date must be a YYYY-MM-DD date");
    out.due_date = f.due_date;
  }
  if (f.status !== undefined) {
    if (!TASK_STATUSES.includes(f.status)) throw new WriteError(`status must be one of ${TASK_STATUSES.join(", ")}`);
    out.status = f.status;
  }
  if (f.sponsor_campaign_id !== undefined) out.sponsor_campaign_id = (await campaignOrNull(tx, f.sponsor_campaign_id))?.sponsor_campaign_id ?? null;
  if (f.brand_id !== undefined) out.brand_id = f.brand_id ? (await one(tx, "brands", "brand_id", f.brand_id, "Brand")).brand_id : null;
  if (f.opportunity_ids !== undefined) {
    for (const o of f.opportunity_ids) await one(tx, "opportunities", "opportunity_id", o, "Opportunity");
    out.opportunity_ids = f.opportunity_ids;
  }
  if (f.notes !== undefined) out.notes = f.notes;
  return out;
}

export async function createTask(sql: Sql, input: TaskInput, actor: Actor = "user", now = Date.now()) {
  return sql.begin(async (tx) => {
    await lockWrites(tx);
    const sim = await simulationDate(tx);
    const v = await taskValues(tx, { status: "open", opportunity_ids: [], ...input });
    const id = await nextAppId(tx, "tasks", "task_id", "APP-TSK-");
    const row: Row = { task_id: id, ...v, created_at: new Date(stamp(sim, [], now)), created_by: actor, source: "app" };
    const ids = (row.opportunity_ids as string[]) ?? [];
    delete row.opportunity_ids;
    const [after] = await tx<Row[]>`insert into tasks ${tx(asRow(row))} returning *`;
    const [withIds] = await tx<Row[]>`update tasks set opportunity_ids = ${ids}::text[] where task_id = ${id} returning *`;
    await audit(tx, actor, "task.create", "tasks", id, null, withIds ?? after);
    return withIds ?? after;
  });
}

export async function updateTask(sql: Sql, id: string, fields: Partial<TaskInput>, actor: Actor = "user") {
  return sql.begin(async (tx) => {
    await lockWrites(tx);
    const before = await one(tx, "tasks", "task_id", id, "Task");
    const v = await taskValues(tx, fields);
    const ids = v.opportunity_ids as string[] | undefined;
    delete v.opportunity_ids;
    if (Object.keys(v).length === 0 && ids === undefined) throw new WriteError("Nothing to change");
    if (Object.keys(v).length) await tx`update tasks set ${tx(asRow(v))} where task_id = ${id}`;
    if (ids !== undefined) await tx`update tasks set opportunity_ids = ${ids}::text[] where task_id = ${id}`;
    const [after] = await tx<Row[]>`select * from tasks where task_id = ${id}`;
    await audit(tx, actor, "task.update", "tasks", id, before, after);
    return after;
  });
}

export async function deleteTask(sql: Sql, id: string, actor: Actor = "user") {
  return sql.begin(async (tx) => {
    await lockWrites(tx);
    const before = await one(tx, "tasks", "task_id", id, "Task");
    await tx`delete from tasks where task_id = ${id}`;
    await audit(tx, actor, "task.delete", "tasks", id, before, null);
    return { task_id: id };
  });
}

// ---------------------------------------------------------------- settings
export interface SettingsInput {
  simulation_date?: string;
  stale_days?: number;
  stage_weights?: Record<string, number>;
  collection_rate?: number;
  cash_goal_inr?: number;
}
const SIM_MIN = "2025-01-15";
const SIM_MAX = "2025-04-20";

export async function updateSettings(sql: Sql, input: SettingsInput, actor: Actor = "user") {
  const v: Row = {};
  if (input.simulation_date !== undefined) {
    if (!isIsoDate(input.simulation_date) || input.simulation_date < SIM_MIN || input.simulation_date > SIM_MAX)
      throw new WriteError(`simulation_date must be a date from ${SIM_MIN} to ${SIM_MAX}`);
    v.simulation_date = input.simulation_date;
  }
  if (input.stale_days !== undefined) v.stale_days = assertInt("stale_days", input.stale_days, 1);
  if (input.cash_goal_inr !== undefined) v.cash_goal_inr = assertInt("cash_goal_inr", input.cash_goal_inr);
  if (input.collection_rate !== undefined) {
    if (typeof input.collection_rate !== "number" || !(input.collection_rate >= 0 && input.collection_rate <= 1)) throw new WriteError("collection_rate must be between 0 and 1");
    v.collection_rate = input.collection_rate;
  }
  if (input.stage_weights !== undefined) {
    const keys = ["prospecting", "contacted", "proposal_sent", "negotiating"];
    const w = input.stage_weights;
    if (Object.keys(w).sort().join() !== [...keys].sort().join() || keys.some((k) => typeof w[k] !== "number" || !(w[k] >= 0 && w[k] <= 1)))
      throw new WriteError(`stage_weights needs exactly ${keys.join(", ")}, each between 0 and 1`);
  }
  if (Object.keys(v).length === 0 && input.stage_weights === undefined) throw new WriteError("Nothing to change");
  return sql.begin(async (tx) => {
    await lockWrites(tx);
    const [before] = await tx<Row[]>`select * from settings where id = 1`;
    if (Object.keys(v).length) await tx`update settings set ${tx(asRow(v))} where id = 1`;
    if (input.stage_weights !== undefined) await tx`update settings set stage_weights = ${tx.json(input.stage_weights)} where id = 1`;
    const [after] = await tx<Row[]>`select * from settings where id = 1`;
    await audit(tx, actor, "settings.update", "settings", "1", before, after);
    return after;
  });
}
