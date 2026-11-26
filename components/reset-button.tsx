"use client";

import { useActionState, useState } from "react";
import { resetAction } from "@/app/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** Settings > Reset to original data, behind a confirm dialog (SPEC §2.3). */
export function ResetButton() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (): Promise<Awaited<ReturnType<typeof resetAction>>> => {
    const r = await resetAction();
    if (r?.ok) setOpen(false);
    return r;
  }, null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button variant="destructive" size="sm" data-testid="reset-open" />}>Reset to original data</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to original data?</AlertDialogTitle>
            <AlertDialogDescription>
              Drops every table, reloads the source and simulated CSVs and the default settings. All app edits, tasks, payments recorded here and the audit log are removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form action={action}>
              <Button type="submit" variant="destructive" disabled={pending} data-testid="reset-confirm">
                {pending ? "Resetting…" : "Reset"}
              </Button>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {state?.ok && <span role="status" className="text-xs text-muted-foreground">{state.message}</span>}
      {state?.error && <span role="alert" className="text-xs text-destructive">{state.error}</span>}
    </div>
  );
}
