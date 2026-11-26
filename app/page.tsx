import { DecisionBadge } from "@/components/decision-badge";
import { Kpi, PageTitle, Section } from "@/components/kpi";
import { Tags, Th } from "@/components/tag";
import { TrendChart } from "@/components/trend-chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { campaignRows, computeSnapshot, dateRange, funnel, istEndOfDay, targetInForce } from "@/lib/engine";
import { inr, inrCompact, num, pct } from "@/lib/format";
import { getDataset } from "@/lib/server/data";

export default async function OverviewPage() {
  const data = await getDataset();
  const d = data.settings.simulation_date;
  const s = computeSnapshot(data, d);
  const steps = funnel(s);
  const rows = campaignRows(data, d);
  const series = dateRange("2025-01-15", d).map((day) => ({ day, x: computeSnapshot(data, day), tv: targetInForce(data, istEndOfDay(day)) }));
  const festStarted = istEndOfDay(d) >= data.event.event_starts_at;
  const top = Math.max(steps[0].value, 1);

  return (
    <>
      <PageTitle title="Overview" asOf={d} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          testId="kpi-confirmed"
          title="Confirmed partnerships"
          kinds={["sourced"]}
          value={
            <>
              <span data-testid="confirmed-count">{num(s.confirmed_partnerships)}</span>{" "}
              <span className="text-base font-normal text-muted-foreground">
                / <span data-testid="confirmed-goal">{num(s.confirmed_partnerships_goal)}</span> goal
              </span>
            </>
          }
          sub={`${s.confirmed_brands} brands. Goal from "${s.target_version ?? "no target"}"`}
        />
        <Kpi
          testId="kpi-qualified"
          title="Qualified brands"
          kinds={["sourced"]}
          value={
            <>
              {num(s.qualified_brands)}{" "}
              <span className="text-base font-normal text-muted-foreground">
                / <span data-testid="qualified-goal">{num(s.qualified_brands_goal)}</span> goal
              </span>
            </>
          }
          sub={`${num(s.prospects_brands)} brands created by this date`}
        />
        <Kpi
          testId="kpi-confirmed-cash"
          title="Confirmed cash value"
          kinds={["sourced"]}
          value={inrCompact(s.confirmed_value_cash_inr)}
          sub={`${inr(s.confirmed_value_cash_inr)} cash. In kind (not cash): ${inr(s.confirmed_value_in_kind_inr)}`}
        />
        <Kpi
          testId="kpi-cash-collected"
          title="Cash collected vs team cash goal"
          kinds={["simulated", "assumption"]}
          value={
            <>
              {inrCompact(s.cash_collected_inr_simulated)}{" "}
              <span className="text-base font-normal text-muted-foreground">/ {inrCompact(data.settings.cash_goal_inr)}</span>
            </>
          }
          sub={
            <>
              <span data-testid="cash-collected">{inr(s.cash_collected_inr_simulated)}</span> collected (simulated). Goal {inr(data.settings.cash_goal_inr)} is a team assumption. Outstanding{" "}
              {inr(s.outstanding_confirmed_cash_inr_simulated)}; overdue {num(s.overdue_installments_simulated)} ({inr(s.overdue_amount_inr_simulated)}).
            </>
          }
        />
        <Kpi
          testId="kpi-pipeline"
          title="Open pipeline / weighted"
          kinds={["sourced", "assumption"]}
          value={
            <>
              {inrCompact(s.open_pipeline_proposed_inr)}{" "}
              <span className="text-base font-normal text-muted-foreground">/ {inrCompact(s.weighted_open_pipeline_inr)}</span>
            </>
          }
          sub={`${num(s.open_opportunities)} open, ${num(s.stale_open_opportunities_7d)} stale (no update > ${data.settings.stale_days} days). Weighted uses the stage weights (assumption).`}
        />
        <Kpi
          testId="kpi-projected"
          title="Projected cash before festival"
          kinds={["simulated", "assumption"]}
          value={inrCompact(s.projected_cash_before_festival_inr)}
          sub={
            festStarted
              ? `Festival has started, so this is cash collected before 12 Apr 10:00 IST: ${inr(s.cash_collected_before_festival_inr_simulated)} (simulated).`
              : `Collected + unpaid confirmed cash × ${pct(data.settings.collection_rate)} + weighted open cash pipeline × ${pct(data.settings.collection_rate)}. Collection rate and weights are assumptions.`
          }
        />
      </div>

      <Section
        title="Funnel"
        kinds={["sourced", "simulated"]}
        description="Brands for the first four steps, opportunities for proposals and confirmed, rupees for cash collected (simulated). Conversion is from the previous step; for cash it is collected ÷ confirmed cash value."
      >
        <Table data-testid="funnel">
          <TableHeader>
            <TableRow>
              <TableHead>Step</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Conversion</TableHead>
              <TableHead className="w-1/2" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {steps.map((x) => (
              <TableRow key={x.key}>
                <TableCell>
                  {x.label} <span className="text-xs text-muted-foreground">({x.unit === "inr" ? "₹, simulated" : x.unit})</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{x.unit === "inr" ? inr(x.value) : num(x.value)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(x.conversion)}</TableCell>
                <TableCell>
                  {x.unit !== "inr" ? (
                    <div className="h-3 rounded bg-primary/80" style={{ width: `${Math.max(1, Math.round((x.value / top) * 100))}%` }} />
                  ) : (
                    <div className="h-3 rounded bg-amber-500/80" style={{ width: `${Math.max(1, Math.round((x.conversion ?? 0) * 100))}%` }} title="Share of confirmed cash collected" />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Trend" kinds={["sourced"]} description="Daily from 15 Jan 2025 to the simulation date. The dashed line is the goal in force that day (the revised plan applies from 15 Mar 09:00 IST).">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TrendChart
            testId="trend-confirmed"
            title="Confirmed partnerships vs goal"
            actualLabel="Confirmed partnerships"
            data={series.map(({ day, x, tv }) => ({ date: day, actual: x.confirmed_partnerships, goal: tv?.confirmed_partnerships_goal ?? null }))}
          />
          <TrendChart
            testId="trend-qualified"
            title="Qualified brands vs goal"
            actualLabel="Qualified brands"
            data={series.map(({ day, x, tv }) => ({ date: day, actual: x.qualified_brands, goal: tv?.qualified_brands_goal ?? null }))}
          />
        </div>
      </Section>

      <Section
        title="Campaigns"
        description="Interactions by campaign, opportunities by originating campaign. Win rate = confirmed ÷ (confirmed + lost or withdrawn); meeting rate = conversations ÷ contacted. Cash per ₹ spent = cash collected on the campaign's deals ÷ posted spend (both simulated). Badge rules: SPEC §5; hover a badge for the rule that fired, or see Campaigns for the rule and reasons."
      >
        <Table data-testid="campaign-table">
          <TableHeader>
            <TableRow>
              <TableHead className="align-bottom">Campaign</TableHead>
              <TableHead className="text-right align-bottom whitespace-normal"><Th kinds={["sourced"]}>Brands touched</Th></TableHead>
              <TableHead className="text-right align-bottom whitespace-normal"><Th kinds={["sourced"]}>Conversations</Th></TableHead>
              <TableHead className="text-right align-bottom whitespace-normal"><Th kinds={["sourced"]}>Opportunities</Th></TableHead>
              <TableHead className="text-right align-bottom whitespace-normal"><Th kinds={["sourced"]}>Confirmed</Th></TableHead>
              <TableHead className="text-right align-bottom whitespace-normal"><Th kinds={["sourced"]} className="items-end">Cash confirmed</Th></TableHead>
              <TableHead className="text-right align-bottom whitespace-normal"><Th kinds={["sourced"]}>Win rate</Th></TableHead>
              <TableHead className="text-right align-bottom whitespace-normal"><Th kinds={["sourced"]}>Meeting rate</Th></TableHead>
              <TableHead className="text-right align-bottom whitespace-normal"><Th kinds={["assumption"]}>Stale open</Th></TableHead>
              <TableHead className="text-right align-bottom whitespace-normal"><Th kinds={["simulated"]}>Budget</Th></TableHead>
              <TableHead className="text-right align-bottom whitespace-normal"><Th kinds={["simulated"]}>Spend</Th></TableHead>
              <TableHead className="text-right align-bottom whitespace-normal"><Th kinds={["simulated"]}>Cash per ₹ spent</Th></TableHead>
              <TableHead className="align-bottom"><Th kinds={["sourced"]}>Decision</Th></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.sponsor_campaign_id} data-testid={`campaign-row-${r.sponsor_campaign_id}`}>
                <TableCell className="max-w-48 whitespace-normal">
                  <div className="font-medium">{r.campaign_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.sponsor_campaign_id} · {r.status}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{num(r.metrics.prospects_brands)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(r.metrics.conversation_brands)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(r.metrics.opportunities_created)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(r.metrics.confirmed_partnerships)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(r.metrics.confirmed_value_cash_inr)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(r.win_rate)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(r.meeting_rate)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(r.metrics.stale_open_opportunities_7d)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(r.budget)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(r.spend)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.cash_per_rupee_spent === null ? "–" : `₹${r.cash_per_rupee_spent.toFixed(1)}`}</TableCell>
                <TableCell>
                  <DecisionBadge decision={r.decision} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          <Tags kinds={["assumption"]} /> Stale open uses stale days = {data.settings.stale_days} (Settings).
        </p>
      </Section>
    </>
  );
}
