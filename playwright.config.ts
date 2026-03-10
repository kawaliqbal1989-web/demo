import { defineConfig, devices } from "@playwright/test";

const webBaseURL = process.env.E2E_BASE_URL || "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  globalTeardown: "./e2e/global-teardown.ts",
  timeout: 60_000,
  expect: {
    timeout: 15_000
  },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: webBaseURL,
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  // Start both servers for local runs. If you already run them, Playwright will reuse.
  webServer: [
    {
      command: "node scripts/e2e-start-backend.mjs",
      url: "http://localhost:4000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    },
    {
      command: "node scripts/e2e-start-frontend.mjs",
      url: webBaseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ]
});
