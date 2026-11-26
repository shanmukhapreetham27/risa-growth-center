"use client";

import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/** Drawer whose open state lives in the URL (?opp=...), so it survives server re-renders after a write. */
export function UrlSheet({ title, description, closeHref, children }: { title: string; description?: string; closeHref: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <Sheet open onOpenChange={(open) => !open && router.replace(closeHref, { scroll: false })}>
      <SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:sm:max-w-2xl" data-testid="opportunity-drawer">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-8">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
