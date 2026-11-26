"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface TrendPoint {
  date: string;
  actual: number;
  goal: number | null;
}

const short = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** One metric per day with its goal as a step line (the goal changes on 15 Mar). */
export function TrendChart({ title, data, actualLabel, testId }: { title: string; data: TrendPoint[]; actualLabel: string; testId?: string }) {
  return (
    <figure className="flex flex-col gap-2 rounded-xl p-3 ring-1 ring-foreground/10" data-testid={testId}>
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tickFormatter={short} minTickGap={32} tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip labelFormatter={(d) => short(String(d))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="actual" name={actualLabel} stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="goal" name="Goal (targets in force)" stroke="#dc2626" strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
