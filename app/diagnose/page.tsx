import Link from "next/link";
import { PageTitle, Section } from "@/components/kpi";
import { Th } from "@/components/tag";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { byIndustry, byOwner, type ConversionRow, medianDaysInStage, stageConversion, staleDeals, whatChanged } from "@/lib/engine";
import { dateLabel, inr, istDay, num, pct, signed, STAGE_LABEL } from "@/lib/format";
import { getDataset } from "@/lib/server/data";
import { cn } from "@/lib/utils";

const STEP_LABEL: Record<string, string> = {
  contacted: "Contacted",
  responded: "Responded",
  conversations: "Conversations",
  opportunities: "Opportunities",
  proposals: "Proposals",
  confirmed: "Confirmed",
};

/** One column per step: the count, and under it the conversion from the previous step (red = largest drop). */
function ConversionTable({ rows, testId }: { rows: ConversionRow[]; testId: string }) {
  const keys = Object.keys(STEP_LABEL) as (keyof ConversionRow["counts"])[];
  return (
    <Table data-testid={testId}>
      <TableHeader>
        <TableRow>
          <TableHead>Group</TableHead>
          {keys.map((k) => (
            <TableHead key={k} className="text-right">
              <Th kinds={["sourced"]} className="items-end">
                {STEP_LABEL[k]}
              </Th>
            </TableHead>
          ))}
          <TableHead>Bottleneck (largest drop)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key} data-testid={`${testId}-${r.key}`}>
            <TableCell className="font-medium">
              {r.label}
              {r.key.startsWith("SC") && <span className="ml-1 text-xs text-muted-foreground">{r.key}</span>}
            </TableCell>
            {keys.map((k, i) => {
              const step = i > 0 ? r.steps[i - 1] : null;
              const hit = step !== null && r.bottleneck === `${step.from} → ${step.to}`;
              return (
                <TableCell key={k} className={cn("text-right tabular-nums", hit && "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200")}>
                  <div className={cn(hit && "font-semibold")}>{num(r.counts[k])}</div>
                  {step && <div className="text-[11px] text-muted-foreground">{pct(step.rate)}</div>}
                </TableCell>
              );
            })}
            <TableCell className="text-sm" data-testid={`${testId}-${r.key}-bottleneck`}>
              {r.bottleneck ? r.bottleneck.replace(/(\w+) → (\w+)/, (_, a, b) => `${STEP_LABEL[a]} → ${STEP_LABEL[b]}`) : "–"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default async function DiagnosePage() {
  const data = await getDataset();
  const d = data.settings.simulation_date;
  const conv = stageConversion(data, d);
  const stale = staleDeals(data, d);
  const medians = medianDaysInStage(data, d);
  const owners = byOwner(data, d);
  const industries = byIndustry(data, d);
  const changed = whatChanged(data, d);
  const money = new Set(["open_pipeline_proposed_inr", "weighted_open_pipeline_inr", "confirmed_value_cash_inr", "cash_collected_inr_simulated", "projected_cash_before_festival_inr"]);
  const simulated = new Set(["cash_collected_inr_simulated", "projected_cash_before_festival_inr"]);
  const assumed = new Set(["weighted_open_pipeline_inr", "projected_cash_before_festival_inr", "stale_open_opportunities_7d"]);

  return (
    <>
      <PageTitle title="Diagnose" asOf={d} />

      <Section
        id="conversion-groups"
        title="Stage conversion by channel group"
        description="Warm = SC02, SC04, SC05; cold = SC01, SC03, SC06. Counts are brands for contacted to conversations and opportunities after that; the small figure is conversion from the previous step (it can pass 100% where opportunities started without a recorded meeting). The red cell is the largest drop in each row."
      >
        <ConversionTable rows={conv.byGroup} testId="conversion-groups" />
      </Section>

      <Section id="conversion-campaigns" title="Stage conversion by campaign">
        <ConversionTable rows={conv.byCampaign} testId="conversion-campaigns" />
      </Section>

      <Section
        id="stale"
        title={`Stale deals (${stale.length})`}
        kinds={["sourced", "assumption"]}
        description={`Open opportunities with no update in more than ${data.settings.stale_days} days (stale days is an assumption). Sorted by value, then oldest last update first, then id; "tie" marks equal values.`}
      >
        <Table data-testid="stale-table">
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Opportunity</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Proposed value</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Last update</TableHead>
              <TableHead className="text-right">Days since</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stale.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="tabular-nums">{r.rank}</TableCell>
                <TableCell>
                  <Link className="font-medium underline-offset-2 hover:underline" href={`/pipeline?opp=${r.id}`}>
                    {r.brand_name}
                  </Link>{" "}
                  <span className="text-xs text-muted-foreground">{r.id}</span>
                </TableCell>
                <TableCell>{STAGE_LABEL[r.stage]}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {inr(r.value)} {r.tie && <span className="rounded bg-muted px-1 text-[10px] uppercase">tie</span>}
                </TableCell>
                <TableCell>{r.campaign_name}</TableCell>
                <TableCell>{r.owner_name}</TableCell>
                <TableCell>{istDay(r.last_update)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.days_since_update}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        id="median-days"
        title="Median days in stage by channel group"
        kinds={["sourced"]}
        description="Days from entering a stage to the next version with a different stage, for stage spans that ended by the simulation date (n = number of spans)."
      >
        <Table data-testid="median-days">
          <TableHeader>
            <TableRow>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Warm median days</TableHead>
              <TableHead className="text-right">Warm n</TableHead>
              <TableHead className="text-right">Cold median days</TableHead>
              <TableHead className="text-right">Cold n</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {medians.map((m) => (
              <TableRow key={m.stage}>
                <TableCell>{STAGE_LABEL[m.stage]}</TableCell>
                <TableCell className="text-right tabular-nums">{m.warm.median === null ? "–" : m.warm.median.toFixed(1)}</TableCell>
                <TableCell className="text-right tabular-nums">{m.warm.n}</TableCell>
                <TableCell className="text-right tabular-nums">{m.cold.median === null ? "–" : m.cold.median.toFixed(1)}</TableCell>
                <TableCell className="text-right tabular-nums">{m.cold.n}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <div className="grid grid-cols-1 gap-8">
        {[
          { id: "by-owner", title: "By owner", note: "Owner of the opportunity's latest version.", rows: owners },
          { id: "by-industry", title: "By industry", note: "Industry of the brand.", rows: industries },
        ].map((b) => (
          <Section key={b.id} id={b.id} title={b.title} kinds={["sourced"]} description={b.note}>
            <Table data-testid={b.id}>
              <TableHeader>
                <TableRow>
                  <TableHead>{b.id === "by-owner" ? "Owner" : "Industry"}</TableHead>
                  <TableHead className="text-right">Opportunities</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">Confirmed</TableHead>
                  <TableHead className="text-right">Lost or withdrawn</TableHead>
                  <TableHead className="text-right">Confirmed value (cash + in kind)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(b.rows).map(([k, g]) => (
                  <TableRow key={k}>
                    <TableCell>{k}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.opportunities}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.open}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.confirmed}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.lost_or_withdrawn}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(g.confirmed_value_inr)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        ))}
      </div>

      <Section id="what-changed" title={`What changed: ${dateLabel(changed.before)} → ${dateLabel(changed.after)}`} description="Key metrics at the simulation date compared with 7 days earlier.">
        <Table data-testid="what-changed">
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead className="text-right">{dateLabel(changed.before)}</TableHead>
              <TableHead className="text-right">{dateLabel(changed.after)}</TableHead>
              <TableHead className="text-right">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {changed.rows.map((r) => {
              const f = money.has(r.key) ? inr : num;
              const kinds = [...(simulated.has(r.key) ? (["simulated"] as const) : []), ...(assumed.has(r.key) ? (["assumption"] as const) : [])];
              return (
                <TableRow key={r.key}>
                  <TableCell>
                    <Th kinds={kinds.length ? [...kinds] : ["sourced"]}>{r.label}</Th>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{f(r.before)}</TableCell>
                  <TableCell className="text-right tabular-nums">{f(r.after)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", r.delta > 0 && "text-emerald-700", r.delta < 0 && "text-red-700")}>{signed(r.delta, f)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>
    </>
  );
}
