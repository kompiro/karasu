import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";
import { SERVE_PORT } from "./fixtures/serve-env.js";

// CI worker count. `1` has been the shipped value since the foundation PR
// (#532). `PLAYWRIGHT_WORKERS` lets the nightly's `workflow_dispatch` measure
// another value without editing this file or `e2e.yml` (#3040, #3041); it is
// read here, in Node, so the input never reaches a shell line. Anything that
// is not a positive integer falls back to the shipped value.
//
// `2` was measured and not adopted (#3041): it roughly halves the suite, but
// p95 per test went over 5s in 3 of 6 runs and the serial at-0050 went over
// 60s once. The numbers and when to re-measure are on
// #3041.
const CI_WORKERS_DEFAULT = 1;
const ciWorkers = (() => {
  const raw = process.env.PLAYWRIGHT_WORKERS;
  const n = raw === undefined ? Number.NaN : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : CI_WORKERS_DEFAULT;
})();

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 5173);
const BASE_URL = `http://localhost:${PORT}`;

const webServerCommand = process.env.CI
  ? `pnpm --filter @karasu-tools/app exec vite build && pnpm --filter @karasu-tools/app exec vite preview --port ${PORT} --strictPort`
  : `pnpm --filter @karasu-tools/app exec vite --port ${PORT} --strictPort`;

type WebServer = Extract<NonNullable<PlaywrightTestConfig["webServer"]>, unknown[]>[number];

const appServer: WebServer = {
  command: webServerCommand,
  url: BASE_URL,
  reuseExistingServer: !process.env.CI,
  timeout: 180_000,
  stdout: "pipe",
  stderr: "pipe",
};

// Serve mode (`karasu serve`, AT-0032) runs against a second server (#3049).
// Playwright starts every `webServer` entry whatever `--project` says, so the
// entry and its project exist only under `E2E_SERVE=1`, which the nightly
// sets and `e2e.yml` does not: the PR gate neither builds the CLI nor fails
// when it cannot start (packages/cli is outside its path filter).
// `start-serve.ts` builds and stages the serve build the npm package ships
// (#3303), so this project does not depend on the first entry's app build.
const SERVE_SPECS = /at-(0032|3258)-/;
const serveEnabled = process.env.E2E_SERVE === "1";
const SERVE_URL = `http://localhost:${SERVE_PORT}`;

const serveServer: WebServer = {
  command: "pnpm exec tsx scripts/start-serve.ts",
  url: SERVE_URL,
  reuseExistingServer: !process.env.CI,
  timeout: 180_000,
  stdout: "pipe",
  stderr: "pipe",
};

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // retries: 0 everywhere — Phase 2 of #1008. Retries hid the
  // fail-then-retry-pass flake population (#973); 0 exposes remaining flake
  // immediately. Phase 1 (2 -> 1) landed in #1169; nightly stayed green for
  // 9 consecutive nights (5/10-5/18) before this drop.
  retries: 0,
  // 3x p95 of healthy runs (p95=5s, max=6s on the 5/4 nightly green baseline);
  // 30s default was ~5x the slowest healthy test and only consumed by hangs
  // (e.g. #1152 burned 90s/test with retries=2). See #1155.
  timeout: 15_000,
  workers: process.env.CI ? ciWorkers : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    // JSON reporter feeds `scripts/ci/playwright-flaky-summary.ts`, which
    // surfaces retry-pass (flaky) tests in CI (TPL-976 / #1271).
    ["json", { outputFile: "playwright-report/results.json" }],
  ],
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
    // App theme defaults to `system`, which resolves via prefers-color-scheme.
    // Playwright Chromium has no OS preference, so `system` falls through to
    // "light". AT-0053 hardcodes the dark-theme amber edge color (#F59E0B);
    // under the light palette the implicit-edge color is #D97706 and the
    // selectors find nothing. Pin colorScheme so the app renders the dark
    // palette every run. See #1487.
    colorScheme: "dark",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: SERVE_SPECS,
      use: { ...devices["Desktop Chrome"] },
    },
    ...(serveEnabled
      ? [
          {
            name: "serve",
            testMatch: SERVE_SPECS,
            use: { ...devices["Desktop Chrome"], baseURL: SERVE_URL },
          },
        ]
      : []),
  ],
  webServer: serveEnabled ? [appServer, serveServer] : [appServer],
});
