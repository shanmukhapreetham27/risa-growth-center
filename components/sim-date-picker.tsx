"use client";

import { useState, useTransition } from "react";
import { setSimulationDate } from "@/app/actions";

/** Header picker: writes settings.simulation_date (persistent, shared) and re-renders every page. */
export function SimDatePicker({ value, min, max }: { value: string; min: string; max: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Simulation date</span>
      <input
        type="date"
        aria-label="Simulation date"
        data-testid="sim-date"
        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        defaultValue={value}
        key={value}
        min={min}
        max={max}
        disabled={pending}
        onChange={(e) => {
          const d = e.currentTarget.value;
          if (!d || d === value) return;
          start(async () => {
            const r = await setSimulationDate(d);
            setError(r?.ok ? null : (r?.error ?? "Could not save"));
          });
        }}
      />
      {pending && <span className="text-xs text-muted-foreground">Updating…</span>}
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </label>
  );
}
