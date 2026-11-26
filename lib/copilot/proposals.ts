/**
 * Copilot proposals (SPEC §6.2): propose_* tools only insert a pending chat_proposals row. The write
 * happens only when the user clicks Confirm (POST /api/proposals/:id/confirm), through lib/writes with
 * actor 'copilot', so it is audited and shows on every page.
 */
import type { Sql } from "../db/client";
import { isIsoDate } from "../engine/time";
import type { Dataset } from "../engine/types";
import { createTask, updateCampaign, WriteError } from "../writes";

export type ProposalAction = "create_task" | "set_campaign_status";

export interface TaskProposalPayload {
  title: string;
  owner_id: string;
  owner_name: string;
  due_date: string;
  sponsor_campaign_id: string | null;
  opportunity_ids: string[];
  brand_id: string | null;
  notes: string | null;
}

export interface CampaignStatusPayload {
  sponsor_campaign_id: string;
  campaign_name: string;
  current_status: string;
  status: "active" | "paused" | "stopped";
  reason: string;
}

export interface Proposal {
  proposal_id: string;
  action_type: ProposalAction;
  payload: TaskProposalPayload | CampaignStatusPayload;
  status: "pending" | "confirmed" | "rejected";
  created_at: string;
  resolved_at: string | null;
  result: Record<string, unknown> | null;
}

const owners = (data: Dataset) => {
  const m = new Map<string, string>();
  for (const r of [...data.brands, ...data.campaigns, ...data.oppHistory]) if (r.owner_id && r.owner_name) m.set(r.owner_id, r.owner_name);
  return m;
};

/** Validates and normalises a task proposal against the data (owner, ids, date). */
export function validateTaskPayload(data: Dataset, input: Record<string, unknown>): TaskProposalPayload {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) throw new WriteError("title is required");
  const team = owners(data);
  const ownerId = String(input.owner_id ?? "");
  if (!team.has(ownerId)) throw new WriteError(`owner_id must be one of ${[...team.entries()].map(([id, n]) => `${id} (${n})`).join(", ")}`);
  const due = String(input.due_date ?? "");
  if (!isIsoDate(due)) throw new WriteError("due_date must be YYYY-MM-DD");
  const camp = input.sponsor_campaign_id ? String(input.sponsor_campaign_id) : null;
  if (camp && !data.campaigns.some((c) => c.sponsor_campaign_id === camp)) throw new WriteError(`unknown sponsor_campaign_id ${camp}`);
  const opps = Array.isArray(input.opportunity_ids) ? input.opportunity_ids.map(String) : [];
  for (const o of opps) if (!data.opportunities.some((x) => x.opportunity_id === o)) throw new WriteError(`unknown opportunity_id ${o}`);
  const brand = input.brand_id ? String(input.brand_id) : null;
  if (brand && !data.brands.some((b) => b.brand_id === brand)) throw new WriteError(`unknown brand_id ${brand}`);
  return { title, owner_id: ownerId, owner_name: team.get(ownerId)!, due_date: due, sponsor_campaign_id: camp, opportunity_ids: opps, brand_id: brand, notes: input.notes ? String(input.notes) : null };
}

export function validateCampaignStatusPayload(data: Dataset, input: Record<string, unknown>): CampaignStatusPayload {
  const id = String(input.sponsor_campaign_id ?? "");
  const camp = data.campaigns.find((c) => c.sponsor_campaign_id === id);
  if (!camp) throw new WriteError(`unknown sponsor_campaign_id ${id}; campaigns: ${data.campaigns.map((c) => `${c.sponsor_campaign_id} ${c.campaign_name}`).join(", ")}`);
  const status = String(input.status ?? "");
  if (!["active", "paused", "stopped"].includes(status)) throw new WriteError("status must be active, paused or stopped");
  if (status === camp.status) throw new WriteError(`${camp.campaign_name} is already ${status}`);
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason) throw new WriteError("reason is required");
  return { sponsor_campaign_id: id, campaign_name: camp.campaign_name, current_status: camp.status, status: status as CampaignStatusPayload["status"], reason };
}

function toProposal(r: Record<string, unknown>): Proposal {
  const iso = (x: unknown) => (x instanceof Date ? x.toISOString() : x === null ? null : String(x));
  return {
    proposal_id: String(r.proposal_id),
    action_type: r.action_type as ProposalAction,
    payload: r.payload as Proposal["payload"],
    status: r.status as Proposal["status"],
    created_at: iso(r.created_at)!,
    resolved_at: iso(r.resolved_at),
    result: (r.result as Record<string, unknown> | null) ?? null,
  };
}

export async function createProposal(sql: Sql, action: ProposalAction, payload: Proposal["payload"]): Promise<Proposal> {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('risa-growth-center:proposals'))`;
    const [{ n }] = await tx<{ n: number }[]>`
      select coalesce(max((substring(proposal_id from '^P-(\\d+)$'))::int), 0) + 1 as n from chat_proposals`;
    const [row] = await tx<Record<string, unknown>[]>`
      insert into chat_proposals (proposal_id, action_type, payload, status)
      values (${`P-${n}`}, ${action}, ${tx.json(JSON.parse(JSON.stringify(payload)))}, 'pending') returning *`;
    return toProposal(row);
  });
}

export async function getProposal(sql: Sql, id: string): Promise<Proposal | null> {
  const [row] = await sql<Record<string, unknown>[]>`select * from chat_proposals where proposal_id = ${id}`;
  return row ? toProposal(row) : null;
}

/**
 * Confirm: claim the pending row, run the write as the copilot, store the result. `edits` are the
 * fields the user changed on the card (re-validated). A failed write puts the proposal back to pending.
 */
export async function confirmProposal(sql: Sql, data: Dataset, id: string, edits?: Record<string, unknown>): Promise<Proposal> {
  const current = await getProposal(sql, id);
  if (!current) throw new WriteError(`Proposal ${id} does not exist`);
  if (current.status !== "pending") throw new WriteError(`Proposal ${id} is already ${current.status}`);
  const payload =
    current.action_type === "create_task"
      ? validateTaskPayload(data, { ...current.payload, ...(edits ?? {}) })
      : validateCampaignStatusPayload(data, { ...current.payload, ...(edits ?? {}) });
  const [claimed] = await sql`update chat_proposals set status = 'confirmed', resolved_at = now(), payload = ${sql.json(JSON.parse(JSON.stringify(payload)))}
                              where proposal_id = ${id} and status = 'pending' returning proposal_id`;
  if (!claimed) throw new WriteError(`Proposal ${id} was resolved by another request`);
  try {
    let result: Record<string, unknown>;
    const context = { proposal_id: id, ...(edits && Object.keys(edits).length ? { edited_by_user: Object.keys(edits) } : {}) };
    if (current.action_type === "create_task") {
      const p = payload as TaskProposalPayload;
      const task = await createTask(
        sql,
        { title: p.title, owner_id: p.owner_id, due_date: p.due_date, sponsor_campaign_id: p.sponsor_campaign_id, opportunity_ids: p.opportunity_ids, brand_id: p.brand_id, notes: p.notes },
        "copilot",
        Date.now(),
        context,
      );
      result = { record: "task", task_id: task.task_id, title: task.title, owner_name: task.owner_name, due_date: task.due_date, opportunity_ids: task.opportunity_ids };
    } else {
      const p = payload as CampaignStatusPayload;
      const after = await updateCampaign(sql, p.sponsor_campaign_id, { status: p.status }, "copilot", { ...context, reason: p.reason });
      result = { record: "campaign", sponsor_campaign_id: p.sponsor_campaign_id, campaign_name: after.campaign_name, status: after.status, previous_status: p.current_status };
    }
    const [row] = await sql<Record<string, unknown>[]>`update chat_proposals set result = ${sql.json(JSON.parse(JSON.stringify(result)))} where proposal_id = ${id} returning *`;
    return toProposal(row);
  } catch (e) {
    await sql`update chat_proposals set status = 'pending', resolved_at = null where proposal_id = ${id}`;
    throw e;
  }
}

export async function rejectProposal(sql: Sql, id: string): Promise<Proposal> {
  const [row] = await sql<Record<string, unknown>[]>`
    update chat_proposals set status = 'rejected', resolved_at = now() where proposal_id = ${id} and status = 'pending' returning *`;
  if (!row) {
    const p = await getProposal(sql, id);
    throw new WriteError(p ? `Proposal ${id} is already ${p.status}` : `Proposal ${id} does not exist`);
  }
  return toProposal(row);
}
