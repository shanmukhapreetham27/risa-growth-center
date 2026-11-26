"use server";

/**
 * Server actions behind every edit in the UI. Each one calls the Phase 1 write functions (lib/writes:
 * stamp rule, append only history, installment rules, audit_log with actor 'user'), then re-renders
 * every page so the change shows everywhere at once.
 */
import { revalidatePath } from "next/cache";
import { makeSql } from "@/lib/db/client";
import { resetDatabase } from "@/lib/db/reset";
import { istDateOf } from "@/lib/engine/time";
import type { Stage } from "@/lib/engine/types";
import {
  addSpend,
  changeOpportunity,
  changeQualification,
  changeTargets,
  createCampaign,
  createOpportunity,
  createTask,
  deleteTask,
  logInteraction,
  recordPayment,
  setCampaignBudget,
  updateCampaign,
  updateSettings,
  updateTask,
  WriteError,
} from "@/lib/writes";
import type { CampaignFields } from "@/lib/writes/entities";
import { getSql } from "@/lib/server/db";

export type ActionState = { ok: boolean; message?: string; error?: string } | null;

async function run(fn: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await fn();
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (e) {
    if (e instanceof WriteError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: `Could not save: ${e instanceof Error ? e.message : String(e)}` };
  }
}

const str = (fd: FormData, k: string): string | undefined => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
};
const req = (fd: FormData, k: string, label = k): string => {
  const v = str(fd, k);
  if (v === undefined) throw new WriteError(`${label} is required`);
  return v;
};
const int = (fd: FormData, k: string, label = k): number | undefined => {
  const v = str(fd, k);
  if (v === undefined) return undefined;
  const n = Number(v.replace(/[,₹\s]/g, ""));
  if (!Number.isInteger(n)) throw new WriteError(`${label} must be a whole number of rupees`);
  return n;
};
const num = (fd: FormData, k: string, label = k): number | undefined => {
  const v = str(fd, k);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new WriteError(`${label} must be a number`);
  return n;
};
const list = (fd: FormData, k: string): string[] =>
  (str(fd, k) ?? "").split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

// ---------------------------------------------------------------- simulation date (header)
export async function setSimulationDate(date: string): Promise<ActionState> {
  return run(async () => {
    await updateSettings(getSql(), { simulation_date: date });
    return `Simulation date set to ${date}`;
  });
}

// ---------------------------------------------------------------- pipeline
export async function changeStageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const id = req(fd, "opportunity_id");
    const stage = req(fd, "stage", "Stage") as Stage;
    const r = await changeOpportunity(getSql(), { opportunity_id: id, stage, confirmed_value_inr: stage === "partner_confirmed" ? int(fd, "confirmed_value_inr", "Confirmed value") : undefined });
    const i = r.installments;
    const extra = [i.created.length && `${i.created.length} installment(s) created`, i.voided.length && `${i.voided.length} voided`, i.rescaled.length && `${i.rescaled.length} rescaled`].filter(Boolean).join(", ");
    return `${id} moved to ${stage} (${r.history_id})${extra ? `; ${extra}` : ""}`;
  });
}

export async function changeValuesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const id = req(fd, "opportunity_id");
    const r = await changeOpportunity(getSql(), {
      opportunity_id: id,
      proposed_value_inr: int(fd, "proposed_value_inr", "Proposed value"),
      confirmed_value_inr: int(fd, "confirmed_value_inr", "Confirmed value"),
    });
    return `Values saved (${r.history_id})`;
  });
}

export async function logInteractionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const r = await logInteraction(getSql(), {
      brand_id: req(fd, "brand_id"),
      event_type: req(fd, "event_type", "Event type") as never,
      contact_id: str(fd, "contact_id") ?? null,
      sponsor_campaign_id: str(fd, "sponsor_campaign_id") ?? null,
      outcome: str(fd, "outcome") ?? null,
      summary: str(fd, "summary") ?? null,
    });
    return `Interaction logged (${r.interaction_id})`;
  });
}

export async function changeQualificationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const r = await changeQualification(getSql(), {
      brand_id: req(fd, "brand_id"),
      qualification_status: req(fd, "qualification_status", "Status") as never,
      reason: str(fd, "reason") ?? null,
    });
    return `Qualification saved (${r.history_id})`;
  });
}

export async function createOpportunityAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const brandMode = str(fd, "brand_mode") ?? "existing";
    const contactMode = str(fd, "contact_mode") ?? "none";
    const brand =
      brandMode === "new"
        ? { new: { brand_name: req(fd, "new_brand_name", "Brand name"), industry: str(fd, "new_brand_industry") ?? null } }
        : { brand_id: req(fd, "brand_id", "Brand") };
    const contact =
      contactMode === "new"
        ? { new: { contact_name: req(fd, "new_contact_name", "Contact name"), job_title: str(fd, "new_contact_title") ?? null } }
        : contactMode === "existing"
          ? { contact_id: req(fd, "contact_id", "Contact") }
          : null;
    const r = await createOpportunity(getSql(), {
      brand,
      contact,
      opportunity_name: str(fd, "opportunity_name"),
      support_type: req(fd, "support_type", "Support type") as "cash" | "in_kind",
      sponsor_campaign_id: req(fd, "sponsor_campaign_id", "Campaign"),
      stage: (str(fd, "stage") ?? "prospecting") as Stage,
      proposed_value_inr: int(fd, "proposed_value_inr", "Proposed value") ?? 0,
      owner_id: req(fd, "owner_id", "Owner"),
    });
    return `Created ${r.opportunity_id}${r.brand_id ? `, brand ${r.brand_id}` : ""}${r.contact_id ? `, contact ${r.contact_id}` : ""}`;
  });
}

// ---------------------------------------------------------------- collections
export async function recordPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const r = await recordPayment(getSql(), { installment_id: req(fd, "installment_id"), payment_date: str(fd, "payment_date") });
    return `${r.installment_id} paid (₹${r.amount_paid_inr.toLocaleString("en-IN")})`;
  });
}

// ---------------------------------------------------------------- campaigns
function campaignFields(fd: FormData): CampaignFields {
  const f: CampaignFields = {};
  for (const k of ["campaign_name", "channel", "objective", "audience", "owner_id", "status"] as const) {
    const v = str(fd, k);
    if (v !== undefined) f[k] = v;
  }
  for (const k of ["planned_start_at", "planned_end_at"] as const) {
    const v = str(fd, k);
    if (v !== undefined) f[k] = v;
  }
  return f;
}

export async function createCampaignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const f = campaignFields(fd);
    const r = await createCampaign(getSql(), {
      ...f,
      campaign_name: req(fd, "campaign_name", "Name"),
      owner_id: req(fd, "owner_id", "Owner"),
      planned_budget_inr: int(fd, "planned_budget_inr", "Planned budget"),
    });
    return `Created ${r.sponsor_campaign_id}`;
  });
}

export async function updateCampaignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const id = req(fd, "sponsor_campaign_id");
    const sql = getSql();
    const changes: string[] = [];
    const f = campaignFields(fd);
    const [current] = await sql<Record<string, unknown>[]>`select * from v_campaigns where sponsor_campaign_id = ${id}`;
    if (!current) throw new WriteError(`Campaign ${id} does not exist`);
    // Only send fields that differ from what is stored (dates compared as IST calendar dates).
    const changed = Object.fromEntries(
      Object.entries(f).filter(([k, v]) => {
        const cur = current[k];
        return (cur instanceof Date ? istDateOf(cur.getTime()) : cur) !== v;
      }),
    ) as CampaignFields;
    if (Object.keys(changed).length) {
      await updateCampaign(sql, id, changed);
      changes.push("fields");
    }
    const budget = int(fd, "planned_budget_inr", "Planned budget");
    const [b] = await sql<{ planned_budget_inr: number }[]>`select planned_budget_inr from v_budgets where sponsor_campaign_id = ${id}`;
    if (budget !== undefined && budget !== b?.planned_budget_inr) {
      await setCampaignBudget(sql, id, budget);
      changes.push("budget");
    }
    if (!changes.length) throw new WriteError("Nothing to change");
    return `${id} saved (${changes.join(", ")})`;
  });
}

export async function setCampaignStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const id = req(fd, "sponsor_campaign_id");
    const status = req(fd, "status");
    await updateCampaign(getSql(), id, { status });
    return `${id} is ${status}`;
  });
}

export async function addSpendAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const r = await addSpend(getSql(), {
      sponsor_campaign_id: req(fd, "sponsor_campaign_id"),
      amount_inr: int(fd, "amount_inr", "Amount") ?? 0,
      spent_on: str(fd, "spent_on"),
      note: str(fd, "note") ?? null,
    });
    return `Spend ${r.spend_id} added`;
  });
}

// ---------------------------------------------------------------- tasks
export async function createTaskAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const t = await createTask(getSql(), {
      title: req(fd, "title", "Title"),
      owner_id: req(fd, "owner_id", "Owner"),
      due_date: str(fd, "due_date") ?? null,
      status: (str(fd, "status") ?? "open") as never,
      sponsor_campaign_id: str(fd, "sponsor_campaign_id") ?? null,
      opportunity_ids: list(fd, "opportunity_ids"),
      brand_id: str(fd, "brand_id") ?? null,
      notes: str(fd, "notes") ?? null,
    });
    return `Task ${t.task_id} created`;
  });
}

export async function updateTaskAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const id = req(fd, "task_id");
    await updateTask(getSql(), id, {
      title: req(fd, "title", "Title"),
      owner_id: req(fd, "owner_id", "Owner"),
      due_date: str(fd, "due_date") ?? null,
      status: req(fd, "status", "Status") as never,
      sponsor_campaign_id: str(fd, "sponsor_campaign_id") ?? null,
      opportunity_ids: list(fd, "opportunity_ids"),
      brand_id: str(fd, "brand_id") ?? null,
      notes: str(fd, "notes") ?? null,
    });
    return `Task ${id} saved`;
  });
}

export async function deleteTaskAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const id = req(fd, "task_id");
    await deleteTask(getSql(), id);
    return `Task ${id} deleted`;
  });
}

// ---------------------------------------------------------------- settings
export async function updateAssumptionsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const w = (k: string) => {
      const v = num(fd, `w_${k}`, `Weight ${k}`);
      if (v === undefined) throw new WriteError(`Weight for ${k} is required`);
      return v;
    };
    await updateSettings(getSql(), {
      stale_days: int(fd, "stale_days", "Stale days"),
      collection_rate: num(fd, "collection_rate", "Collection rate"),
      cash_goal_inr: int(fd, "cash_goal_inr", "Cash goal"),
      stage_weights: { prospecting: w("prospecting"), contacted: w("contacted"), proposal_sent: w("proposal_sent"), negotiating: w("negotiating") },
    });
    return "Assumptions saved";
  });
}

export async function changeTargetsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const r = await changeTargets(getSql(), {
      qualified_brands_goal: int(fd, "qualified_brands_goal", "Qualified brands goal") ?? 0,
      confirmed_partnerships_goal: int(fd, "confirmed_partnerships_goal", "Confirmed partnerships goal") ?? 0,
      target_version: str(fd, "target_version"),
    });
    return `Targets saved as "${r.target_version}"`;
  });
}

/** Settings > Reset to original data (SPEC §2.3): same reset as npm run db:reset, on the direct string. */
export async function resetAction(): Promise<ActionState> {
  return run(async () => {
    const url = process.env.DATABASE_URL_UNPOOLED;
    if (!url) throw new WriteError("DATABASE_URL_UNPOOLED is not set on the server");
    const sql = makeSql(url, { max: 1 });
    try {
      const r = await resetDatabase(sql);
      return `Reset done: ${r.totalRows.toLocaleString("en-IN")} rows reloaded from the CSVs`;
    } finally {
      await sql.end();
    }
  });
}
