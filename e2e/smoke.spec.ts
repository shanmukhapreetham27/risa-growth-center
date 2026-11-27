/**
 * Production smoke test (REVIEWER NOTE 06 P3), against SMOKE_URL (playwright.smoke.config.ts):
 * 1. Overview loads from the demo database (24 confirmed at 20 Apr 2025).
 * 2. One edit persists after a reload (O028 to partner_confirmed on Pipeline; Overview then shows 25).
 * 3. The copilot answers Q01 and states the as of date.
 * 4. A proposed task appears on Tasks only after Confirm.
 * It writes to the shared demo data: reset the demo database afterwards (npm run db:reset).
 * Writes reports/phase-4-smoke.md with what it saw.
 */
import { writeFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });
const log: string[] = [];

test.afterAll(() => {
  writeFileSync("reports/phase-4-smoke.md", [`# Production smoke test, ${new Date().toISOString()}`, "", `URL: ${process.env.SMOKE_URL}`, "", ...log, ""].join("\n"), "utf8");
});

async function ask(page: Page, question: string) {
  const panel = page.getByTestId("copilot-panel");
  const before = await panel.getByTestId("copilot-assistant-turn").count();
  await panel.getByTestId("copilot-input").fill(question);
  await panel.getByTestId("copilot-send").click();
  await expect(panel.getByTestId("copilot-assistant-turn")).toHaveCount(before + 1, { timeout: 5 * 60_000 });
  const turn = panel.getByTestId("copilot-assistant-turn").last();
  const answer = (await turn.getByTestId("copilot-answer").getAttribute("data-markdown").catch(() => null)) ?? (await turn.innerText());
  log.push(`**User:** ${question}`, "", "**Copilot:**", "", answer.trim(), "");
  return { turn, answer };
}

test("1-2. Overview loads; an edit on Pipeline persists after reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("confirmed-count")).toHaveText("24");
  log.push("1. Overview: confirmed partnerships 24 at 20 Apr 2025.", "");

  await page.goto("/pipeline?opp=O028");
  const drawer = page.getByTestId("opportunity-drawer");
  await drawer.getByLabel("New stage").selectOption("partner_confirmed");
  await drawer.getByRole("button", { name: "Save stage" }).click();
  await expect(drawer.getByRole("status")).toContainText("O028 moved to partner_confirmed");
  await page.reload();
  await expect(page.getByTestId("opportunity-drawer").getByTestId("drawer-stage")).toHaveText("Partner confirmed");
  await page.goto("/");
  await expect(page.getByTestId("confirmed-count")).toHaveText("25");
  log.push("2. Pipeline: O028 moved to partner_confirmed; after a reload the drawer still shows Partner confirmed and Overview shows 25.", "");
});

test("3-4. Copilot answers Q01 with the as of date; a proposed task appears only after Confirm", async ({ page, context }) => {
  await page.goto("/");
  await page.getByTestId("copilot-toggle").click();
  await expect(page.getByTestId("copilot-panel")).toBeVisible();
  log.push("3. Copilot, Q01:", "");
  const q1 = await ask(page, "How many confirmed partnerships do we have and how does that compare with the goal?");
  expect(q1.answer).toMatch(/20 Apr(il)? 2025/);
  expect(q1.answer).toMatch(/\b28\b/);

  log.push("4. Copilot task, confirm gated:", "");
  const tasks = await context.newPage();
  await tasks.goto("/tasks");
  const copilotRows = () => tasks.locator("[data-testid^=task-]").filter({ hasText: "Copilot" });
  const before = await copilotRows().count();
  const { turn } = await ask(page, "Create a task for Kabir Shah to chase the overdue installments, due 25 April 2025.");
  const card = turn.locator("[data-testid^=proposal-P-]").first();
  await expect(card).toBeVisible();
  await tasks.reload();
  await expect(copilotRows()).toHaveCount(before);
  log.push(`Before Confirm: Tasks shows ${before} copilot task(s).`, "");
  await card.getByTestId("proposal-confirm").click();
  await expect(card.getByTestId("proposal-result")).toBeVisible({ timeout: 60_000 });
  log.push(`After Confirm: ${(await card.getByTestId("proposal-result").innerText()).trim()}`, "");
  await tasks.reload();
  await expect(copilotRows()).toHaveCount(before + 1);
  log.push(`Tasks now shows ${before + 1} copilot task(s): ${(await copilotRows().last().innerText()).replace(/\s+/g, " ").trim()}`, "");
});
