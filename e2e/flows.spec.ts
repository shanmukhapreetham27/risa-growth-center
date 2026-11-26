/**
 * End to end flows (REVIEWER NOTE 04, Phase 2 item 6) on the test branch, in order:
 * confirm on Pipeline -> Overview 25 at 20 Apr and 15 at 10 Mar; record a payment -> cash collected rises
 * by that amount; target change -> Overview goal; pause a campaign; create a task; Reset -> 24.
 */
import { expect, type Page, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const rupees = (s: string | null) => Number((s ?? "").replace(/[^\d-]/g, ""));

async function setSimDate(page: Page, date: string) {
  const input = page.getByTestId("sim-date");
  await input.fill(date);
  await expect(page.getByTestId("sim-date")).toHaveValue(date);
  await expect(page.getByText("Updating…")).toHaveCount(0);
}

test("Pipeline: confirming an open opportunity shows 25 on Overview at 20 Apr and 15 at 10 Mar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("confirmed-count")).toHaveText("24");

  // O028 Cedar Pantry: cash, negotiating, ₹1,10,000.
  await page.goto("/pipeline?opp=O028");
  const drawer = page.getByTestId("opportunity-drawer");
  await expect(drawer.getByTestId("drawer-stage")).toHaveText("Negotiating");
  await drawer.getByLabel("New stage").selectOption("partner_confirmed");
  await drawer.getByRole("button", { name: "Save stage" }).click();
  await expect(drawer.getByRole("status")).toContainText("O028 moved to partner_confirmed");
  await expect(drawer.getByTestId("drawer-stage")).toHaveText("Partner confirmed");

  await page.goto("/");
  await expect(page.getByTestId("confirmed-count")).toHaveText("25");
  await setSimDate(page, "2025-03-10");
  await expect(page.getByTestId("confirmed-count")).toHaveText("15");
  await setSimDate(page, "2025-04-20");
  await expect(page.getByTestId("confirmed-count")).toHaveText("25");
});

test("Collections: recording a payment raises cash collected by that amount", async ({ page }) => {
  await page.goto("/collections");
  const before = rupees(await page.getByTestId("kpi-collected-value").textContent());
  const row = page.getByTestId("inst-PAY032");
  const amount = rupees(await row.locator("td").nth(3).textContent());
  expect(amount).toBe(47500);
  await row.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByTestId("inst-status-PAY032")).toHaveText("paid");
  await expect(page.getByTestId("kpi-collected-value")).toHaveText(`₹${(before + amount).toLocaleString("en-IN")}`);

  await page.goto("/");
  await expect(page.getByTestId("cash-collected")).toHaveText(`₹${(before + amount).toLocaleString("en-IN")}`);
});

test("Settings: a target change changes the goal on Overview", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("confirmed-goal")).toHaveText("28");
  await page.goto("/settings");
  const form = page.getByTestId("targets-form");
  await form.getByLabel("Confirmed partnerships goal").fill("30");
  await form.getByRole("button", { name: "Save new targets" }).click();
  await expect(form.getByRole("status")).toContainText('"App plan 1"');
  await page.goto("/");
  await expect(page.getByTestId("confirmed-goal")).toHaveText("30");
});

test("Campaigns: a paused campaign shows paused", async ({ page }) => {
  await page.goto("/campaigns");
  const form = page.getByTestId("status-form-SC01");
  await form.getByRole("combobox").selectOption("paused");
  await form.getByRole("button", { name: "Set status" }).click();
  await expect(page.getByTestId("status-SC01")).toHaveText("paused");
  await page.goto("/");
  await expect(page.getByTestId("campaign-row-SC01")).toContainText("paused");
});

test("Tasks: a new task appears with its owner and due date", async ({ page }) => {
  await page.goto("/tasks");
  await page.getByTestId("new-task").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Follow up top negotiating deals (e2e)");
  await dialog.getByLabel("Owner").selectOption("T01");
  await dialog.getByLabel("Due date").fill("2025-04-25");
  await dialog.getByRole("button", { name: "Create task" }).click();
  const row = page.getByRole("row", { name: /Follow up top negotiating deals \(e2e\)/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Riya Kapoor");
  await expect(row).toContainText("25 Apr 2025");
  await expect(row).toContainText("user");
});

test("Settings: Recent changes lists the writes above, newest first (U3)", async ({ page }) => {
  await page.goto("/settings");
  const recent = page.getByTestId("recent-changes");
  await expect(recent).toBeVisible();
  const actions = await recent.locator("tbody tr td:nth-child(3)").allInnerTexts();
  expect(actions[0]).toBe("task.create");
  expect(actions).toEqual(expect.arrayContaining(["opportunity.change", "installment.create", "payment.record", "targets.change", "campaign.status", "task.create", "settings.update"]));
  await expect(recent.locator("tbody tr").first()).toContainText("User");
});

test("Pipeline: open deals first, then confirmed, then lost or withdrawn, tie break inside each (U4)", async ({ page }) => {
  await page.goto("/pipeline");
  const groups = await page.locator("[data-testid^=group-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  expect(groups).toEqual(["group-open", "group-confirmed", "group-closed"]);
  const ids = await page.locator("[data-testid^=opp-row-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("opp-row-", "")));
  // O028 was confirmed in the first flow, so the open group starts with the six ₹90,000 ties in tie-break order.
  expect(ids.slice(0, 6)).toEqual(["O053", "O038", "O048", "O058", "O033", "O043"]);
  await expect(page.getByTestId("stage-O028")).toHaveText("Partner confirmed");
});

test("Settings: Reset to original data returns 24 confirmed and the original goal", async ({ page }) => {
  await page.goto("/settings");
  await page.getByTestId("reset-open").click();
  await page.getByTestId("reset-confirm").click();
  await expect(page.getByRole("status").filter({ hasText: "Reset done" })).toBeVisible({ timeout: 90_000 });
  await page.goto("/");
  await expect(page.getByTestId("confirmed-count")).toHaveText("24");
  await expect(page.getByTestId("confirmed-goal")).toHaveText("28");
  await expect(page.getByTestId("cash-collected")).toHaveText("₹18,42,500");
  await page.goto("/campaigns");
  await expect(page.getByTestId("status-SC01")).toHaveText("active");
  await page.goto("/settings");
  await expect(page.getByTestId("recent-changes-empty")).toBeVisible();
});
