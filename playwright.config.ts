import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // remote Postgres (Supabase pooler) makes each action a few round-trips —
  // assertions need headroom beyond the default 5 s
  expect: { timeout: 15_000 },
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:3000" },
  workers: 1,
});
