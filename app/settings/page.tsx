import { changeTargetsAction, updateAssumptionsAction } from "@/app/actions";
import { ActionForm, Field } from "@/components/action-form";
import { PageTitle, Section } from "@/components/kpi";
import { ResetButton } from "@/components/reset-button";
import { SimDatePicker } from "@/components/sim-date-picker";
import { Tag, Tags } from "@/components/tag";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadDataDictionary } from "@/lib/dictionary";
import { istEndOfDay, targetInForce } from "@/lib/engine";
import { inr, istDateTime } from "@/lib/format";
import { getDataset } from "@/lib/server/data";
import { getSql } from "@/lib/server/db";
import { cn } from "@/lib/utils";

export default async function SettingsPage() {
  const [data, dict] = await Promise.all([getDataset(), loadDataDictionary(getSql())]);
  const s = data.settings;
  const d = s.simulation_date;
  const inForce = targetInForce(data, istEndOfDay(d));
  const nextLabel = `App plan ${data.targets.filter((t) => t.source === "app").length + 1}`;

  return (
    <>
      <PageTitle title="Settings and data" asOf={d} />

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
        <Section title="Simulation date" description="Shared and persistent. Every page and (from Phase 3) every copilot tool uses it; app writes are stamped on this date.">
          <SimDatePicker value={d} min="2025-01-15" max="2025-04-20" />
        </Section>

        <Section title="Assumptions" kinds={["assumption"]} description="Used by weighted pipeline, projected cash, stale flags and the cash goal card.">
          <ActionForm action={updateAssumptionsAction} submitLabel="Save assumptions" testId="assumptions-form">
            <div className="grid grid-cols-2 gap-3">
              {(["prospecting", "contacted", "proposal_sent", "negotiating"] as const).map((k) => (
                <Field key={k} label={`Stage weight: ${k.replace("_", " ")}`}>
                  <Input name={`w_${k}`} inputMode="decimal" defaultValue={String(s.stage_weights[k] ?? "")} aria-label={`Stage weight ${k}`} />
                </Field>
              ))}
              <Field label="Collection rate (0 to 1)">
                <Input name="collection_rate" inputMode="decimal" defaultValue={String(s.collection_rate)} aria-label="Collection rate" />
              </Field>
              <Field label="Stale days">
                <Input name="stale_days" inputMode="numeric" defaultValue={String(s.stale_days)} aria-label="Stale days" />
              </Field>
              <Field label="Team cash goal (₹)" className="col-span-2" hint={`Now ${inr(s.cash_goal_inr)}; strategy base case ₹24.46L`}>
                <Input name="cash_goal_inr" inputMode="numeric" defaultValue={String(s.cash_goal_inr)} aria-label="Team cash goal" />
              </Field>
            </div>
          </ActionForm>
        </Section>

        <Section title="Targets" kinds={["sourced"]} description="Saving adds a new targets version, effective at the simulation date (stamp rule). Earlier dates keep the targets that were in force then.">
          <ActionForm action={changeTargetsAction} submitLabel="Save new targets" testId="targets-form">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Qualified brands goal">
                <Input name="qualified_brands_goal" inputMode="numeric" defaultValue={String(inForce?.qualified_brands_goal ?? "")} aria-label="Qualified brands goal" />
              </Field>
              <Field label="Confirmed partnerships goal">
                <Input name="confirmed_partnerships_goal" inputMode="numeric" defaultValue={String(inForce?.confirmed_partnerships_goal ?? "")} aria-label="Confirmed partnerships goal" />
              </Field>
              <Field label="Version label" className="col-span-2" hint={`Default: ${nextLabel}`}>
                <Input name="target_version" placeholder={nextLabel} aria-label="Version label" />
              </Field>
            </div>
          </ActionForm>
        </Section>
      </div>

      <Section title="Target versions" kinds={["sourced"]} description="The goal in force at a date is the latest version effective on or before it (bold). Versions after the simulation date are in italics.">
          <Table data-testid="targets-table">
            <TableHeader>
              <TableRow>
                <TableHead>Effective (IST)</TableHead>
                <TableHead>Version</TableHead>
                <TableHead className="text-right">Qualified</TableHead>
                <TableHead className="text-right">Partnerships</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.targets.map((t) => (
                <TableRow key={`${t.effective_at}-${t.target_version}`} className={cn(t === inForce && "font-semibold", t.effective_at > istEndOfDay(d) && "text-muted-foreground italic")}>
                  <TableCell className="text-xs">{istDateTime(t.effective_at)}</TableCell>
                  <TableCell>
                    {t.target_version}
                    {t === inForce && " (in force)"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{t.qualified_brands_goal}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.confirmed_partnerships_goal}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
      </Section>

      <Section title="Reset to original data" description="Runs the same reset as npm run db:reset: drops all tables, re-runs the migrations and reloads data/source_csv and data/simulated. Use it before a demo or after grading edits.">
        <ResetButton />
      </Section>

      <Section title="What this data cannot tell you" description="Gaps the copilot must recognise (SPEC §6.4).">
        <ul className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2" data-testid="gaps">
          {dict.gaps.map((g) => (
            <li key={g.gap} className="rounded-lg p-3 ring-1 ring-foreground/10">
              <div className="font-medium">{g.gap}</div>
              <div className="text-xs text-muted-foreground">{g.detail}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Data dictionary" description="The views the app and copilot read (raw tables keep duplicate import rows; views deduplicate). Origin: sourced = CampusFest 2025 dataset or app edits; simulated = data/simulated.">
        <Table data-testid="dictionary">
          <TableHeader>
            <TableRow>
              <TableHead>View</TableHead>
              <TableHead>Origin</TableHead>
              <TableHead>What it holds</TableHead>
              <TableHead>Columns</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dict.views.map((v) => (
              <TableRow key={v.view}>
                <TableCell className="font-mono text-xs">
                  {v.view}
                  <div className="text-muted-foreground">table {v.table}</div>
                </TableCell>
                <TableCell>{v.classification === "app" ? "app" : <Tag kind={v.classification} />}</TableCell>
                <TableCell className="max-w-80 text-xs whitespace-normal">{v.description}</TableCell>
                <TableCell className="max-w-xl font-mono text-[11px] whitespace-normal text-muted-foreground">{v.columns.join(", ")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <h3 className="mt-2 flex items-center gap-2 text-sm font-semibold">
          Assumptions <Tags kinds={["assumption"]} />
        </h3>
        <ul className="list-disc pl-5 text-xs">
          {dict.assumptions.map((a) => (
            <li key={a.key}>
              <span className="font-medium">{a.label}</span> ({a.key}): {a.use}
            </li>
          ))}
        </ul>
        <h3 className="mt-2 flex items-center gap-2 text-sm font-semibold">
          Source field guide <Tags kinds={["sourced"]} />
        </h3>
        <Table data-testid="field-guide">
          <TableHeader>
            <TableRow>
              <TableHead>Source file</TableHead>
              <TableHead>Field</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Meaning</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dict.fieldGuide.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-mono text-xs">{r.source_table}</TableCell>
                <TableCell className="font-mono text-xs">{r.field}</TableCell>
                <TableCell className="text-xs">{r.data_type}</TableCell>
                <TableCell className="max-w-2xl text-xs whitespace-normal">{r.meaning}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </>
  );
}
