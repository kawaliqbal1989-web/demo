import { test, expect, devices } from "@playwright/test";

test.use({ ...devices["Pixel 5"] });

async function loginUI(page, username: string, password = "Pass@123") {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test("Center My Courses renders on mobile without horizontal overflow", async ({ page }) => {
  await loginUI(page, "CE001");
  await page.waitForURL("**/center/dashboard", { timeout: 30_000 });

  await page.goto("/center/courses");
  await expect(page.getByRole("heading", { name: "My Courses" })).toBeVisible();

  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasOverflow).toBeFalsy();
});

test("Franchise My Courses renders on mobile without horizontal overflow", async ({ page }) => {
  await loginUI(page, "FR001");
  await page.waitForURL("**/franchise/dashboard", { timeout: 30_000 });

  await page.goto("/franchise/courses");
  await expect(page.getByRole("heading", { name: "My Courses" })).toBeVisible();

  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasOverflow).toBeFalsy();
});
