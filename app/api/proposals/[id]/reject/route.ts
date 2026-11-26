/** POST /api/proposals/:id/reject: the user's Cancel click. Nothing is written except the proposal status. */
import { rejectProposal } from "@/lib/copilot/proposals";
import { getSql } from "@/lib/server/db";
import { WriteError } from "@/lib/writes";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: RouteContext<"/api/proposals/[id]/reject">) {
  const { id } = await ctx.params;
  try {
    const proposal = await rejectProposal(getSql(), id);
    return Response.json({ ok: true, proposal });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: e instanceof WriteError ? 400 : 500 });
  }
}
