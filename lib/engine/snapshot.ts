/**
 * Metric engine: line by line port of scripts_reference/reference_engine.py `snapshot()` (SPEC §3).
 * Python line -> TypeScript line is noted in the comments. Only additions to the reference:
 *   - stale_days, stage weights and collection rate come from settings (the reference hard codes
 *     the same defaults: 7, {0.1,0.2,0.4,0.6}, 0.9);
 *   - installments voided on or before D are not overdue (SPEC §3, D4; the reference data has none).
 */
import { DAY_MS, istEndOfDay } from "./time";
import {
  CONTACT_EVENTS,
  type Dataset,
  LOST_STAGES,
  OPEN_STAGES,
  type OppVersion,
  PROPOSAL_STAGES,
  type QualVersion,
  type Settings,
} from "./types";

export interface Snapshot {
  as_of: string;
  prospects_brands: number;
  contacted_brands: number;
  responded_brands: number;
  positive_reply_brands: number;
  conversation_brands: number;
  qualified_brands: number;
  opportunities_created: number;
  proposals: number;
  confirmed_partnerships: number;
  confirmed_brands: number;
  confirmed_value_total_inr: number;
  confirmed_value_cash_inr: number;
  confirmed_value_in_kind_inr: number;
  lost_or_withdrawn: number;
  open_opportunities: number;
  open_pipeline_proposed_inr: number;
  stale_open_opportunities_7d: number;
  weighted_open_pipeline_inr: number;
  cash_collected_inr_simulated: number;
  cash_collected_before_festival_inr_simulated: number;
  outstanding_confirmed_cash_inr_simulated: number;
  overdue_installments_simulated: number;
  overdue_amount_inr_simulated: number;
  projected_cash_before_festival_inr: number;
  /** Only on whole-festival snapshots (no campaign filter). */
  target_version?: string | null;
  qualified_brands_goal?: number | null;
  confirmed_partnerships_goal?: number | null;
}

export interface SnapshotOptions {
  /** Filter to one sponsor campaign (interactions by campaign, opportunities by originating campaign). */
  campaignId?: string;
  /** Filter to a set of campaigns (channel groups, SPEC §4.2); same rules as campaignId. */
  campaignIds?: readonly string[];
  /** Override assumptions (stage weights, collection rate, stale days) for what-if checks. */
  settings?: Partial<Settings>;
}

/**
 * Python `latest(df,key,t)`: versions with effective_at <= t, sorted by (effective_at, history_id),
 * last row per key. Equivalent: per key keep max effective_at, then max history_id (string order).
 */
export function latestBy<T extends { effective_at: number; history_id: string }>(
  rows: readonly T[],
  key: (r: T) => string,
  t: number,
): Map<string, T> {
  const best = new Map<string, T>();
  for (const r of rows) {
    if (r.effective_at > t) continue;
    const k = key(r);
    const b = best.get(k);
    if (!b || r.effective_at > b.effective_at || (r.effective_at === b.effective_at && r.history_id > b.history_id)) best.set(k, r);
  }
  return best;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const nunique = <T>(xs: readonly T[]) => new Set(xs).size;

export function computeSnapshot(data: Dataset, asOf: string, opts: SnapshotOptions = {}): Snapshot {
  const s: Settings = { ...data.settings, ...opts.settings };
  const scope: ReadonlySet<string> | null = opts.campaignId
    ? new Set([opts.campaignId])
    : opts.campaignIds
      ? new Set(opts.campaignIds)
      : null;
  const campaign = scope !== null;
  const FEST_START = data.event.event_starts_at;
  // t=eod(d)
  const t = istEndOfDay(asOf);
  // b=brands[brands.created_at<=t]; I=inter[inter.occurred_at<=t]; O=opps[opps.created_at<=t]
  const b = data.brands.filter((x) => x.created_at <= t);
  let I = data.interactions.filter((x) => x.occurred_at <= t);
  let O = data.opportunities.filter((x) => x.created_at <= t);
  // if campaign: I=I[I.sponsor_campaign_id==campaign]; O=O[O.sponsor_campaign_id==campaign]
  if (campaign) {
    I = I.filter((x) => x.sponsor_campaign_id !== null && scope.has(x.sponsor_campaign_id));
    O = O.filter((x) => x.sponsor_campaign_id !== null && scope.has(x.sponsor_campaign_id));
  }
  const oById = new Map(O.map((o) => [o.opportunity_id, o]));
  const ohO = data.oppHistory.filter((h) => oById.has(h.opportunity_id));
  // L=latest(oh[oh.opportunity_id.isin(O.opportunity_id)],'opportunity_id',t).merge(O[[... 'support_type' ...]])
  const L = [...latestBy(ohO, (h) => h.opportunity_id, t).values()].map((h) => ({
    ...h,
    support_type: oById.get(h.opportunity_id)!.support_type,
  }));
  // H=oh[(oh.effective_at<=t)&(oh.opportunity_id.isin(O.opportunity_id))]
  const H = ohO.filter((h) => h.effective_at <= t);
  // conf=L[L.stage=='partner_confirmed']; op=L[L.stage.isin(OPEN)]
  const conf = L.filter((h) => h.stage === "partner_confirmed");
  const op = L.filter((h) => OPEN_STAGES.has(h.stage));
  // stale=op[(t-op.effective_at).dt.total_seconds()>7*86400]
  const stale = op.filter((h) => t - h.effective_at > s.stale_days * DAY_MS);
  // Q=latest(qual,'brand_id',t); if campaign: Q=Q[Q.brand_id.isin(I.brand_id)]
  let Q: QualVersion[] = [...latestBy(data.qualHistory, (q) => q.brand_id, t).values()];
  if (campaign) {
    const touched = new Set(I.map((i) => i.brand_id));
    Q = Q.filter((q) => touched.has(q.brand_id));
  }
  // P=pay[pay.opportunity_id.isin(O.opportunity_id)]
  const P = data.payments.filter((p) => oById.has(p.opportunity_id));
  // paid=P[P.paid_at.notna()&(P.paid_at<=t)]
  const paidBy = (p: { paid_at: number | null }) => p.paid_at !== null && p.paid_at <= t;
  const paid = P.filter(paidBy);
  // paid_before_fest=paid[paid.paid_at<FEST_START]
  const paidBeforeFest = paid.filter((p) => (p.paid_at as number) < FEST_START);
  // due_pending=P[(P.due_at<=t)&~(P.paid_at.notna()&(P.paid_at<=t))]   + SPEC §3 (D4): not voided on or before D
  const duePending = P.filter((p) => p.due_at <= t && !paidBy(p) && !(p.voided_at !== null && p.voided_at <= t));
  // cash_conf=int(conf[conf.support_type=='cash'].confirmed_value_inr.sum())
  const cashConf = sum(conf.filter((h) => h.support_type === "cash").map((h) => h.confirmed_value_inr));
  // collected=int(paid.amount_paid_inr.sum())
  const collected = sum(paid.map((p) => p.amount_paid_inr));
  // wpipe=(op.proposed_value_inr*op.stage.map(STAGE_W)).sum(); wpipe_cash = same over cash opportunities
  const weighted = (h: OppVersion) => h.proposed_value_inr * (s.stage_weights[h.stage] ?? 0);
  const wpipe = sum(op.map(weighted));
  const wpipeCash = sum(op.filter((h) => h.support_type === "cash").map(weighted));
  const beforeFest = sum(paidBeforeFest.map((p) => p.amount_paid_inr));

  const out: Snapshot = {
    as_of: asOf,
    prospects_brands: campaign ? nunique(I.map((i) => i.brand_id)) : nunique(b.map((x) => x.brand_id)),
    contacted_brands: nunique(I.filter((i) => CONTACT_EVENTS.has(i.event_type)).map((i) => i.brand_id)),
    responded_brands: nunique(I.filter((i) => i.event_type === "replied").map((i) => i.brand_id)),
    positive_reply_brands: nunique(I.filter((i) => i.event_type === "replied" && i.outcome === "positive").map((i) => i.brand_id)),
    conversation_brands: nunique(I.filter((i) => i.event_type === "meeting_held").map((i) => i.brand_id)),
    qualified_brands: Q.filter((q) => q.qualification_status === "qualified").length,
    opportunities_created: O.length,
    proposals: nunique(H.filter((h) => PROPOSAL_STAGES.has(h.stage)).map((h) => h.opportunity_id)),
    confirmed_partnerships: conf.length,
    confirmed_brands: nunique(conf.map((h) => h.brand_id)),
    confirmed_value_total_inr: sum(conf.map((h) => h.confirmed_value_inr)),
    confirmed_value_cash_inr: cashConf,
    confirmed_value_in_kind_inr: sum(conf.filter((h) => h.support_type === "in_kind").map((h) => h.confirmed_value_inr)),
    lost_or_withdrawn: L.filter((h) => LOST_STAGES.has(h.stage)).length,
    open_opportunities: op.length,
    open_pipeline_proposed_inr: sum(op.map((h) => h.proposed_value_inr)),
    stale_open_opportunities_7d: stale.length,
    // round(wpipe): CONTEXT §5.8, Math.round only at the end
    weighted_open_pipeline_inr: Math.round(wpipe),
    cash_collected_inr_simulated: collected,
    cash_collected_before_festival_inr_simulated: beforeFest,
    outstanding_confirmed_cash_inr_simulated: cashConf - collected,
    overdue_installments_simulated: duePending.length,
    overdue_amount_inr_simulated: sum(duePending.map((p) => p.amount_due_inr)),
    // if t>=FEST_START: before festival, else round(collected+(cash_conf-collected)*RATE+wpipe_cash*RATE)
    projected_cash_before_festival_inr:
      t >= FEST_START
        ? beforeFest
        : Math.round(collected + (cashConf - collected) * s.collection_rate + wpipeCash * s.collection_rate),
  };
  // if not campaign: T=targets[targets.effective_at<=t]; tv=T.sort_values('effective_at').iloc[-1]
  if (!campaign) {
    const tv = targetInForce(data, t);
    out.target_version = tv ? tv.target_version : null;
    out.qualified_brands_goal = tv ? tv.qualified_brands_goal : null;
    out.confirmed_partnerships_goal = tv ? tv.confirmed_partnerships_goal : null;
  }
  return out;
}

/** Latest targets row with effective_at <= t (data.targets is ordered by effective_at, then load order). */
export function targetInForce(data: Dataset, t: number) {
  let tv: Dataset["targets"][number] | undefined;
  for (const r of data.targets) if (r.effective_at <= t && (!tv || r.effective_at >= tv.effective_at)) tv = r;
  return tv;
}

/** Snapshot for every day from..to (trend charts, SPEC §3 daily series). */
export function dailySeries(data: Dataset, dates: readonly string[], opts: SnapshotOptions = {}): Snapshot[] {
  return dates.map((d) => computeSnapshot(data, d, opts));
}
