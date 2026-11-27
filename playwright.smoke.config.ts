import { defineConfig } from "@playwright/test";

/**
 * Production smoke test (REVIEWER NOTE 06 P3): runs e2e/smoke.spec.ts against a deployed URL
 * (SMOKE_URL), with no local server and no database access. It edits the shared demo data, so run it
 * only right before resetting the demo database (npm run db:reset) and never against a live audience.
 *   SMOKE_URL=https://... npx playwright test -c playwright.smoke.config.ts
 */
const url = process.env.SMOKE_URL;
if (!url || !/^https:\/\//.test(url)) throw new Error("Set SMOKE_URL to the deployed https URL");

export default defineConfig({
  testDir: "e2e",
  testMatch: /smoke\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 10 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: url,
    viewport: { width: 1440, height: 900 },
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    actionTimeout: 30_000,
  },
});
