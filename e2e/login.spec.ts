import { test, expect } from "@playwright/test";

test("Login page loads", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Welcome back")).toBeVisible();
});
