import { addSpendAction, createCampaignAction, setCampaignStatusAction, updateCampaignAction } from "@/app/actions";
import { ActionForm, Field, FormDialog } from "@/components/action-form";
import { DecisionBadge } from "@/components/decision-badge";
import { PageTitle, Section } from "@/components/kpi";
import { Th } from "@/components/tag";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { campaignRows, istDateOf } from "@/lib/engine";
import { CAMPAIGN_STATUS_LABEL, CHANNEL_LABEL, inr, istDay, labelOf, pct } from "@/lib/format";
import { getDataset } from "@/lib/server/data";
import { owners } from "@/lib/server/lookups";

const CHANNELS = ["email", "introduction", "linkedin", "web_inbound", "referral", "event", "other"];

function CampaignFields({ c, ownerList }: { c?: Record<string, unknown>; ownerList: { id: string; name: string }[] }) {
  const v = (k: string) => (c?.[k] as string | null | undefined) ?? "";
  const date = (k: string) => (typeof c?.[k] === "number" ? istDateOf(c[k] as number) : "");
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Name" className="sm:col-span-2">
        <Input name="campaign_name" defaultValue={v("campaign_name")} required />
      </Field>
      <Field label="Channel">
        <NativeSelect name="channel" defaultValue={v("channel") || "email"} className="w-full">
          {[...new Set([v("channel"), ...CHANNELS].filter(Boolean))].map((x) => (
            <NativeSelectOption key={x} value={x}>
              {labelOf(CHANNEL_LABEL, x)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Owner">
        <NativeSelect name="owner_id" defaultValue={v("owner_id") || ownerList[0]?.id} className="w-full">
          {ownerList.map((o) => (
            <NativeSelectOption key={o.id} value={o.id}>
              {o.name} ({o.id})
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Objective" className="sm:col-span-2">
        <Textarea name="objective" defaultValue={v("objective")} rows={2} />
      </Field>
      <Field label="Audience" className="sm:col-span-2">
        <Textarea name="audience" defaultValue={v("audience")} rows={2} />
      </Field>
      <Field label="Planned start" hint="09:00 IST">
        <Input type="date" name="planned_start_at" defaultValue={date("planned_start_at")} />
      </Field>
      <Field label="Planned end" hint="18:00 IST">
        <Input type="date" name="planned_end_at" defaultValue={date("planned_end_at")} />
      </Field>
      <Field label="Status">
        <NativeSelect name="status" defaultValue={v("status") || "active"} className="w-full">
          {["active", "paused", "stopped"].map((s) => (
            <NativeSelectOption key={s} value={s}>
              {CAMPAIGN_STATUS_LABEL[s]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Planned budget (₹, simulated)">
        <Input name="planned_budget_inr" inputMode="numeric" defaultValue={(c?.planned_budget_inr as number | undefined)?.toString() ?? ""} />
      </Field>
    </div>
  );
}

export default async function CampaignsPage() {
  const data = await getDataset();
  const d = data.settings.simulation_date;
  const rows = campaignRows(data, d);
  const ownerList = owners(data);
  const byId = new Map(data.campaigns.map((c) => [c.sponsor_campaign_id, c]));
  const budgets = new Map(data.budgets.map((b) => [b.sponsor_campaign_id, b.planned_budget_inr]));
  const spend = [...data.spend].sort((a, b) => b.spent_at - a.spent_at || b.spend_id.localeCompare(a.spend_id));

  return (
    <>
      <PageTitle title="Campaigns" asOf={d}>
        <FormDialog trigger="New campaign" title="New campaign" action={createCampaignAction} submitLabel="Create campaign" triggerVariant="default" wide testId="new-campaign">
          <CampaignFields ownerList={ownerList} />
        </FormDialog>
      </PageTitle>

      <Section title="Sponsor campaigns" description="Badge and the rule that fired (SPEC §5) at the simulation date. Status, fields and budget edits are saved immediately and logged in the audit log.">
        <Table data-testid="campaigns-table">
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Planned</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right"><Th kinds={["simulated"]}>Budget</Th></TableHead>
              <TableHead className="text-right"><Th kinds={["simulated"]}>Spend to date</Th></TableHead>
              <TableHead className="text-right"><Th kinds={["sourced"]}>Meeting / win rate</Th></TableHead>
              <TableHead><Th kinds={["sourced"]}>Decision and rule</Th></TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const c = byId.get(r.sponsor_campaign_id)!;
              return (
                <TableRow key={r.sponsor_campaign_id} data-testid={`campaign-${r.sponsor_campaign_id}`}>
                  <TableCell className="max-w-64 whitespace-normal">
                    <div className="font-medium">{c.campaign_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.sponsor_campaign_id} · {labelOf(CHANNEL_LABEL, c.channel)}
                    </div>
                    <div className="text-xs text-muted-foreground">{c.objective}</div>
                  </TableCell>
                  <TableCell>{c.owner_name}</TableCell>
                  <TableCell className="text-xs">
                    {istDay(c.planned_start_at)} to {istDay(c.planned_end_at)}
                  </TableCell>
                  <TableCell>
                    <span data-testid={`status-${r.sponsor_campaign_id}`} className={c.status === "active" ? "" : "font-semibold text-amber-700"}>
                      {c.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.budget)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.spend)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(r.meeting_rate)} / {pct(r.win_rate)}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <DecisionBadge decision={r.decision} showRule />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-2">
                      <ActionForm action={setCampaignStatusAction} submitLabel="Set status" className="flex-row items-end" testId={`status-form-${r.sponsor_campaign_id}`} variant="outline">
                        <input type="hidden" name="sponsor_campaign_id" value={c.sponsor_campaign_id} />
                        <NativeSelect name="status" size="sm" defaultValue={c.status} aria-label={`Status of ${c.campaign_name}`}>
                          {["active", "paused", "stopped"].map((s) => (
                            <NativeSelectOption key={s} value={s}>
                              {CAMPAIGN_STATUS_LABEL[s]}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </ActionForm>
                      <div className="flex gap-2">
                        <FormDialog trigger="Edit" title={`Edit ${c.campaign_name}`} action={updateCampaignAction} submitLabel="Save campaign" wide triggerSize="xs">
                          <input type="hidden" name="sponsor_campaign_id" value={c.sponsor_campaign_id} />
                          <CampaignFields c={{ ...c, planned_budget_inr: budgets.get(c.sponsor_campaign_id) }} ownerList={ownerList} />
                        </FormDialog>
                        <FormDialog trigger="Add spend" title={`Add spend to ${c.campaign_name}`} description="Posted spend is simulated data. Date gets 18:00 IST and must be on or before the simulation date." action={addSpendAction} submitLabel="Add spend" triggerSize="xs">
                          <input type="hidden" name="sponsor_campaign_id" value={c.sponsor_campaign_id} />
                          <Field label="Amount (₹)">
                            <Input name="amount_inr" inputMode="numeric" required />
                          </Field>
                          <Field label="Date">
                            <Input type="date" name="spent_on" defaultValue={d} max={d} />
                          </Field>
                          <Field label="Note">
                            <Input name="note" />
                          </Field>
                        </FormDialog>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>

      <Section title="Spend entries" kinds={["simulated"]} description="Monthly posted spend from the simulated data plus entries added here, newest first. Entries after the simulation date are not counted in spend to date.">
        <Table data-testid="spend-table">
          <TableHeader>
            <TableRow>
              <TableHead>Id</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spend.map((s) => (
              <TableRow key={s.spend_id}>
                <TableCell className="text-xs">{s.spend_id}</TableCell>
                <TableCell>{byId.get(s.sponsor_campaign_id)?.campaign_name}</TableCell>
                <TableCell>{istDay(s.spent_at)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(s.amount_inr)}</TableCell>
                <TableCell className="text-xs">{s.note}</TableCell>
                <TableCell className="text-xs">{s.source}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </>
  );
}
