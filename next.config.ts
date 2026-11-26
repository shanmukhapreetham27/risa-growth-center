import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads live data from Postgres and renders per request (export const dynamic = "force-dynamic"
  // in app/layout.tsx), so Cache Components stay off: an edit shows on every page at once.
  // Settings > "Reset to original data" reads the CSVs and SQL migrations at runtime; ship them with the
  // server functions when deployed (Vercel).
  outputFileTracingIncludes: {
    "/**": ["./data/source_csv/**", "./data/simulated/**", "./db/migrations/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
