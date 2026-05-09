import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 5173);
const BASE_URL = `http://localhost:${PORT}`;

const webServerCommand = process.env.CI
  ? `pnpm --filter @karasu-tools/app exec vite build && pnpm --filter @karasu-tools/app exec vite preview --port ${PORT} --strictPort`
  : `pnpm --filter @karasu-tools/app dev -- --port ${PORT} --strictPort`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // 3x p95 of healthy runs (p95=5s, max=6s on the 5/4 nightly green baseline);
  // 30s default was ~5x the slowest healthy test and only consumed by hangs
  // (e.g. #1152 burned 90s/test with retries=2). See #1155.
  timeout: 15_000,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Required by `replaceEditorContent` in fixtures/editor.ts — Monaco's
    // current build uses the EditContext API, so multi-line content must be
    // pasted via the clipboard to avoid auto-indent compounding on every
    // newline.
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: webServerCommand,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
