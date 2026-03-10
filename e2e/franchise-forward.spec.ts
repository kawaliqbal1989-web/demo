import { test, expect } from "@playwright/test";
import { ensurePendingListForFranchise } from "./helpers";

test("Franchise can forward pending combined list to BP", async ({ page }) => {
  const { examCycleId, franchiseUsername, franchisePassword } = await ensurePendingListForFranchise();

  await page.goto("/login");
  await page.getByLabel("Username").fill(franchiseUsername);
  await page.locator("#password").fill(franchisePassword);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/franchise/overview", { timeout: 30_000 });

  await page.goto(`/franchise/exam-cycles/${examCycleId}/pending`);
  await expect(page.getByRole("heading", { name: "Pending Exam Enrollment Lists" })).toBeVisible();

  // There should be at least one row with Forward.
  const forwardBtn = page.getByRole("button", { name: "Forward" }).first();
  await expect(forwardBtn).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await forwardBtn.click();

  // After forwarding, list should be empty for this fixture.
  await expect(page.getByText("No results")).toBeVisible();
});
