import { test, expect } from "@playwright/test";
import pg from "pg";
import "dotenv/config";

// The prospecting + customer journey, end to end. Requires: dev server on
// :3000 (or BASE_URL) and a seeded admin account (npm run db:seed).
// Providers run in simulation mode without API keys — outbound sends are
// clearly labelled "simulated" and never leave the system.
//
// Fixture rows are created directly in SQL (id = e2e-fixture-*) and every
// E2E-named business is deleted in afterAll — nothing lingers.

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function db() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

// A minimal real fixture covering each Today section + one customer.
test.beforeAll(async () => {
  const client = await db();
  await client.query(`DELETE FROM "Business" WHERE name LIKE 'E2E%'`);
  const now = new Date().toISOString();
  const past = new Date(Date.now() - 26 * 3600_000).toISOString();
  await client.query(
    `INSERT INTO "Business" (id, name, "salesStage", website, "nextAction", "nextActionAt", "createdAt", "updatedAt") VALUES
     ('e2e-fixture-reply',   'E2E Fixture Reply',   'CONTACTED',    'https://e2e-reply.example.com',   'Reply received: sounds interesting', $1, $2, $2),
     ('e2e-fixture-follow',  'E2E Fixture Followup','CONTACTED',    'https://e2e-follow.example.com',  'Follow up',                          $1, $2, $2),
     ('e2e-fixture-new',     'E2E Fixture New',     'NEW_PROSPECT', 'https://e2e-new.example.com',      NULL,                                NULL, $2, $2)`,
    [past, now],
  );
  await client.query(
    `INSERT INTO "Business" (id, name, "salesStage", "isCustomer", "customerSince", "createdAt", "updatedAt")
     VALUES ('e2e-fixture-customer', 'E2E Fixture Customer', 'WON', true, $1, $1, $1)`,
    [now],
  );
  await client.end();
});

test.afterAll(async () => {
  const client = await db();
  await client.query(`DELETE FROM "Business" WHERE name LIKE 'E2E%'`);
  await client.end();
});

const E2E_EMAIL = process.env.E2E_EMAIL ?? "";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "";

test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(E2E_EMAIL);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/today/);
});

test("today page loads with the work queue", async ({ page }) => {
  // fixtures guarantee all three sections are non-empty
  await expect(page.getByRole("heading", { name: "Waiting on you" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Due now" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Keep moving" })).toBeVisible();
});

test("add a prospect manually and it lands in the list", async ({ page }) => {
  const stamp = Date.now();
  await page.goto(`${BASE}/prospects/new`);
  await page.getByLabel("Business name").fill(`E2E Bathrooms ${stamp}`);
  await page.getByLabel("Website").fill(`https://e2e-${stamp}.example.com`);
  await page.getByLabel("City").fill("Melbourne");
  await page.getByRole("button", { name: "Create business" }).click();
  await expect(page.getByRole("heading", { name: `E2E Bathrooms ${stamp}` })).toBeVisible();
});

test("private links 404 for invalid tokens and never leak internals", async ({ page }) => {
  const res = await page.goto(`${BASE}/a/this-token-does-not-exist`);
  expect(res?.status()).toBe(404);
  await expect(page.getByText("internal")).toHaveCount(0);

  const res2 = await page.goto(`${BASE}/c/this-token-does-not-exist`);
  expect(res2?.status()).toBe(404);
  await expect(page.getByText("internal")).toHaveCount(0);
});

test("message composer renders and simulates without providers", async ({ page }) => {
  await page.goto(`${BASE}/prospects`);
  await page.getByRole("link", { name: /E2E Fixture Reply/ }).click();
  await page.getByRole("tab", { name: /Messages/ }).click();
  await expect(page.getByText("Send a message")).toBeVisible();
});

// -------------------- customer journey --------------------

test("customers page lists customer cards with package and payment state", async ({ page }) => {
  await page.goto(`${BASE}/customers`);
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  await expect(page.getByText("Active packages")).toBeVisible();
  await expect(page.getByText("Monthly value")).toBeVisible();
  await expect(page.getByText("Outstanding")).toBeVisible();
  await expect(page.getByText("E2E Fixture Customer")).toBeVisible();
  await expect(page.getByText("Ad-hoc").first()).toBeVisible();
});

test("won prospect converts to a customer with Plans and Billing tabs", async ({ page }) => {
  const stamp = Date.now();
  // create a fresh prospect, then flip it to WON directly (the stage select is
  // a Base UI widget — driving it in e2e is brittle, the conversion is what matters)
  await page.goto(`${BASE}/prospects/new`);
  await page.getByLabel("Business name").fill(`E2E Customer ${stamp}`);
  await page.getByLabel("Website").fill(`https://e2e-cust-${stamp}.example.com`);
  await page.getByRole("button", { name: "Create business" }).click();
  await expect(page.getByRole("heading", { name: `E2E Customer ${stamp}` })).toBeVisible();
  const url = page.url();
  const businessId = url.split("/prospects/")[1];

  const client = await db();
  await client.query(`UPDATE "Business" SET "salesStage" = 'WON' WHERE id = $1`, [businessId]);
  await client.end();

  await page.goto(url);
  await expect(page.getByText("Deal won")).toBeVisible();
  await page.getByRole("button", { name: /convert to customer/i }).click();
  await expect(page).toHaveURL(/tab=plans/);
  // customer badges + tabs
  await expect(page.getByText("Customer").first()).toBeVisible();
  await expect(page.getByRole("tab", { name: /Plans/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Billing/ })).toBeVisible();
});

test("customer workspace: create a month plan, add a topic, send for approval", async ({ page }) => {
  const stamp = Date.now();
  // fresh ad-hoc customer with an email (required to send the plan link)
  await page.goto(`${BASE}/customers/new`);
  await page.locator('input[name="name"]').fill(`E2E Plan ${stamp}`);
  await page.locator('input[name="email"]').fill(`e2e-${stamp}@example.com`);
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(page).toHaveURL(/tab=plans/);

  await page.getByRole("button", { name: "Create plan" }).click();
  await expect(page).toHaveURL(/\/plans\//);
  await expect(page.getByText("Add a topic")).toBeVisible();

  await page.locator('input[name="title"]').fill(`E2E topic ${stamp}`);
  await page.locator('input[name="scheduledFor"]').fill("2026-12-10");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(`E2E topic ${stamp}`)).toBeVisible();

  await page.getByRole("button", { name: /send for approval/i }).click();
  await expect(page.getByText(/Sent to the client/)).toBeVisible();
});

test("customer invoice: create, send, record a part payment", async ({ page }) => {
  const stamp = Date.now();
  await page.goto(`${BASE}/customers/new`);
  await page.locator('input[name="name"]').fill(`E2E Billing ${stamp}`);
  await page.getByRole("button", { name: "Add customer" }).click();
  await expect(page).toHaveURL(/tab=plans/);
  const url = page.url();

  await page.goto(url.replace("tab=plans", "tab=billing"));
  // open the new invoice form and add a line (scoped to the open <details>)
  await page.getByText("New invoice").click();
  const invoiceForm = page.locator("details[open]");
  await invoiceForm.locator('input[placeholder*="e.g."]').first().fill(`E2E article ${stamp}`);
  await invoiceForm.locator('input[placeholder="0.00"]').first().fill("250");
  await invoiceForm.getByRole("button", { name: "Create invoice" }).click();

  // draft invoice appears — send it (queues a simulated email + client link)
  await expect(page.getByText("INV-")).toBeVisible();
  await page.getByRole("button", { name: /send to client/i }).click();
  await expect(page.getByText("Record payment")).toBeVisible();

  // record a partial payment — invoice stays open with a remainder
  await page.getByText("Record payment").click();
  const paymentForm = page.locator("details[open]");
  await paymentForm.locator('input[name="amount"]').fill("100");
  await paymentForm.locator('input[name="reference"]').fill("e2e-part");
  await paymentForm.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/left/i)).toBeVisible();
});
