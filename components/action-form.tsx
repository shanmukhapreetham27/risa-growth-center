"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** A form bound to a server action; shows the write error (or result) next to the submit button. */
export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  className,
  onDone,
  testId,
  variant = "default",
}: {
  action: Action;
  children: React.ReactNode;
  submitLabel?: string;
  className?: string;
  onDone?: () => void;
  testId?: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);
  return (
    <form ref={formRef} action={formAction} className={cn("flex flex-col gap-3", className)} data-testid={testId}>
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant={variant} disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {state?.error && (
          <p role="alert" className="text-xs text-destructive">
            {state.error}
          </p>
        )}
        {state?.ok && state.message && (
          <p role="status" className="text-xs text-muted-foreground">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

/** Button that opens a dialog holding an ActionForm; closes when the write succeeds. */
export function FormDialog({
  trigger,
  title,
  description,
  action,
  submitLabel,
  children,
  triggerVariant = "outline",
  triggerSize = "sm",
  wide,
  testId,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  action: Action;
  submitLabel?: string;
  children: React.ReactNode;
  triggerVariant?: "default" | "outline" | "ghost" | "secondary";
  triggerSize?: "default" | "sm" | "xs";
  wide?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={triggerVariant} size={triggerSize} data-testid={testId} />}>{trigger}</DialogTrigger>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <ActionForm action={action} submitLabel={submitLabel} onDone={() => setOpen(false)}>
          {children}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

/** Label + control stacked. */
export function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}
