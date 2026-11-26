import { defineConfig } from "vitest/config";

// Tests run in UTC (like Vercel) while the owner's machine is in IST: the engine must not depend
// on the machine time zone. Set before workers fork so every worker inherits it.
process.env.TZ = "UTC";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Aborts the whole run unless DATABASE_URL_TEST is a different Neon endpoint than the demo DB.
    globalSetup: ["tests/global-setup.ts"],
    // All DB tests share the one test branch: run files one after another.
    fileParallelism: false,
    pool: "forks",
    env: { TZ: "UTC" },
    testTimeout: 60_000,
    hookTimeout: 240_000,
  },
});
