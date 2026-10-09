import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
import { loadConfig } from "./e2e/harness/config";

// One id per run, inherited by workers and the server launcher.
process.env.E2E_RUN ??= Date.now().toString(36);
const cfg = loadConfig();

const LOCAL_CHROMIUM = "/Applications/Chromium.app/Contents/MacOS/Chromium";
/** E2E_CHROMIUM_PATH overrides; otherwise the local Chromium app if present; otherwise Playwright's own (`pnpm exec playwright install chromium`). */
const executablePath = process.env.E2E_CHROMIUM_PATH ?? (existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined);

const viewports = [
  { name: "w360", width: 360, height: 780 },
  { name: "w390", width: 390, height: 844 },
  { name: "w1280", width: 1280, height: 800 },
];

export default defineConfig({
  testDir: "./e2e/tests",
  outputDir: "./e2e/.output",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: Number(process.env.E2E_WORKERS ?? 3),
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/support/global-setup.ts",
  globalTeardown: "./e2e/support/global-teardown.ts",
  use: {
    baseURL: cfg.baseUrl,
    acceptDownloads: true,
    launchOptions: executablePath ? { executablePath } : {},
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "pnpm exec tsx e2e/harness/fake-asaas.ts",
      url: `${cfg.asaasUrl}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "pnpm exec tsx e2e/harness/serve.ts",
      url: `${cfg.baseUrl}/api/events`,
      reuseExistingServer: false,
      timeout: 240_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
  projects: [
    { name: "guard", testMatch: /guard\.spec\.ts/ } /* guard.spec.ts + network-guard.spec.ts: viewport-independent, run once */,
    ...viewports.map((v) => ({
      name: v.name,
      testIgnore: /guard\.spec\.ts/,
      use: {
        viewport: { width: v.width, height: v.height },
        isMobile: v.width < 800,
        hasTouch: v.width < 800,
      },
    })),
  ],
});
