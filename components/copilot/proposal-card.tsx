"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { CampaignStatusPayload, TaskProposalPayload } from "@/lib/copilot/proposals";
import { cn } from "@/lib/utils";
import { type ProposalView, useCopilot } from "./copilot-provider";

/** Proposal card (SPEC §6.2): Confirm performs the write; Edit changes fields first; Cancel writes nothing. */
export function ProposalCard({ p }: { p: ProposalView }) {
  const { confirm, reject, owners } = useCopilot();
  const [editing, setEditing] = useState(false);
  const isTask = p.action_type === "create_task";
  const task = p.payload as TaskProposalPayload;
  const camp = p.payload as CampaignStatusPayload;
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const v = (k: string, d: unknown) => (k in edits ? edits[k] : d) as string;

  return (
    <div
      data-testid={`proposal-${p.proposal_id}`}
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3 text-sm",
        p.status === "pending" && "border-violet-300 bg-violet-50/60 dark:border-violet-800 dark:bg-violet-950/30",
        p.status === "confirmed" && "border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30",
        p.status === "rejected" && "opacity-70",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">
          {isTask ? "Proposed task" : "Proposed campaign status change"} <span className="text-xs font-normal text-muted-foreground">{p.proposal_id}</span>
        </span>
        <span className="text-xs font-medium uppercase" data-testid="proposal-status">
          {p.status === "pending" ? "awaiting your confirmation" : p.status === "confirmed" ? "confirmed" : "cancelled"}
        </span>
      </div>

      {isTask ? (
        editing ? (
          <div className="grid grid-cols-1 gap-2">
            <Input aria-label="Task title" value={v("title", task.title)} onChange={(e) => setEdits({ ...edits, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <NativeSelect aria-label="Task owner" value={v("owner_id", task.owner_id)} onChange={(e) => setEdits({ ...edits, owner_id: e.target.value })} className="w-full">
                {owners.map((o) => (
                  <NativeSelectOption key={o.id} value={o.id}>
                    {o.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Input type="date" aria-label="Task due date" value={v("due_date", task.due_date)} onChange={(e) => setEdits({ ...edits, due_date: e.target.value })} />
            </div>
            <Input
              aria-label="Opportunity ids"
              value={v("opportunity_ids_text", task.opportunity_ids.join(", "))}
              onChange={(e) => setEdits({ ...edits, opportunity_ids_text: e.target.value, opportunity_ids: e.target.value.split(/[\s,]+/).filter(Boolean) })}
            />
          </div>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-muted-foreground">Title</dt>
            <dd className="font-medium">{task.title}</dd>
            <dt className="text-muted-foreground">Owner</dt>
            <dd>{task.owner_name}</dd>
            <dt className="text-muted-foreground">Due</dt>
            <dd>{task.due_date}</dd>
            {task.opportunity_ids.length > 0 && (
              <>
                <dt className="text-muted-foreground">Opportunities</dt>
                <dd>{task.opportunity_ids.join(", ")}</dd>
              </>
            )}
            {task.sponsor_campaign_id && (
              <>
                <dt className="text-muted-foreground">Campaign</dt>
                <dd>{task.sponsor_campaign_id}</dd>
              </>
            )}
            {task.notes && (
              <>
                <dt className="text-muted-foreground">Notes</dt>
                <dd>{task.notes}</dd>
              </>
            )}
          </dl>
        )
      ) : editing ? (
        <NativeSelect aria-label="New campaign status" value={v("status", camp.status)} onChange={(e) => setEdits({ ...edits, status: e.target.value })} className="w-full">
          {["active", "paused", "stopped"].map((s) => (
            <NativeSelectOption key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <dt className="text-muted-foreground">Campaign</dt>
          <dd className="font-medium">
            {camp.campaign_name} ({camp.sponsor_campaign_id})
          </dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            {camp.current_status} → <strong>{camp.status}</strong>
          </dd>
          <dt className="text-muted-foreground">Reason</dt>
          <dd>{camp.reason}</dd>
        </dl>
      )}

      {p.status === "pending" && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            data-testid="proposal-confirm"
            disabled={!!p.busy}
            onClick={() => {
              const { opportunity_ids_text: _ignored, ...clean } = edits;
              void _ignored;
              void confirm(p.proposal_id, editing && Object.keys(clean).length ? clean : undefined);
            }}
          >
            {p.busy === "confirm" ? "Saving…" : "Confirm"}
          </Button>
          <Button size="sm" variant="outline" data-testid="proposal-edit" disabled={!!p.busy} onClick={() => setEditing(!editing)}>
            {editing ? "Done editing" : "Edit"}
          </Button>
          <Button size="sm" variant="ghost" data-testid="proposal-cancel" disabled={!!p.busy} onClick={() => void reject(p.proposal_id)}>
            {p.busy === "reject" ? "Cancelling…" : "Cancel"}
          </Button>
        </div>
      )}
      {p.status === "confirmed" && p.result && (
        <p className="text-xs text-emerald-800 dark:text-emerald-300" data-testid="proposal-result">
          {p.result.record === "task"
            ? `Created task ${String(p.result.task_id)} for ${String(p.result.owner_name)}, due ${String(p.result.due_date)}. It is on the Tasks page and in Recent changes.`
            : `${String(p.result.campaign_name)} is now ${String(p.result.status)}. See the Campaigns page and Recent changes.`}
        </p>
      )}
      {p.status === "rejected" && <p className="text-xs text-muted-foreground">Cancelled. Nothing was written.</p>}
      {p.error && (
        <p role="alert" className="text-xs text-destructive">
          {p.error}
        </p>
      )}
    </div>
  );
}
