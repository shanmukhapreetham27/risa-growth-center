import Link from "next/link";
import { createTaskAction, deleteTaskAction, updateTaskAction } from "@/app/actions";
import { Field, FormDialog } from "@/components/action-form";
import { PageTitle, Section } from "@/components/kpi";
import { Tag } from "@/components/tag";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { Task } from "@/lib/engine";
import { istDateOf } from "@/lib/engine/time";
import { dateLabel, TASK_STATUS_LABEL } from "@/lib/format";
import { getDataset } from "@/lib/server/data";
import { campaignsList, owners } from "@/lib/server/lookups";
import { cn } from "@/lib/utils";

const STATUSES = ["open", "in_progress", "done", "cancelled"] as const;

function TaskFields({ t, ownerList, campaigns, brands }: { t?: Task; ownerList: { id: string; name: string }[]; campaigns: { id: string; name: string }[]; brands: { id: string; name: string }[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Title" className="sm:col-span-2">
        <Input name="title" defaultValue={t?.title ?? ""} required aria-label="Title" />
      </Field>
      <Field label="Owner">
        <NativeSelect name="owner_id" defaultValue={t?.owner_id ?? ownerList[0]?.id} className="w-full" aria-label="Owner">
          {ownerList.map((o) => (
            <NativeSelectOption key={o.id} value={o.id}>
              {o.name} ({o.id})
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Due date">
        <Input type="date" name="due_date" defaultValue={t?.due_date ?? ""} aria-label="Due date" />
      </Field>
      <Field label="Status">
        <NativeSelect name="status" defaultValue={t?.status ?? "open"} className="w-full" aria-label="Status">
          {STATUSES.map((s) => (
            <NativeSelectOption key={s} value={s}>
              {TASK_STATUS_LABEL[s]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Campaign">
        <NativeSelect name="sponsor_campaign_id" defaultValue={t?.sponsor_campaign_id ?? ""} className="w-full" aria-label="Campaign">
          <NativeSelectOption value="">None</NativeSelectOption>
          {campaigns.map((c) => (
            <NativeSelectOption key={c.id} value={c.id}>
              {c.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Opportunity ids" hint="Comma separated, e.g. O053, O038">
        <Input name="opportunity_ids" defaultValue={t?.opportunity_ids.join(", ") ?? ""} aria-label="Opportunity ids" />
      </Field>
      <Field label="Brand">
        <NativeSelect name="brand_id" defaultValue={t?.brand_id ?? ""} className="w-full" aria-label="Brand">
          <NativeSelectOption value="">None</NativeSelectOption>
          {brands.map((b) => (
            <NativeSelectOption key={b.id} value={b.id}>
              {b.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Notes" className="sm:col-span-2">
        <Textarea name="notes" defaultValue={t?.notes ?? ""} rows={2} aria-label="Notes" />
      </Field>
    </div>
  );
}

export default async function TasksPage() {
  const data = await getDataset();
  const d = data.settings.simulation_date;
  const ownerList = owners(data);
  const campaigns = campaignsList(data);
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
  const brands = data.brands.map((b) => ({ id: b.brand_id, name: b.brand_name })).sort((a, b) => a.name.localeCompare(b.name));
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const isOverdue = (t: Task) => !!t.due_date && t.due_date < d && (t.status === "open" || t.status === "in_progress");
  const tasks = [...data.tasks].sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.task_id.localeCompare(b.task_id));

  return (
    <>
      <PageTitle title="Tasks" asOf={d}>
        <FormDialog trigger="New task" title="New task" action={createTaskAction} submitLabel="Create task" triggerVariant="default" wide testId="new-task">
          <TaskFields ownerList={ownerList} campaigns={campaigns} brands={brands} />
        </FormDialog>
      </PageTitle>

      <Section title={`Tasks (${tasks.length})`} description="All tasks are listed; tasks created after the simulation date are flagged. Overdue = due before the simulation date and still open or in progress. Seed tasks are simulated; tasks created by the copilot are marked.">
        <Table data-testid="tasks-table">
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Links</TableHead>
              <TableHead>Created by</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((t) => (
              <TableRow key={t.task_id} data-testid={`task-${t.task_id}`} className={cn(t.created_by === "copilot" && "bg-violet-50/60 dark:bg-violet-950/30")}>
                <TableCell className="max-w-80 whitespace-normal">
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.task_id}
                    {t.notes ? ` · ${t.notes}` : ""}
                  </div>
                  {istDateOf(t.created_at) > d && <div className="text-[11px] text-amber-700">Created after the simulation date ({istDateOf(t.created_at)})</div>}
                </TableCell>
                <TableCell data-testid={`task-owner-${t.task_id}`}>{t.owner_name}</TableCell>
                <TableCell data-testid={`task-due-${t.task_id}`}>
                  {dateLabel(t.due_date)}
                  {isOverdue(t) && <span className="ml-1 rounded bg-red-100 px-1 text-[10px] font-semibold text-red-900 uppercase">overdue</span>}
                </TableCell>
                <TableCell>{TASK_STATUS_LABEL[t.status] ?? t.status}</TableCell>
                <TableCell className="text-xs whitespace-normal">
                  {t.sponsor_campaign_id && <div>Campaign: {campaignName.get(t.sponsor_campaign_id) ?? t.sponsor_campaign_id}</div>}
                  {t.opportunity_ids.length > 0 && (
                    <div>
                      Opportunities:{" "}
                      {t.opportunity_ids.map((o, i) => (
                        <span key={o}>
                          {i > 0 && ", "}
                          <Link href={`/pipeline?opp=${o}`} className="underline-offset-2 hover:underline">
                            {o}
                          </Link>
                        </span>
                      ))}
                    </div>
                  )}
                  {t.brand_id && <div>Brand: {brandName.get(t.brand_id) ?? t.brand_id}</div>}
                </TableCell>
                <TableCell>
                  {t.created_by === "copilot" ? (
                    <span className="rounded bg-violet-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">Copilot</span>
                  ) : t.created_by === "seed" ? (
                    <span className="inline-flex items-center gap-1 text-xs">
                      seed <Tag kind="simulated" />
                    </span>
                  ) : (
                    <span className="text-xs">user</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <FormDialog trigger="Edit" title={`Edit ${t.task_id}`} action={updateTaskAction} submitLabel="Save task" wide triggerSize="xs">
                      <input type="hidden" name="task_id" value={t.task_id} />
                      <TaskFields t={t} ownerList={ownerList} campaigns={campaigns} brands={brands} />
                    </FormDialog>
                    <FormDialog trigger="Delete" title={`Delete ${t.task_id}?`} description={`"${t.title}" will be removed. The audit log keeps a copy.`} action={deleteTaskAction} submitLabel="Delete task" triggerSize="xs" triggerVariant="ghost">
                      <input type="hidden" name="task_id" value={t.task_id} />
                    </FormDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </>
  );
}

