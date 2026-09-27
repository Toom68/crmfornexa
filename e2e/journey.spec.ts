import { test, expect } from "@playwright/test";

// The phase-1 journey, end to end. Requires: dev server on :3001 (or BASE_URL),
// seeded admin account (npm run db:seed).
// Providers run in simulation mode without API keys — outbound sends are
// clearly labelled "simulated" and never leave the system.

const BASE = process.env.BASE_URL ?? "http://localhost:3001";

test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill("admin@nexa.test");
  await page.getByLabel("Password").fill("nexa-admin-2026");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/today/);
});

test("today page loads with attention panels", async ({ page }) => {
  await expect(page.getByText("Replies waiting")).toBeVisible();
  await expect(page.getByText("Follow-ups due")).toBeVisible();
  await expect(page.getByText("Articles needing attention")).toBeVisible();
});

test("add a prospect manually and it lands in the list", async ({ page }) => {
  const stamp = Date.now();
  await page.goto(`${BASE}/prospects/new`);
  await page.getByLabel("Business name").fill(`E2E Bathrooms ${stamp}`);
  await page.getByLabel("Website").fill(`https://e2e-${stamp}.example.com`);
  await page.getByLabel("City").fill("Melbourne");
  await page.getByRole("button", { name: "Create business" }).click();
  await expect(page).toHaveURL(/\/prospects\//);
  await expect(page.getByText(`E2E Bathrooms ${stamp}`)).toBeVisible();
});

test("private links 404 for invalid tokens and never leak internals", async ({ page }) => {
  const res = await page.goto(`${BASE}/a/this-token-does-not-exist`);
  expect(res?.status()).toBe(404);
  await expect(page.getByText("internal")).toHaveCount(0);
});

test("message composer renders and simulates without providers", async ({ page }) => {
  await page.goto(`${BASE}/prospects`);
  await page.getByRole("link", { name: /SAMPLE/i }).first().click();
  await page.getByRole("tab", { name: /Messages/ }).click();
  await expect(page.getByText("Send a message")).toBeVisible();
});
