import { test, expect } from "@playwright/test";
import { ensurePendingListForSuperadmin } from "./helpers";

test("SuperAdmin can export enrollment list CSV and results CSV", async ({ page }) => {
  const { fixture, examCycleId } = await ensurePendingListForSuperadmin();

  // Login as SuperAdmin.
  await page.goto("/login");
  await page.getByLabel("Username").fill(fixture.users.superadmin.username);
  await page.locator("#password").fill(fixture.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/superadmin/dashboard", { timeout: 30_000 });

  // Enrollment list export from approvals page.
  await page.goto(`/superadmin/exam-cycles/${examCycleId}/pending`);
  await expect(page.getByRole("heading", { name: "Exam Enrollment Approvals" })).toBeVisible();

  const download1 = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).first().click();
  const file1 = await download1;
  expect(await file1.path()).toBeTruthy();

  // Results export from results page.
  await page.goto(`/superadmin/exam-cycles/${examCycleId}/results`);
  await expect(page.getByRole("heading", { name: "Exam Results" })).toBeVisible();

  const download2 = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const file2 = await download2;
  expect(await file2.path()).toBeTruthy();
});
