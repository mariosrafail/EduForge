import { defineConfig } from "@playwright/test";
import { requireHostedE2EEnvironment } from "./scripts/_e2e-staging.mjs";

const baseURL = requireHostedE2EEnvironment();
const localPilot = process.env.E2E_LOCAL_CONFIRMATION === "isolated-local-pilot";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: localPilot
    ? [{ name: "chromium", use: { browserName: "chromium" } }]
    : [
        { name: "chromium", use: { browserName: "chromium" } },
        { name: "firefox", use: { browserName: "firefox" } },
        { name: "webkit", use: { browserName: "webkit" } },
      ],
});
