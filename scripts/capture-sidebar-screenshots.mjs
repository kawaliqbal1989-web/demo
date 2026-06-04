import fs from "fs/promises";
import { chromium } from "@playwright/test";

async function main() {
  await fs.mkdir("docs/reports/screenshots", { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto("http://127.0.0.1:5173/login", { waitUntil: "networkidle" });
  await page.fill("#username", "SA001");
  await page.fill("#password", "Pass@123");
  await page.click("button.login-primary");

  await page.waitForURL("**/superadmin/dashboard", { timeout: 30000 });
  await page.waitForTimeout(800);

  await page.screenshot({
    path: "docs/reports/screenshots/sidebar-expanded-superadmin.png",
    fullPage: true
  });

  await page.click('button[aria-label="Collapse sidebar"]');
  await page.waitForTimeout(600);

  await page.screenshot({
    path: "docs/reports/screenshots/sidebar-collapsed-superadmin.png",
    fullPage: true
  });

  await browser.close();
  console.log("screenshots_saved");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
