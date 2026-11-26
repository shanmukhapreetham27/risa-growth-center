"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CopilotChat } from "./copilot-chat";
import { useCopilot } from "./copilot-provider";

/** Header button that opens the right side panel (hidden on the full page view). */
export function CopilotToggle() {
  const { open, setOpen, busy } = useCopilot();
  const path = usePathname();
  if (path.startsWith("/copilot")) return null;
  return (
    <Button size="sm" variant={open ? "secondary" : "default"} onClick={() => setOpen(!open)} data-testid="copilot-toggle" aria-expanded={open}>
      {open ? "Close copilot" : "Copilot"}
      {busy && !open ? " (working)" : ""}
    </Button>
  );
}

/** Right side panel available on every page (SPEC §4). It overlays the page, so page layout never shrinks. */
export function CopilotPanel() {
  const { open, setOpen } = useCopilot();
  const path = usePathname();
  if (!open || path.startsWith("/copilot")) return null;
  return (
    <aside
      className="fixed top-0 right-0 bottom-0 z-50 flex w-full max-w-[460px] flex-col border-l bg-background shadow-xl"
      aria-label="Copilot"
      data-testid="copilot-panel"
    >
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-sm font-semibold">Copilot</span>
        <span className="flex items-center gap-3 text-xs">
          <Link href="/copilot" className="underline-offset-2 hover:underline" onClick={() => setOpen(false)}>
            Full page
          </Link>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
            Close
          </button>
        </span>
      </div>
      <CopilotChat />
    </aside>
  );
}
