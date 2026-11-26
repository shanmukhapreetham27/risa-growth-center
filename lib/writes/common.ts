import type { Tx } from "../db/client";
import { istWallClockOn } from "../engine/time";

export type Actor = "user" | "copilot";

/** A write the caller asked for that the rules do not allow (bad input, wrong state). */
export class WriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteError";
  }
}

/** Serialize app writes so APP-<n> ids and the stamp rule see a consistent state. */
export async function lockWrites(tx: Tx): Promise<void> {
  await tx`select pg_advisory_xact_lock(hashtext('risa-growth-center:writes'))`;
}

export async function simulationDate(tx: Tx): Promise<string> {
  const [s] = await tx<{ simulation_date: string }[]>`select simulation_date from settings where id = 1`;
  if (!s) throw new Error("settings row is missing");
  return s.simulation_date;
}

/** Next id with an APP- prefix: prefix + (largest existing n + 1). */
export async function nextAppId(tx: Tx, table: string, column: string, prefix: string): Promise<string> {
  const pattern = `^${prefix}(\\d+)$`;
  const [r] = await tx<{ n: number }[]>`
    select coalesce(max((substring(${tx(column)} from ${pattern}))::int), 0) + 1 as n from ${tx(table)}`;
  return `${prefix}${r.n}`;
}

/**
 * Stamp rule (SPEC §2.4): effective_at = max(simulation_date at the current IST wall clock time,
 * latest existing version of the entity + 1 second, entity created_at). Callers pass the last two
 * as `floors` (already including the + 1 second where it applies).
 */
export function stamp(simDate: string, floors: ReadonlyArray<number | null | undefined>, now: number = Date.now()): number {
  let t = istWallClockOn(simDate, now);
  for (const f of floors) if (typeof f === "number" && f > t) t = f;
  return t;
}

/** postgres.js insert helper wants serializable values; rows built from DB reads are typed unknown. */
export type DbValue = string | number | boolean | Date | null | string[];
export const asRow = (o: object) => o as unknown as Record<string, DbValue>;

export const ms = (d: Date | null | undefined): number | null => (d instanceof Date ? d.getTime() : null);

/** Every app write goes to audit_log (CLAUDE.md rule 5). */
export async function audit(
  tx: Tx,
  actor: Actor,
  action: string,
  table: string,
  recordId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  const j = (x: unknown) => (x === null || x === undefined ? null : tx.json(JSON.parse(JSON.stringify(x))));
  await tx`
    insert into audit_log (actor, action, table_name, record_id, before, after)
    values (${actor}, ${action}, ${table}, ${recordId}, ${j(before)}, ${j(after)})`;
}

/** Team dictionary built from the owner columns in the data (SPEC §2.2: never invent people). */
export async function teamMember(tx: Tx, ownerId: string): Promise<{ owner_id: string; owner_name: string }> {
  const rows = await tx<{ owner_id: string; owner_name: string }[]>`
    select distinct owner_id, owner_name from (
      select owner_id, owner_name from brands
      union select owner_id, owner_name from sponsor_campaigns
      union select owner_id, owner_name from opportunity_history
    ) o where owner_id = ${ownerId} and owner_name is not null`;
  if (rows.length !== 1) throw new WriteError(`Unknown owner ${ownerId}; owners come from the data (T01, T02, T03, T05)`);
  return rows[0];
}

export function assertInt(name: string, v: unknown, min = 0): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min) throw new WriteError(`${name} must be an integer >= ${min}`);
  return v;
}
