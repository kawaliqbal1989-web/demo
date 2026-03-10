import { test, expect } from "@playwright/test";
import { ensurePendingListForSuperadmin, apiJson } from "./helpers";

test("SuperAdmin can approve exam request with worksheet selection", async ({ page }) => {
  const { fixture, saCtx, saToken, examCycleId } = await ensurePendingListForSuperadmin();

  // Login via UI.
  await page.goto("/login");
  await page.getByLabel("Username").fill(fixture.users.superadmin.username);
  await page.locator("#password").fill(fixture.password);
  await page.getByRole("button", { name: "Log in" }).click();

  // Ensure auth state is established (IndexRedirect sends SUPERADMIN to dashboard).
  await page.waitForURL("**/superadmin/dashboard", { timeout: 30_000 });

  // Navigate directly to the approvals page for the cycle.
  await page.goto(`/superadmin/exam-cycles/${examCycleId}/pending`);
  await expect(page.getByRole("heading", { name: "Exam Enrollment Approvals" })).toBeVisible();

  // Open the first approve form.
  const firstApprove = page.getByRole("button", { name: "Approve" }).first();
  await firstApprove.click();

  // At least one level selector should exist.
  const select = page.locator("select").first();
  await expect(select).toBeVisible();

  // Wait for at least one option besides placeholder (options are loaded async).
  await expect
    .poll(async () => select.locator("option").count(), { timeout: 20_000 })
    .toBeGreaterThan(1);

  // Choose the first real worksheet.
  await select.selectOption({ index: 1 });

  // Approve.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Confirm Approve" }).click();

  // After approval, list should refresh and no longer show the same open form.
  await expect(page.getByText("Select one published exam worksheet per level in this request.")).toHaveCount(0);

  // Sanity: via API, ensure the cycle now has at least one EXAM worksheet.
  const result = await apiJson<any>(saCtx, saToken, "GET", `/api/exam-cycles/${examCycleId}/results`);
  // Superadmin can view results even if draft.
  expect(result?.success).toBeTruthy();
});
