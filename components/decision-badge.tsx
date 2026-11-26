import type { Badge as BadgeT, Decision } from "@/lib/engine/decisions";
import { cn } from "@/lib/utils";

const STYLE: Record<BadgeT, string> = {
  SCALE: "bg-emerald-600 text-white",
  CHANGE: "bg-amber-500 text-black",
  STOP: "bg-red-600 text-white",
  WATCH: "bg-slate-400 text-black",
};

export function DecisionBadge({ decision, showRule = false }: { decision: Decision; showRule?: boolean }) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span title={decision.rule} data-badge={decision.badge} className={cn("inline-flex w-fit rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide", STYLE[decision.badge])}>
        {decision.badge}
      </span>
      {showRule && (
        <span className="max-w-xs text-[11px] leading-snug text-muted-foreground">
          {decision.rule}
          {decision.reasons.length > 0 ? `: ${decision.reasons.join("; ")}` : ""}
        </span>
      )}
    </span>
  );
}
