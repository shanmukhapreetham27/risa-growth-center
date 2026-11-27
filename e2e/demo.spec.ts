/**
 * Demo rehearsal (REVIEWER NOTE 05 Phase 3 item 7): drives the copilot panel through SPEC §6.5 steps 1 to 7
 * on the test branch with the live model, saving reports/phase-4-demo/transcript.md (DEMO_OUT overrides) and one screenshot per
 * step. Run once by hand (npm run demo:rehearse); not part of CI.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { makeSql } from "../lib/db/client";
import { assertTestDatabase } from "../lib/db/guard";
import { resetDatabase } from "../lib/db/reset";
import { loadEnv } from "../lib/env";

const OUT = process.env.DEMO_OUT ?? "reports/phase-4-demo";
const lines: string[] = [];
const log = (...l: string[]) => lines.push(...l);

test.describe.configure({ mode: "serial" });
test.setTimeout(15 * 60_000);

test.beforeAll(async () => {
  loadEnv();
  assertTestDatabase(process.env);
  const sql = makeSql(process.env.DATABASE_URL_TEST!, { max: 1 });
  try {
    await resetDatabase(sql);
  } finally {
    await sql.end();
  }
  mkdirSync(OUT, { recursive: true });
  log(`# Demo rehearsal (SPEC §6.5), ${new Date().toISOString()}`, "", "App on the Neon test branch (freshly reset, simulation date 2025-04-20), live model, driven by Playwright at 1440 x 900.", "");
});

test.afterAll(() => {
  writeFileSync(`${OUT}/transcript.md`, lines.join("\n"), "utf8");
});

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  log(`Screenshot: \`${name}.png\``, "");
}

async function openPanel(page: Page) {
  if (!(await page.getByTestId("copilot-panel").isVisible().catch(() => false))) await page.getByTestId("copilot-toggle").click();
  await expect(page.getByTestId("copilot-panel")).toBeVisible();
}

/** The open panel covers the header toggle, so close it with its own Close button. */
async function closePanel(page: Page) {
  await page.getByTestId("copilot-panel").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("copilot-panel")).toBeHidden();
}

async function ask(page: Page, question: string) {
  const panel = page.getByTestId("copilot-panel");
  const before = await panel.getByTestId("copilot-assistant-turn").count();
  await panel.getByTestId("copilot-input").fill(question);
  const t0 = Date.now();
  await panel.getByTestId("copilot-send").click();
  await expect(panel.getByTestId("copilot-working")).toBeVisible();
  await expect(panel.getByTestId("copilot-assistant-turn")).toHaveCount(before + 1, { timeout: 5 * 60_000 });
  const turn = panel.getByTestId("copilot-assistant-turn").last();
  // Raw markdown as the model wrote it; the collapsed "Data used" list is read with textContent (innerText of hidden text is empty).
  const answer = (await turn.getByTestId("copilot-answer").getAttribute("data-markdown").catch(() => null)) ?? (await turn.innerText());
  const used = await turn
    .getByTestId("data-used")
    .locator("li")
    .evaluateAll((els) => els.map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()))
    .catch(() => [] as string[]);
  log(`**User:** ${question}`, "", `**Copilot** (${((Date.now() - t0) / 1000).toFixed(1)} s):`, "", answer.trim(), "");
  if (used.length) log("Data used:", "", ...used.map((u) => `- ${u}`), "");
  return turn;
}

test("SPEC §6.5 demo, steps 1 to 7", async ({ page }) => {
  // Step 1
  log("## Step 1. Overview at 20 Apr", "");
  await page.goto("/");
  await expect(page.getByTestId("confirmed-count")).toHaveText("24");
  const goal = await page.getByTestId("confirmed-goal").innerText();
  const badges = await page.locator("[data-testid^=campaign-row-]").evaluateAll((rows) =>
    rows.map((r) => `${r.getAttribute("data-testid")!.replace("campaign-row-", "")} ${r.querySelector("[data-badge]")?.getAttribute("data-badge")}`),
  );
  log(`Confirmed partnerships 24 vs goal ${goal}. Badges: ${badges.join(", ")}.`, "");
  await shot(page, "step-1-overview");

  // Step 2
  log("## Step 2. Why are we behind?", "");
  await openPanel(page);
  await ask(page, "Why are we behind on partnerships?");
  await shot(page, "step-2-why-behind");

  // Step 3
  log("## Step 3. Follow up: stuck deals by value", "");
  await ask(page, "Which stuck deals are worth the most?");
  await shot(page, "step-3-stuck-deals");

  // Step 4
  log("## Step 4. Two actions, confirmed by the user", "");
  const turn = await ask(page, "Pause Brand Discovery Email and create a task for Riya to follow up the top negotiating deals by 25 April");
  const cards = turn.locator("[data-testid^=proposal-P-]");
  await expect(cards).toHaveCount(2);
  const cardText = await cards.allInnerTexts();
  log("Proposal cards:", "", ...cardText.map((c) => `- ${c.replace(/\s+/g, " ").trim()}`), "");
  await shot(page, "step-4a-proposals");
  for (let i = 0; i < 2; i++) {
    await cards.nth(i).getByTestId("proposal-confirm").click();
    await expect(cards.nth(i).getByTestId("proposal-result")).toBeVisible({ timeout: 60_000 });
  }
  log("After Confirm:", "", ...(await turn.getByTestId("proposal-result").allInnerTexts()).map((r) => `- ${r}`), "");
  await shot(page, "step-4b-confirmed");

  // Step 5 (client-side navigation keeps the conversation)
  log("## Step 5. The writes show on the pages", "");
  await closePanel(page);
  await page.getByRole("link", { name: "Campaigns", exact: true }).click();
  await expect(page.getByTestId("status-SC01")).toHaveText("paused");
  log("Campaigns: SC01 Brand Discovery Email is paused.", "");
  await shot(page, "step-5a-campaigns");
  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  const copilotRow = page.locator("[data-testid^=task-]").filter({ hasText: "Copilot" }).first();
  await expect(copilotRow).toBeVisible();
  log(`Tasks: ${(await copilotRow.innerText()).replace(/\s+/g, " ").trim()}`, "");
  await shot(page, "step-5b-tasks");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const recent = page.getByTestId("recent-changes");
  await expect(recent).toContainText("campaign.status");
  await expect(recent).toContainText("task.create");
  await recent.scrollIntoViewIfNeeded();
  log("Recent changes (audit_log):", "", ...(await recent.locator("tbody tr").allInnerTexts()).map((r) => `- ${r.replace(/\s+/g, " ").trim()}`), "");
  await shot(page, "step-5c-recent-changes");

  // Step 6
  log("## Step 6. A question the data cannot answer", "");
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await openPanel(page);
  await ask(page, "Why did Cobalt Learning withdraw?");
  await shot(page, "step-6-cobalt");

  // Step 7
  log("## Step 7. An edit on Pipeline shows on Overview and in the copilot", "");
  await closePanel(page);
  await page.getByRole("link", { name: "Pipeline", exact: true }).click();
  await page.getByTestId("open-O028").click();
  const drawer = page.getByTestId("opportunity-drawer");
  await drawer.getByLabel("New stage").selectOption("partner_confirmed");
  await drawer.getByRole("button", { name: "Save stage" }).click();
  await expect(drawer.getByRole("status")).toContainText("O028 moved to partner_confirmed");
  log(`Pipeline: ${await drawer.getByRole("status").innerText()}`, "");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByTestId("confirmed-count")).toHaveText("25");
  log("Overview: confirmed partnerships 25.", "");
  await shot(page, "step-7a-overview-25");
  await openPanel(page);
  await ask(page, "How many confirmed partnerships do we have now?");
  await shot(page, "step-7b-copilot-25");
});
