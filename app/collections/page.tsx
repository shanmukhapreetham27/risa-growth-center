import Link from "next/link";
import { recordPaymentAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { Kpi, PageTitle, Section } from "@/components/kpi";
import { Th } from "@/components/tag";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { collectionsSummary, computeSnapshot, firstConfirmationDate, installmentRows, type InstallmentStatus } from "@/lib/engine";
import { inr, istDay, num, STAGE_LABEL } from "@/lib/format";
import { getDataset } from "@/lib/server/data";
import { cn } from "@/lib/utils";

const STATUSES: InstallmentStatus[] = ["overdue", "due", "upcoming", "paid", "voided"];
const STATUS_STYLE: Record<InstallmentStatus, string> = {
  overdue: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  due: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  upcoming: "bg-muted text-foreground",
  paid: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  voided: "bg-muted text-muted-foreground line-through",
};

export default async function CollectionsPage({ searchParams }: PageProps<"/collections">) {
  const sp = await searchParams;
  const filter = (Array.isArray(sp.status) ? sp.status[0] : sp.status) ?? "";
  const data = await getDataset();
  const d = data.settings.simulation_date;
  const all = installmentRows(data, d);
  const sum = collectionsSummary(all);
  const s = computeSnapshot(data, d);
  const rows = filter ? all.filter((r) => r.status === filter) : all;

  return (
    <>
      <PageTitle title="Collections" asOf={d} />
      <p className="max-w-4xl text-xs text-muted-foreground">
        All installments and payments are simulated (the source has no bank receipts). Terms: advance (value ÷ 2 rounded down) due 7 days after confirmation; balance due 22 Mar 2025 18:00 IST or 7 days after confirmation if later. Status at the simulation date: overdue = due on or before it and unpaid; due = within the next 7 days; upcoming = later; voided = deal left partner confirmed with the installment unpaid.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi testId="kpi-collected" title="Cash collected" kinds={["simulated"]} value={inr(s.cash_collected_inr_simulated)} sub={`Before festival (12 Apr 10:00 IST): ${inr(s.cash_collected_before_festival_inr_simulated)}`} />
        <Kpi testId="kpi-outstanding" title="Outstanding confirmed cash" kinds={["simulated"]} value={inr(s.outstanding_confirmed_cash_inr_simulated)} sub="Confirmed cash value − collected" />
        {(["overdue", "due", "upcoming"] as const).map((k) => (
          <Kpi key={k} testId={`kpi-${k}`} title={k[0].toUpperCase() + k.slice(1)} kinds={["simulated"]} value={inr(sum[k].amount)} sub={`${num(sum[k].count)} installments`} />
        ))}
      </div>

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Status filter">
        <Link href="/collections" className={cn("rounded px-2 py-0.5", !filter ? "bg-primary text-primary-foreground" : "bg-muted")}>
          All ({all.length})
        </Link>
        {STATUSES.map((k) => (
          <Link key={k} href={`/collections?status=${k}`} className={cn("rounded px-2 py-0.5", filter === k ? "bg-primary text-primary-foreground" : "bg-muted")}>
            {k} ({sum[k].count})
          </Link>
        ))}
      </nav>

      <Section title="Installments" kinds={["simulated"]} description="Record payment = the full installment amount. Pick the payment date: on or before the simulation date and on or after the date of the deal's first confirmation; it is stored as 15:00 IST that day.">
        <Table data-testid="installments-table">
          <TableHeader>
            <TableRow>
              <TableHead>Installment</TableHead>
              <TableHead>Deal</TableHead>
              <TableHead>Stage at {d}</TableHead>
              <TableHead className="text-right"><Th kinds={["simulated"]}>Amount</Th></TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead>Record payment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const min = firstConfirmationDate(r) ?? undefined;
              const payable = r.status !== "paid" && r.status !== "voided" && r.paid_at === null;
              return (
                <TableRow key={r.installment_id} data-testid={`inst-${r.installment_id}`}>
                  <TableCell>
                    <div className="font-medium">{r.installment_id}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.installment.replace("_", " ")} · {r.source}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link href={`/pipeline?opp=${r.opportunity_id}`} className="underline-offset-2 hover:underline">
                      {r.brand_name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{r.opportunity_id}</div>
                  </TableCell>
                  <TableCell className="text-xs">{r.stage_at_d ? STAGE_LABEL[r.stage_at_d] : "–"}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.amount_due_inr)}</TableCell>
                  <TableCell className="text-xs">{istDay(r.due_at)}</TableCell>
                  <TableCell>
                    <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", STATUS_STYLE[r.status])} data-testid={`inst-status-${r.installment_id}`}>
                      {r.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">{r.status === "paid" ? `${istDay(r.paid_at)} · ${inr(r.amount_paid_inr)}` : r.voided_at && r.status === "voided" ? `voided ${istDay(r.voided_at)}` : ""}</TableCell>
                  <TableCell className="max-w-48 text-xs whitespace-normal text-red-700">{r.flags.join("; ")}</TableCell>
                  <TableCell>
                    {payable && (
                      <ActionForm action={recordPaymentAction} submitLabel="Record payment" className="flex-row items-center" testId={`pay-${r.installment_id}`}>
                        <input type="hidden" name="installment_id" value={r.installment_id} />
                        <Input type="date" name="payment_date" defaultValue={d} max={d} min={min} className="h-7 w-36" aria-label={`Payment date for ${r.installment_id}`} />
                      </ActionForm>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>
    </>
  );
}
