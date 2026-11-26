/**
 * Decision rules per campaign (SPEC §5), port of reference_engine.py `decide()`, plus the rule
 * that fired and the CHANGE reasons for the UI and copilot.
 */
import { computeSnapshot, type Snapshot } from "./snapshot";
import type { Dataset, Settings } from "./types";

export type Badge = "WATCH" | "SCALE" | "STOP" | "CHANGE";

export interface Decision {
  badge: Badge;
  /** Which numbered rule fired, in words. */
  rule: string;
  /** CHANGE only: why it is not SCALE (stale share >= 40%, win rate < 50%, meeting rate < 40%, < 3 closed). */
  reasons: string[];
  meeting_rate: number;
  win_rate: number;
  closed: number;
  /** stale open / open, null when there is no open opportunity. */
  stale_share: number | null;
}

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

export function decide(m: Snapshot): Decision {
  // reached=m['contacted_brands']; mr=m['conversation_brands']/reached if reached else 0
  const reached = m.contacted_brands;
  const mr = reached ? m.conversation_brands / reached : 0;
  // closed=confirmed+lost_or_withdrawn; wr=confirmed/closed if closed else 0
  const closed = m.confirmed_partnerships + m.lost_or_withdrawn;
  const wr = closed ? m.confirmed_partnerships / closed : 0;
  const staleShare = m.open_opportunities ? m.stale_open_opportunities_7d / m.open_opportunities : null;
  const base = { meeting_rate: mr, win_rate: wr, closed, stale_share: staleShare };

  if (m.opportunities_created < 5 && closed < 3)
    return { ...base, badge: "WATCH", reasons: [], rule: `Rule 1 WATCH: ${m.opportunities_created} opportunities (< 5) and ${closed} closed (< 3); not enough evidence` };
  if (closed >= 3 && wr >= 0.5 && mr >= 0.4)
    return { ...base, badge: "SCALE", reasons: [], rule: `Rule 2 SCALE: ${closed} closed (>= 3), win rate ${pct(wr)} (>= 50%), meeting rate ${pct(mr)} (>= 40%)` };
  if (m.confirmed_partnerships === 0 && m.opportunities_created >= 8 && mr < 0.25)
    return { ...base, badge: "STOP", reasons: [], rule: `Rule 3 STOP: 0 confirmed, ${m.opportunities_created} opportunities (>= 8), meeting rate ${pct(mr)} (< 25%)` };

  const reasons: string[] = [];
  if (staleShare !== null && staleShare >= 0.4) reasons.push(`stale share ${pct(staleShare)} (>= 40%)`);
  if (closed < 3) reasons.push(`only ${closed} closed deals (< 3)`);
  if (closed > 0 && wr < 0.5) reasons.push(`win rate ${pct(wr)} (< 50%)`);
  if (mr < 0.4) reasons.push(`meeting rate ${pct(mr)} (< 40%)`);
  return { ...base, badge: "CHANGE", reasons, rule: "Rule 4 CHANGE: rules 1 to 3 did not fire" };
}

export interface CampaignDecision {
  sponsor_campaign_id: string;
  campaign_name: string;
  metrics: Snapshot;
  decision: Decision;
}

export function campaignDecisions(data: Dataset, asOf: string, settings?: Partial<Settings>): CampaignDecision[] {
  return data.campaigns.map((c) => {
    const metrics = computeSnapshot(data, asOf, { campaignId: c.sponsor_campaign_id, settings });
    return { sponsor_campaign_id: c.sponsor_campaign_id, campaign_name: c.campaign_name, metrics, decision: decide(metrics) };
  });
}
