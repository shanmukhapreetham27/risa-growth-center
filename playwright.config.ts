import { defineConfig } from "@playwright/test";
import { assertTestDatabase } from "./lib/db/guard";
import { loadEnv } from "./lib/env";

// Same guard as the unit tests (CLAUDE.md rule 3): abort before anything starts unless DATABASE_URL_TEST
// is a different Neon endpoint than the demo DB. The app under test runs with every database variable
// pointed at the test branch (scripts/test-server.ts).
loadEnv();
assertTestDatabase(process.env);

const PORT = 3200;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    trace: "retain-on-failure",
    // A click that can never land (e.g. a covered button) fails after 30 s instead of hanging the test.
    actionTimeout: 30_000,
  },
  projects: [
    { name: "e2e", testMatch: /(flows|layout)\.spec\.ts/ },
    { name: "screens", testMatch: /screens\.spec\.ts/ },
    // Live model, run by hand once (npm run demo:rehearse); never part of test:e2e.
    { name: "demo", testMatch: /demo\.spec\.ts/ },
  ],
  webServer: {
    command: `npx tsx scripts/test-server.ts start ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
  },
});
