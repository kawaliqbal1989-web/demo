import { test, expect } from "@playwright/test";
import { createE2EFixture } from "./db";

test("Center can create temp student and submit combined enrollment list", async ({ page }) => {
  const fixture = await createE2EFixture();

  // Login as Center.
  await page.goto("/login");
  await page.getByLabel("Username").fill(fixture.users.center.username);
  await page.locator("#password").fill(fixture.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/center/dashboard", { timeout: 30_000 });

  // Go directly to the enrollment page for our cycle.
  await page.goto(`/center/exam-cycles/${fixture.examCycle.id}`);
  await expect(page.getByText("Center Exam Enrollment")).toBeVisible();

  // Create a temporary student.
  const firstNameInput = page.locator('label:has-text("First Name")').locator("..").locator("input");
  const lastNameInput = page.locator('label:has-text("Last Name")').locator("..").locator("input");

  await firstNameInput.fill("Temp");
  await lastNameInput.fill("E2E");
  // Level select is pre-filled; keep as is.
  await page.getByRole("button", { name: "Create" }).click();

  // The page reloads the list after creation; assert the student shows up in the combined enrollment table.
  await expect(page.getByText("Temp E2E")).toBeVisible();
  await expect(page.getByText("Yes")).toBeVisible();

  // Submit to Franchise.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Submit to Franchise" }).click();

  await expect(page.getByText(/Status:\s*/)).toContainText("SUBMITTED_TO_FRANCHISE");
});
