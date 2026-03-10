import { test, expect } from "@playwright/test";
import { ensurePendingListForSuperadmin, apiJson } from "./helpers";

test("Student can see assigned exam and submit (End Test)", async ({ page }) => {
  const { fixture, saCtx, saToken, examCycleId, listId, studentUsername, studentPassword } = await ensurePendingListForSuperadmin();

  // Approve as SuperAdmin (API) with required worksheet selection to make an exam worksheet exist.
  const breakdown = await apiJson<any>(
    saCtx,
    saToken,
    "GET",
    `/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/level-breakdown`
  );

  const levels: any[] = Array.isArray(breakdown?.data) ? breakdown.data : [];
  expect(levels.length).toBeGreaterThan(0);

  const selections = levels.map((l) => ({ levelId: l.levelId, worksheetId: fixture.baseWorksheet.id }));
  await apiJson<any>(
    saCtx,
    saToken,
    "POST",
    `/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/approve`,
    { selections }
  );

  // Login as the temporary student.
  await page.goto("/login");
  await page.getByLabel("Username").fill(studentUsername);
  await page.locator("#password").fill(studentPassword);
  await page.getByRole("button", { name: "Log in" }).click();

  // Wait for either the dashboard or forced password change.
  await page.waitForURL(/\/(student\/dashboard|change-password)$/, { timeout: 30_000 });

  // Some student accounts may be forced to change password on first login.
  const newPassword = `${studentPassword}1`;

  if (page.url().includes("/change-password")) {
    await page.getByPlaceholder("Current password").fill(studentPassword);
    await page.getByPlaceholder("New password").fill(newPassword);
    await page.getByRole("button", { name: "Update password" }).click();

    // After password change, app logs out; wait for /login. If it doesn't navigate, use the provided button.
    try {
      await page.waitForURL("**/login", { timeout: 20_000 });
    } catch {
      const backToLogin = page.getByRole("button", { name: "Back to login" });
      if (await backToLogin.isVisible().catch(() => false)) {
        await backToLogin.click();
        await page.waitForURL("**/login", { timeout: 20_000 });
      } else {
        throw new Error("Password change completed but did not return to login");
      }
    }

    await page.getByLabel("Username").fill(studentUsername);
    await page.locator("#password").fill(newPassword);
    await page.getByRole("button", { name: "Log in" }).click();
  }

  await page.waitForURL("**/student/dashboard", { timeout: 30_000 });

  // Exams page should show a Start button (exam window is live in fixture).
  await page.goto("/student/exams");
  await expect(page.getByRole("heading", { name: "My Exams" })).toBeVisible();

  const startLink = page.getByRole("link", { name: "Start" }).first();
  await expect(startLink).toBeVisible();
  await startLink.click();

  // Fill a couple of answers.
  await expect(page.getByText(/Question 1/)).toBeVisible();
  await page.getByLabel("Answer for question 1").fill("3");
  await page.getByLabel("Answer for question 2").fill("2");
  await page.getByLabel("Answer for question 3").fill("6");

  // End Test and confirm.
  await page.getByRole("button", { name: "End Test" }).click();
  const dialog = page.getByRole("dialog", { name: "Confirm submit" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "End test" }).click();

  await expect(page.getByRole("status")).toContainText("Submitted");
});
