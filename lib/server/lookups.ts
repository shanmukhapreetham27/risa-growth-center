import type { Dataset } from "../engine/types";

/** Team dictionary from the owner columns in the data (SPEC §2.2: do not invent people). */
export function owners(data: Dataset): { id: string; name: string }[] {
  const m = new Map<string, string>();
  for (const r of [...data.brands, ...data.campaigns, ...data.oppHistory]) if (r.owner_id && r.owner_name) m.set(r.owner_id, r.owner_name);
  return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id));
}

export const campaignsList = (data: Dataset) => data.campaigns.map((c) => ({ id: c.sponsor_campaign_id, name: c.campaign_name }));

export const INDUSTRIES = (data: Dataset) => [...new Set(data.brands.map((b) => b.industry).filter((x): x is string => !!x))].sort();
