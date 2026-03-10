export default {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.js"],
  setupFiles: ["<rootDir>/tests/setup/env.setup.js"],
  globalSetup: "<rootDir>/tests/setup/global-setup.js",
  maxWorkers: 1,
  verbose: true,
  detectOpenHandles: true
};
