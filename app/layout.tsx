import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CopilotPanel, CopilotToggle } from "@/components/copilot/copilot-panel";
import { CopilotProvider } from "@/components/copilot/copilot-provider";
import { NavLinks } from "@/components/nav-links";
import { SimDatePicker } from "@/components/sim-date-picker";
import { Tag } from "@/components/tag";
import { daysToFestival } from "@/lib/engine/analytics";
import { dateLabel } from "@/lib/format";
import { getDataset } from "@/lib/server/data";
import { owners } from "@/lib/server/lookups";
import "./globals.css";

// Every page reads live data and must reflect edits immediately (no prerendering, no stale cache).
export const dynamic = "force-dynamic";

// shadcn/ui reads --font-sans (app/globals.css @theme).
const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RISA Growth Center",
  description: "CampusFest 2025 sponsorship command center (RISA Growth APM, Challenge B)",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const data = await getDataset();
  const d = data.settings.simulation_date;
  const days = daysToFestival(data, d);
  return (
    <html lang="en-IN" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <CopilotProvider owners={owners(data)}>
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
            <div className="flex flex-col">
              <span className="text-sm font-semibold">RISA Growth Center</span>
              <span className="text-[11px] text-muted-foreground">CampusFest 2025 sponsorship</span>
            </div>
            <NavLinks />
            <div className="ml-auto flex flex-wrap items-center gap-4">
              <SimDatePicker value={d} min="2025-01-15" max="2025-04-20" />
              <span className="text-sm" data-testid="days-to-festival">
                {days > 0 ? (
                  <>
                    <strong className="tabular-nums">{days}</strong> days to festival ({dateLabel("2025-04-12")})
                  </>
                ) : days === 0 ? (
                  <strong>Festival day 1 (12 Apr)</strong>
                ) : days === -1 ? (
                  <strong>Festival day 2 (13 Apr)</strong>
                ) : (
                  <span className="text-muted-foreground">Festival held 12–13 Apr ({-days} days ago)</span>
                )}
              </span>
              <CopilotToggle />
              <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-label="Legend">
                Legend: <Tag kind="sourced" /> <Tag kind="simulated" /> <Tag kind="assumption" />
              </span>
            </div>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-6 py-6">{children}</main>
          <CopilotPanel />
        </CopilotProvider>
      </body>
    </html>
  );
}
