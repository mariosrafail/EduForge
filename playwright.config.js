import { defineConfig } from "@playwright/test";
import { requireHostedE2EEnvironment } from "./scripts/_e2e-staging.mjs";
import { readLocalMultiSchoolMarker } from "./scripts/_local-multi-school.mjs";

const baseURL = requireHostedE2EEnvironment();
const localPilot = process.env.E2E_LOCAL_CONFIRMATION === "isolated-local-pilot";
const multiSchool = Boolean(readLocalMultiSchoolMarker());

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: multiSchool ? ["local-multi-school.spec.js", "platform-admin-local.spec.js"] : undefined,
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
  projects: localPilot || multiSchool
    ? [{ name: "chromium", use: { browserName: "chromium" } }]
    : [
        { name: "chromium", use: { browserName: "chromium" } },
        { name: "firefox", use: { browserName: "firefox" } },
        { name: "webkit", use: { browserName: "webkit" } },
      ],
});
