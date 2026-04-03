import { defineConfig, devices } from "@playwright/test";

const backendPort = process.env.E2E_BACKEND_PORT || "4100";
const frontendPort = process.env.E2E_FRONTEND_PORT || "4173";
const apiBaseURL = process.env.E2E_API_BASE_URL || `http://localhost:${backendPort}`;
const webBaseURL = process.env.E2E_BASE_URL || `http://localhost:${frontendPort}`;

process.env.E2E_BACKEND_PORT = backendPort;
process.env.E2E_FRONTEND_PORT = frontendPort;
process.env.E2E_API_BASE_URL = apiBaseURL;
process.env.E2E_BASE_URL = webBaseURL;

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
      url: `${apiBaseURL}/health`.replace(/\/api$/, ""),
      reuseExistingServer: false,
      timeout: 120_000
    },
    {
      command: "node scripts/e2e-start-frontend.mjs",
      url: webBaseURL,
      reuseExistingServer: false,
      timeout: 120_000
    }
  ]
});
