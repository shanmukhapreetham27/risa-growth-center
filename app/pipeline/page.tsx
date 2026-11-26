import Link from "next/link";
import { changeQualificationAction, changeStageAction, changeValuesAction, createOpportunityAction, logInteractionAction } from "@/app/actions";
import { ActionForm, Field, FormDialog } from "@/components/action-form";
import { CreateOpportunityFields } from "@/components/create-opportunity-fields";
import { PageTitle, Section } from "@/components/kpi";
import { Tags, Th } from "@/components/tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UrlSheet } from "@/components/url-sheet";
import { INTERACTION_EVENTS, istEndOfDay, latestBy, pipelineRows, QUAL_STATUSES, STAGES } from "@/lib/engine";
import { inr, istDateTime, istDay, num, STAGE_LABEL } from "@/lib/format";
import { getDataset } from "@/lib/server/data";
import { campaignsList, INDUSTRIES, owners } from "@/lib/server/lookups";
import { cn } from "@/lib/utils";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  const sp = await searchParams;
  const f = { stage: one(sp.stage), campaign: one(sp.campaign), owner: one(sp.owner), stale: one(sp.stale) === "1" };
  const oppId = one(sp.opp);
  const data = await getDataset();
  const d = data.settings.simulation_date;
  const t = istEndOfDay(d);
  const all = pipelineRows(data, d);
  const rows = all.filter(
    (r) => (!f.stage || r.stage === f.stage) && (!f.campaign || r.sponsor_campaign_id === f.campaign) && (!f.owner || r.owner_id === f.owner) && (!f.stale || r.stale),
  );
  const qs = new URLSearchParams(Object.entries({ stage: f.stage, campaign: f.campaign, owner: f.owner, stale: f.stale ? "1" : "" }).filter(([, v]) => v));
  const hrefFor = (id?: string) => {
    const q = new URLSearchParams(qs);
    if (id) q.set("opp", id);
    const s = q.toString();
    return s ? `/pipeline?${s}` : "/pipeline";
  };
  const ownerList = owners(data);
  const campaigns = campaignsList(data);

  // Drawer data
  const opp = oppId ? data.opportunities.find((o) => o.opportunity_id === oppId) : undefined;
  const row = oppId ? all.find((r) => r.id === oppId) : undefined;
  const versions = opp ? data.oppHistory.filter((h) => h.opportunity_id === opp.opportunity_id).sort((a, b) => a.effective_at - b.effective_at || a.history_id.localeCompare(b.history_id)) : [];
  const brand = opp ? data.brands.find((b) => b.brand_id === opp.brand_id) : undefined;
  const qual = brand ? data.qualHistory.filter((q) => q.brand_id === brand.brand_id).sort((a, b) => a.effective_at - b.effective_at || a.history_id.localeCompare(b.history_id)) : [];
  const qualNow = brand ? latestBy(qual, (q) => q.brand_id, t).get(brand.brand_id) : undefined;
  const brandContacts = brand ? data.contacts.filter((c) => c.brand_id === brand.brand_id) : [];
  const interactions = brand ? data.interactions.filter((i) => i.brand_id === brand.brand_id && i.occurred_at <= t).sort((a, b) => b.occurred_at - a.occurred_at).slice(0, 8) : [];

  return (
    <>
      <PageTitle title="Pipeline" asOf={d}>
        <FormDialog trigger="Create opportunity" title="Create opportunity" description="Creates the opportunity (and a new brand and contact if chosen) at the simulation date. All new rows get APP- ids." action={createOpportunityAction} submitLabel="Create" triggerVariant="default" wide testId="create-opportunity">
          <CreateOpportunityFields
            brands={data.brands.map((b) => ({ id: b.brand_id, name: b.brand_name })).sort((a, b) => a.name.localeCompare(b.name))}
            contacts={data.contacts.map((c) => ({ id: c.contact_id, name: c.contact_name, brand_id: c.brand_id, title: c.job_title }))}
            campaigns={campaigns}
            owners={ownerList}
            industries={INDUSTRIES(data)}
          />
        </FormDialog>
      </PageTitle>

      <form className="flex flex-wrap items-end gap-3" method="get" action="/pipeline" aria-label="Filters">
        <Field label="Stage">
          <NativeSelect name="stage" defaultValue={f.stage} size="sm">
            <NativeSelectOption value="">All stages</NativeSelectOption>
            {STAGES.map((s) => (
              <NativeSelectOption key={s} value={s}>
                {STAGE_LABEL[s]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Campaign">
          <NativeSelect name="campaign" defaultValue={f.campaign} size="sm">
            <NativeSelectOption value="">All campaigns</NativeSelectOption>
            {campaigns.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Owner">
          <NativeSelect name="owner" defaultValue={f.owner} size="sm">
            <NativeSelectOption value="">All owners</NativeSelectOption>
            {ownerList.map((o) => (
              <NativeSelectOption key={o.id} value={o.id}>
                {o.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <label className="flex h-7 items-center gap-2 text-sm">
          <input type="checkbox" name="stale" value="1" defaultChecked={f.stale} /> Stale only
        </label>
        <Button type="submit" size="sm" variant="outline">
          Apply
        </Button>
        <Link href="/pipeline" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          Clear
        </Link>
      </form>

      <Section
        title={`Opportunities (${rows.length} of ${all.length})`}
        kinds={["sourced"]}
        description={`Latest version of each opportunity created by the simulation date. Sorted by value (confirmed value for confirmed deals, else proposed), then oldest last update first, then id; "tie" marks equal values. Stale = open with no update in more than ${data.settings.stale_days} days (assumption).`}
      >
        <Table data-testid="pipeline-table">
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Opportunity</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Proposed</TableHead>
              <TableHead className="text-right">Confirmed</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Last update</TableHead>
              <TableHead><Th kinds={["assumption"]}>Stale</Th></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-testid={`opp-row-${r.id}`} className={cn(r.id === oppId && "bg-muted")}>
                <TableCell className="tabular-nums">{r.rank}</TableCell>
                <TableCell>
                  <Link href={hrefFor(r.id)} scroll={false} className="font-medium underline-offset-2 hover:underline" data-testid={`open-${r.id}`}>
                    {r.brand_name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {r.id}
                    {r.later_versions > 0 && ` · ${r.later_versions} later version(s) after the simulation date`}
                  </div>
                </TableCell>
                <TableCell data-testid={`stage-${r.id}`}>{STAGE_LABEL[r.stage]}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {inr(r.proposed_value_inr)} {r.tie && <span className="rounded bg-muted px-1 text-[10px] uppercase">tie</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.confirmed_value_inr ? inr(r.confirmed_value_inr) : "–"}</TableCell>
                <TableCell className="text-xs">{r.support_type === "cash" ? "cash" : "in kind"}</TableCell>
                <TableCell>{r.owner_name}</TableCell>
                <TableCell className="text-xs">{r.campaign_name}</TableCell>
                <TableCell className="text-xs">{istDay(r.last_update)}</TableCell>
                <TableCell>{r.stale ? <span className="font-semibold text-amber-700">stale ({r.days_since_update}d)</span> : ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      {opp && row && brand && (
        <UrlSheet title={`${opp.opportunity_name}`} description={`${opp.opportunity_id} · ${brand.brand_name} · ${opp.support_type === "cash" ? "cash" : "in kind"} · ${opp.originating_campaign_name ?? ""}`} closeHref={hrefFor()}>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <div className="text-xs text-muted-foreground">Stage at {d}</div>
              <div className="font-medium" data-testid="drawer-stage">{STAGE_LABEL[row.stage]}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Proposed</div>
              <div className="font-medium tabular-nums">{inr(row.proposed_value_inr)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Confirmed</div>
              <div className="font-medium tabular-nums">{inr(row.confirmed_value_inr)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Owner</div>
              <div className="font-medium">{row.owner_name}</div>
            </div>
          </div>

          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              Version history <Tags kinds={["sourced"]} />
            </h3>
            <Table data-testid="version-history">
              <TableHeader>
                <TableRow>
                  <TableHead>Effective (IST)</TableHead>
                  <TableHead>Id</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Proposed</TableHead>
                  <TableHead className="text-right">Confirmed</TableHead>
                  <TableHead>Owner</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map((v) => (
                  <TableRow key={v.history_id} className={cn(v.effective_at > t && "text-muted-foreground italic")}>
                    <TableCell className="text-xs">
                      {istDateTime(v.effective_at)}
                      {v.effective_at > t && " (after simulation date)"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {v.history_id}
                      {v.source === "app" && <span className="ml-1 rounded bg-muted px-1 text-[10px]">app</span>}
                    </TableCell>
                    <TableCell>{STAGE_LABEL[v.stage]}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(v.proposed_value_inr)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(v.confirmed_value_inr)}</TableCell>
                    <TableCell className="text-xs">{v.owner_name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-lg p-3 ring-1 ring-foreground/10">
              <h3 className="text-sm font-semibold">Change stage</h3>
              <ActionForm action={changeStageAction} submitLabel="Save stage" testId="change-stage-form">
                <input type="hidden" name="opportunity_id" value={opp.opportunity_id} />
                <Field label="New stage">
                  <NativeSelect name="stage" defaultValue={row.stage} className="w-full" aria-label="New stage">
                    {STAGES.map((s) => (
                      <NativeSelectOption key={s} value={s}>
                        {STAGE_LABEL[s]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Confirmed value (₹)" hint="Only for Partner confirmed; empty = proposed value">
                  <Input name="confirmed_value_inr" inputMode="numeric" aria-label="Confirmed value" />
                </Field>
              </ActionForm>
            </div>
            <div className="flex flex-col gap-2 rounded-lg p-3 ring-1 ring-foreground/10">
              <h3 className="text-sm font-semibold">Change values</h3>
              <ActionForm action={changeValuesAction} submitLabel="Save values" testId="change-values-form">
                <input type="hidden" name="opportunity_id" value={opp.opportunity_id} />
                <Field label="Proposed value (₹)">
                  <Input name="proposed_value_inr" inputMode="numeric" defaultValue={String(row.proposed_value_inr)} aria-label="Proposed value" />
                </Field>
                {row.stage === "partner_confirmed" && (
                  <Field label="Confirmed value (₹)" hint="Rescales unpaid installments, or adds a top up if all are paid">
                    <Input name="confirmed_value_inr" inputMode="numeric" defaultValue={String(row.confirmed_value_inr)} aria-label="Confirmed value" />
                  </Field>
                )}
              </ActionForm>
            </div>
          </section>

          <section className="flex flex-col gap-2 rounded-lg p-3 ring-1 ring-foreground/10">
            <h3 className="text-sm font-semibold">Log interaction</h3>
            <ActionForm action={logInteractionAction} submitLabel="Log interaction" testId="log-interaction-form">
              <input type="hidden" name="brand_id" value={brand.brand_id} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Event type">
                  <NativeSelect name="event_type" className="w-full" defaultValue="meeting_held" aria-label="Event type">
                    {INTERACTION_EVENTS.map((e) => (
                      <NativeSelectOption key={e} value={e}>
                        {e}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Contact">
                  <NativeSelect name="contact_id" className="w-full" defaultValue={opp.primary_contact_id ?? ""} aria-label="Contact">
                    <NativeSelectOption value="">None</NativeSelectOption>
                    {brandContacts.map((c) => (
                      <NativeSelectOption key={c.contact_id} value={c.contact_id}>
                        {c.contact_name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Campaign">
                  <NativeSelect name="sponsor_campaign_id" className="w-full" defaultValue={opp.sponsor_campaign_id ?? ""} aria-label="Campaign">
                    <NativeSelectOption value="">None</NativeSelectOption>
                    {campaigns.map((c) => (
                      <NativeSelectOption key={c.id} value={c.id}>
                        {c.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Outcome">
                  <Input name="outcome" placeholder="e.g. attended, positive" aria-label="Outcome" />
                </Field>
                <Field label="Summary" className="sm:col-span-2">
                  <Input name="summary" aria-label="Summary" />
                </Field>
              </div>
            </ActionForm>
            {interactions.length > 0 && (
              <ul className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground">
                {interactions.map((i) => (
                  <li key={i.interaction_id}>
                    {istDateTime(i.occurred_at)} · {i.event_type}
                    {i.outcome ? ` (${i.outcome})` : ""} · {i.campaign_name ?? "no campaign"} · {i.interaction_id}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2 rounded-lg p-3 ring-1 ring-foreground/10" data-testid="brand-section">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              Brand: {brand.brand_name} <span className="text-xs font-normal text-muted-foreground">{brand.brand_id} · {brand.industry} · owner {brand.owner_name}</span>
            </h3>
            <p className="text-xs">
              Qualification at {d}: <strong>{qualNow?.qualification_status ?? "none"}</strong>
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Effective (IST)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {qual.map((q) => (
                  <TableRow key={q.history_id} className={cn(q.effective_at > t && "text-muted-foreground italic")}>
                    <TableCell className="text-xs">
                      {istDateTime(q.effective_at)}
                      {q.effective_at > t && " (after simulation date)"}
                    </TableCell>
                    <TableCell>{q.qualification_status}</TableCell>
                    <TableCell className="max-w-72 text-xs whitespace-normal">{q.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ActionForm action={changeQualificationAction} submitLabel="Change qualification" className="mt-1" testId="change-qualification-form">
              <input type="hidden" name="brand_id" value={brand.brand_id} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="New status">
                  <NativeSelect name="qualification_status" className="w-full" aria-label="New qualification status">
                    {QUAL_STATUSES.map((s) => (
                      <NativeSelectOption key={s} value={s}>
                        {s}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Reason">
                  <Input name="reason" aria-label="Reason" />
                </Field>
              </div>
            </ActionForm>
          </section>
          <p className="text-xs text-muted-foreground">Totals in this drawer: {num(versions.length)} versions, {num(qual.length)} qualification versions.</p>
        </UrlSheet>
      )}
    </>
  );
}
