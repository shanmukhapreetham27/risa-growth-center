"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const PAGES = [
  { href: "/", label: "Overview" },
  { href: "/diagnose", label: "Diagnose" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/collections", label: "Collections" },
  { href: "/tasks", label: "Tasks" },
  { href: "/settings", label: "Settings" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Pages">
      {PAGES.map((p) => {
        const active = p.href === "/" ? path === "/" : path.startsWith(p.href);
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={active ? "page" : undefined}
            className={cn("rounded-md px-2.5 py-1 text-sm", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
          >
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}
