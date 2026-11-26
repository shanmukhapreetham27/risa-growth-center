import { type Origin, Tags } from "@/components/tag";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function Kpi({ title, value, sub, kinds, testId }: { title: string; value: React.ReactNode; sub?: React.ReactNode; kinds: Origin[]; testId?: string }) {
  return (
    <Card size="sm" data-testid={testId}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
          {title}
          <Tags kinds={kinds} />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className="text-2xl font-semibold tabular-nums" data-testid={testId ? `${testId}-value` : undefined}>
          {value}
        </div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function Section({ title, kinds, description, children, actions, id }: { title: string; kinds?: Origin[]; description?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode; id?: string }) {
  return (
    <section className="flex flex-col gap-3" id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 id={id ? `${id}-h` : undefined} className="flex flex-wrap items-center gap-2 text-base font-semibold">
            {title}
            {kinds && <Tags kinds={kinds} />}
          </h2>
          {description && <p className="max-w-3xl text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function PageTitle({ title, asOf, children }: { title: string; asOf: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-xs text-muted-foreground">As of end of day {asOf} IST (simulation date)</p>
      </div>
      {children}
    </div>
  );
}
