import { test, expect } from "@playwright/test";
import { ensurePendingListForSuperadmin, apiJson } from "./helpers";

async function loginPossiblyChangePassword(page, { username, password }) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();

  await page.waitForURL(/\/(change-password|superadmin\/dashboard|student\/dashboard)$/, { timeout: 30_000 });

  if (page.url().includes("/change-password")) {
    const newPassword = `${password}1`;
    await page.getByPlaceholder("Current password").fill(password);
    await page.getByPlaceholder("New password").fill(newPassword);
    await page.getByRole("button", { name: "Update password" }).click();

    // After password change, app logs out.
    await page.waitForURL("**/login", { timeout: 30_000 });

    await page.getByLabel("Username").fill(username);
    await page.locator("#password").fill(newPassword);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("**/student/dashboard", { timeout: 30_000 });
    return newPassword;
  }

  return password;
}

test("SuperAdmin publishes results and student can view exam result", async ({ browser }) => {
  const { fixture, saCtx, saToken, examCycleId, listId, studentUsername, studentPassword } = await ensurePendingListForSuperadmin();

  // Approve as SuperAdmin (API) with required worksheet selection.
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

  // Student submits the exam (UI) so results exist.
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  const finalStudentPassword = await loginPossiblyChangePassword(studentPage, {
    username: studentUsername,
    password: studentPassword
  });

  await studentPage.goto("/student/exams");
  await expect(studentPage.getByRole("heading", { name: "My Exams" })).toBeVisible();

  const startLink = studentPage.getByRole("link", { name: "Start" }).first();
  await expect(startLink).toBeVisible();
  await startLink.click();

  await expect(studentPage.getByText(/Question 1/)).toBeVisible();
  await studentPage.getByLabel("Answer for question 1").fill("3");
  await studentPage.getByLabel("Answer for question 2").fill("2");
  await studentPage.getByLabel("Answer for question 3").fill("6");

  await studentPage.getByRole("button", { name: "End Test" }).click();
  const dialog = studentPage.getByRole("dialog", { name: "Confirm submit" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "End test" }).click();
  await expect(studentPage.getByRole("status")).toContainText("Submitted");

  // SuperAdmin publishes results (UI).
  const saContext = await browser.newContext();
  const saPage = await saContext.newPage();

  await saPage.goto("/login");
  await saPage.getByLabel("Username").fill(fixture.users.superadmin.username);
  await saPage.locator("#password").fill(fixture.password);
  await saPage.getByRole("button", { name: "Log in" }).click();
  await saPage.waitForURL("**/superadmin/dashboard", { timeout: 30_000 });

  await saPage.goto(`/superadmin/exam-cycles/${examCycleId}/results`);
  await expect(saPage.getByRole("heading", { name: "Exam Results" })).toBeVisible();

  // Publish.
  saPage.once("dialog", (d) => d.accept());
  await saPage.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(saPage.getByText(/Status:\s*/)).toContainText("PUBLISHED");

  // Student can now see "View" and open result page.
  await studentPage.goto("/student/exams");
  const viewLink = studentPage.locator(`a[href="/student/exams/${examCycleId}/result"]`);
  await expect(viewLink).toBeVisible();

  // Navigate directly (more stable than relying on SPA click behavior under heavy parallelism).
  await studentPage.goto(`/student/exams/${examCycleId}/result`);

  await expect(studentPage.getByRole("heading", { name: "Exam Result" })).toBeVisible();
  await expect(studentPage.getByText("PUBLISHED")).toBeVisible();

  await saContext.close();
  await studentContext.close();
});
