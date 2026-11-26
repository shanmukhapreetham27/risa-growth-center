import type { Queryable } from "../db/client";

export interface AuditRow {
  id: number;
  at: Date;
  actor: "user" | "copilot";
  action: string;
  table_name: string;
  record_id: string | null;
}

/** Last n audit_log rows, newest first (Settings > Recent changes, REVIEWER NOTE 05 U3). */
export async function recentChanges(sql: Queryable, limit = 50): Promise<AuditRow[]> {
  return sql<AuditRow[]>`
    select id::int as id, at, actor, action, table_name, record_id from audit_log order by id desc limit ${limit}`;
}
