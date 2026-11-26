/** In memory copy of the v_* views (CONTEXT §5.4). Instants are epoch ms; dates are 'YYYY-MM-DD'. */

export const STAGES = ["prospecting", "contacted", "proposal_sent", "negotiating", "partner_confirmed", "lost", "withdrawn"] as const;
export type Stage = (typeof STAGES)[number];
export const OPEN_STAGES: ReadonlySet<Stage> = new Set(["prospecting", "contacted", "proposal_sent", "negotiating"]);
export const PROPOSAL_STAGES: ReadonlySet<Stage> = new Set(["proposal_sent", "negotiating", "partner_confirmed"]);
export const LOST_STAGES: ReadonlySet<Stage> = new Set(["lost", "withdrawn"]);
export const CONTACT_EVENTS: ReadonlySet<string> = new Set(["outreach_sent", "introduction_received", "web_inbound"]);
export const QUAL_STATUSES = ["unreviewed", "engaged", "qualified", "unqualified", "dormant"] as const;
export type QualStatus = (typeof QUAL_STATUSES)[number];
export const INTERACTION_EVENTS = [
  "outreach_sent", "delivered", "replied", "meeting_booked", "meeting_held", "introduction_received", "web_inbound", "opt_out",
] as const;

/** Channel groups (SPEC §4.2). */
export const WARM_CAMPAIGNS: ReadonlySet<string> = new Set(["SC02", "SC04", "SC05"]);
export const COLD_CAMPAIGNS: ReadonlySet<string> = new Set(["SC01", "SC03", "SC06"]);

export type DataSource = "source" | "simulated" | "app";

export interface Settings {
  simulation_date: string;
  stale_days: number;
  stage_weights: Record<string, number>;
  collection_rate: number;
  cash_goal_inr: number;
}

export interface EventInfo {
  event_name: string;
  history_start: number | null;
  history_end: number | null;
  event_starts_at: number;
  event_ends_at: number;
  timezone: string | null;
  currency: string | null;
}

export interface Brand {
  brand_id: string;
  brand_name: string;
  industry: string | null;
  owner_id: string | null;
  owner_name: string | null;
  created_at: number;
  source: DataSource;
}

export interface Contact {
  contact_id: string;
  contact_name: string;
  job_title: string | null;
  brand_id: string;
  brand_name: string | null;
  created_at: number;
  source: DataSource;
}

export interface Campaign {
  sponsor_campaign_id: string;
  campaign_name: string;
  channel: string | null;
  objective: string | null;
  audience: string | null;
  owner_id: string | null;
  owner_name: string | null;
  planned_start_at: number | null;
  planned_end_at: number | null;
  created_at: number;
  status: "active" | "paused" | "stopped";
  source: DataSource;
}

export interface Interaction {
  interaction_id: string;
  brand_id: string;
  brand_name: string | null;
  contact_id: string | null;
  contact_name: string | null;
  sponsor_campaign_id: string | null;
  campaign_name: string | null;
  channel: string | null;
  event_type: string;
  outcome: string | null;
  summary: string | null;
  occurred_at: number;
  attempt_id: string | null;
  origin_interaction_id: string | null;
  owner_id: string | null;
  source: DataSource;
}

export interface QualVersion {
  history_id: string;
  brand_id: string;
  brand_name: string | null;
  qualification_status: QualStatus;
  reason: string | null;
  source_campaign_name: string | null;
  sponsor_campaign_id: string | null;
  effective_at: number;
  source: DataSource;
}

export interface Opportunity {
  opportunity_id: string;
  opportunity_name: string;
  brand_id: string;
  brand_name: string | null;
  primary_contact_id: string | null;
  primary_contact_name: string | null;
  sponsor_campaign_id: string | null;
  originating_campaign_name: string | null;
  support_type: "cash" | "in_kind";
  created_at: number;
  source: DataSource;
}

export interface OppVersion {
  history_id: string;
  opportunity_id: string;
  opportunity_name: string | null;
  brand_id: string | null;
  brand_name: string | null;
  stage: Stage;
  proposed_value_inr: number;
  confirmed_value_inr: number;
  owner_id: string | null;
  owner_name: string | null;
  effective_at: number;
  source: DataSource;
}

export interface Target {
  effective_at: number;
  qualified_brands_goal: number;
  confirmed_partnerships_goal: number;
  target_version: string;
  source: DataSource;
}

export interface Installment {
  installment_id: string;
  opportunity_id: string;
  opportunity_name: string | null;
  brand_id: string | null;
  brand_name: string | null;
  installment: "advance" | "balance" | "top_up";
  amount_due_inr: number;
  due_at: number;
  paid_at: number | null;
  amount_paid_inr: number;
  voided_at: number | null;
  source: DataSource;
}

export interface Budget {
  sponsor_campaign_id: string;
  campaign_name: string | null;
  planned_budget_inr: number;
  budget_note: string | null;
  source: DataSource;
}

export interface Spend {
  spend_id: string;
  sponsor_campaign_id: string;
  campaign_name: string | null;
  spent_at: number;
  amount_inr: number;
  note: string | null;
  source: DataSource;
}

export interface Activation {
  activation_id: string;
  brand_id: string | null;
  brand_name: string | null;
  opportunity_id: string | null;
  opportunity_name: string | null;
  attendee_campaign_id: string | null;
  attendee_campaign_name: string | null;
  activation_note: string | null;
  linked_at: number | null;
  source: DataSource;
}

export interface Task {
  task_id: string;
  title: string;
  sponsor_campaign_id: string | null;
  opportunity_ids: string[];
  brand_id: string | null;
  owner_id: string | null;
  owner_name: string | null;
  due_date: string | null;
  status: "open" | "in_progress" | "done" | "cancelled";
  notes: string | null;
  created_at: number;
  created_by: "seed" | "user" | "copilot";
  source: DataSource;
}

export interface Dataset {
  settings: Settings;
  event: EventInfo;
  brands: Brand[];
  contacts: Contact[];
  campaigns: Campaign[];
  interactions: Interaction[];
  qualHistory: QualVersion[];
  opportunities: Opportunity[];
  oppHistory: OppVersion[];
  targets: Target[];
  activations: Activation[];
  payments: Installment[];
  budgets: Budget[];
  spend: Spend[];
  tasks: Task[];
}
