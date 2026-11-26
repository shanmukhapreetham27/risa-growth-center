/** Display helpers: INR with Indian grouping (₹7,25,000 and ₹22.4L), percentages and IST dates. */
const IN = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const IST_DATE = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const IST_DATETIME = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export const num = (n: number | null | undefined) => (n === null || n === undefined ? "–" : IN.format(n));
export const inr = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${n < 0 ? "−" : ""}₹${IN.format(Math.abs(n))}`);

/** Compact INR for cards: ₹22.4L (lakh), ₹1.2Cr (crore). */
export function inrCompact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2).replace(/\.?0+$/, "")}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1).replace(/\.0$/, "")}L`;
  return inr(n);
}

export const pct = (x: number | null | undefined, digits = 0) => (x === null || x === undefined ? "–" : `${(x * 100).toFixed(digits)}%`);

export const signed = (n: number, fmt: (x: number) => string = num) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : fmt(0));

/** 'YYYY-MM-DD' -> '20 Apr 2025' (the date itself, no time zone shift). */
export const dateLabel = (d: string | null | undefined) => (d ? IST_DATE.format(new Date(`${d}T12:00:00+05:30`)) : "–");
/** Instant (epoch ms) -> '18 Mar 2025' in IST. */
export const istDay = (ms: number | null | undefined) => (ms === null || ms === undefined ? "–" : IST_DATE.format(new Date(ms)));
/** Instant -> '18 Mar 2025, 12:00' in IST. */
export const istDateTime = (ms: number | null | undefined) => (ms === null || ms === undefined ? "–" : IST_DATETIME.format(new Date(ms)));

export const STAGE_LABEL: Record<string, string> = {
  prospecting: "Prospecting",
  contacted: "Contacted",
  proposal_sent: "Proposal sent",
  negotiating: "Negotiating",
  partner_confirmed: "Partner confirmed",
  lost: "Lost",
  withdrawn: "Withdrawn",
};

/** Human readable labels for stored codes (U5); the stored values never change. */
export const EVENT_LABEL: Record<string, string> = {
  outreach_sent: "Outreach sent",
  delivered: "Delivered",
  replied: "Replied",
  meeting_booked: "Meeting booked",
  meeting_held: "Meeting held",
  introduction_received: "Introduction received",
  web_inbound: "Web inbound",
  opt_out: "Opt out",
};
export const QUAL_LABEL: Record<string, string> = {
  unreviewed: "Unreviewed",
  engaged: "Engaged",
  qualified: "Qualified",
  unqualified: "Unqualified",
  dormant: "Dormant",
};
export const TASK_STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In progress", done: "Done", cancelled: "Cancelled" };
export const CAMPAIGN_STATUS_LABEL: Record<string, string> = { active: "Active", paused: "Paused", stopped: "Stopped" };
export const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  introduction: "Introduction",
  linkedin: "LinkedIn",
  web_inbound: "Web inbound",
  referral: "Referral",
  event: "Event",
  other: "Other",
};
export const labelOf = (map: Record<string, string>, code: string | null | undefined) => (code ? (map[code] ?? code) : "–");
