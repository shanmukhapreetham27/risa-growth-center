/**
 * REVIEWER NOTE 05 U2: no page clips content at 1280 or 1440 px.
 * For every element whose computed overflow-x is hidden, clip, auto or scroll, scrollWidth must be within
 * 1 px of clientWidth, unless the element (or an ancestor) is an intentional horizontal scroller marked
 * data-allow-hscroll (none at present). The page itself must not scroll sideways.
 */
import { expect, test } from "@playwright/test";

const PAGES = ["/", "/diagnose", "/campaigns", "/pipeline", "/pipeline?opp=O053", "/collections", "/tasks", "/settings", "/copilot"];
const WIDTHS = process.env.LAYOUT_WIDTHS ? process.env.LAYOUT_WIDTHS.split(",").map(Number) : [1280, 1440];

const CASES = [...PAGES, "/?panel=open"];

for (const width of WIDTHS) {
  for (const path of CASES) {
    test(`no clipped content at ${width}px: ${path}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path.replace("?panel=open", ""));
      await expect(page.getByTestId("sim-date").first()).toBeVisible();
      if (path.endsWith("?panel=open")) {
        await page.getByTestId("copilot-toggle").click();
        await expect(page.getByTestId("copilot-panel")).toBeVisible();
      }
      if (path.includes("opp=")) {
        await expect(page.getByTestId("opportunity-drawer")).toBeVisible();
        await page.waitForTimeout(600);
      }
      const result = await page.evaluate(() => {
        const offenders: { el: string; scrollWidth: number; clientWidth: number; text: string }[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
          if (!(el instanceof HTMLElement)) continue;
          const ox = getComputedStyle(el).overflowX;
          if (!["hidden", "clip", "auto", "scroll"].includes(ox)) continue;
          if (el.clientWidth < 4) continue; // visually hidden helpers (sr-only)
          if (el.closest("[data-allow-hscroll]")) continue;
          if (el.scrollWidth - el.clientWidth > 1) {
            const id = el.getAttribute("data-testid") ?? el.getAttribute("data-slot") ?? "";
            offenders.push({
              el: `${el.tagName.toLowerCase()}${id ? `[${id}]` : ""}.${String(el.className).slice(0, 60)}`,
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
              text: (el.textContent ?? "").trim().slice(0, 80),
            });
          }
        }
        const doc = document.documentElement;
        return { offenders, pageOverflow: doc.scrollWidth - doc.clientWidth };
      });
      expect(result.offenders, JSON.stringify(result.offenders, null, 1)).toEqual([]);
      expect(result.pageOverflow).toBeLessThanOrEqual(0);
    });
  }
}
