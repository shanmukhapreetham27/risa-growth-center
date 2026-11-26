import { cn } from "@/lib/utils";

/** Data origin of a number (CONTEXT §4, CLAUDE.md rule 7). */
export type Origin = "sourced" | "simulated" | "assumption";

const STYLE: Record<Origin, string> = {
  sourced: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
  simulated: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  assumption: "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200",
};
const LABEL: Record<Origin, string> = { sourced: "Sourced", simulated: "Simulated", assumption: "Assumption" };
const TITLE: Record<Origin, string> = {
  sourced: "From the CampusFest 2025 sponsor dataset (data/source_csv) or edits made in this app",
  simulated: "Simulated: payments, budgets, spend and seed tasks are not in the source (data/simulated)",
  assumption: "Assumption: stage weights, collection rate, stale days or cash goal (Settings)",
};

export function Tag({ kind, className }: { kind: Origin; className?: string }) {
  return (
    <span
      title={TITLE[kind]}
      data-origin={kind}
      className={cn("inline-flex items-center rounded border px-1 py-px text-[10px] font-medium leading-none tracking-wide uppercase", STYLE[kind], className)}
    >
      {LABEL[kind]}
    </span>
  );
}

export function Tags({ kinds, className }: { kinds: Origin[]; className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1 align-middle", className)}>
      {kinds.map((k) => (
        <Tag key={k} kind={k} />
      ))}
    </span>
  );
}

/** Header column label with its origin tags. */
export function Th({ children, kinds, className }: { children: React.ReactNode; kinds?: Origin[]; className?: string }) {
  return (
    <span className={cn("inline-flex flex-col items-start gap-0.5", className)}>
      <span>{children}</span>
      {kinds && kinds.length > 0 && <Tags kinds={kinds} />}
    </span>
  );
}
