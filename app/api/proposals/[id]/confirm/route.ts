/**
 * POST /api/proposals/:id/confirm (SPEC §6.2): the user's Confirm click. Body (optional): { edits } with
 * fields the user changed on the card. Performs the write through lib/writes with actor 'copilot',
 * logs it in audit_log and re-renders every page.
 */
import { revalidatePath } from "next/cache";
import { confirmProposal } from "@/lib/copilot/proposals";
import { loadDataset } from "@/lib/engine/load";
import { getSql } from "@/lib/server/db";
import { WriteError } from "@/lib/writes";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/proposals/[id]/confirm">) {
  const { id } = await ctx.params;
  let edits: Record<string, unknown> | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as { edits?: Record<string, unknown> };
    edits = body.edits && typeof body.edits === "object" ? body.edits : undefined;
    const sql = getSql();
    const proposal = await confirmProposal(sql, await loadDataset(sql), id, edits);
    revalidatePath("/", "layout");
    return Response.json({ ok: true, proposal });
  } catch (e) {
    const status = e instanceof WriteError ? 400 : 500;
    if (status === 500) console.error("[proposals] confirm failed", e);
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
