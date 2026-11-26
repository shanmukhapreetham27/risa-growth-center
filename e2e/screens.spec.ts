/**
 * One full-page screenshot per page at 1440 px wide (REVIEWER NOTE 04, Phase 2 item 7), on a freshly
 * reset test branch: the same rows as the demo DB, simulation date 2025-04-20.
 */
import { expect, test } from "@playwright/test";
import { makeSql } from "../lib/db/client";
import { assertTestDatabase } from "../lib/db/guard";
import { resetDatabase } from "../lib/db/reset";
import { loadEnv } from "../lib/env";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  loadEnv();
  assertTestDatabase(process.env);
  const sql = makeSql(process.env.DATABASE_URL_TEST!, { max: 1 });
  try {
    await resetDatabase(sql);
  } finally {
    await sql.end();
  }
});

const PAGES = [
  ["01-overview", "/"],
  ["02-diagnose", "/diagnose"],
  ["03-campaigns", "/campaigns"],
  ["04-pipeline", "/pipeline"],
  ["05-pipeline-drawer", "/pipeline?opp=O053"],
  ["06-collections", "/collections"],
  ["07-tasks", "/tasks"],
  ["08-settings", "/settings"],
  ["09-copilot", "/copilot"],
] as const;

for (const [name, path] of PAGES) {
  test(`screenshot ${name}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByTestId("sim-date").first()).toHaveValue("2025-04-20");
    if (name === "01-overview") await expect(page.locator(".recharts-line").first()).toBeVisible();
    if (name === "05-pipeline-drawer") {
      await expect(page.getByTestId("opportunity-drawer")).toBeVisible();
      await page.waitForTimeout(600); // let the drawer finish sliding in
      await page.screenshot({ path: `reports/phase-3-screens/${name}.png` });
      return;
    }
    await page.screenshot({ path: `reports/phase-3-screens/${name}.png`, fullPage: true });
  });
}
