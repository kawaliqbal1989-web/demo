import { test, expect } from "@playwright/test";
import { ensurePendingListForBP } from "./helpers";

test("BP can forward pending combined list to SuperAdmin", async ({ page }) => {
  const { examCycleId, bpUsername, bpPassword } = await ensurePendingListForBP();

  await page.goto("/login");
  await page.getByLabel("Username").fill(bpUsername);
  await page.locator("#password").fill(bpPassword);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/bp/overview", { timeout: 30_000 });

  await page.goto(`/bp/exam-cycles/${examCycleId}/pending`);
  await expect(page.getByRole("heading", { name: "Pending Exam Enrollment Lists" })).toBeVisible();

  const forwardBtn = page.getByRole("button", { name: "Forward" }).first();
  await expect(forwardBtn).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await forwardBtn.click();

  await expect(page.getByText("No results")).toBeVisible();
});
