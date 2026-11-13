// Run e2e specs against a PR's Cloudflare preview instead of a local vite
// server, recording a video and a final screenshot of every test.
//
//   PR_VERIFY_E2E_DIR=<PR checkout>/packages/e2e \
//   PR_VERIFY_BASE_URL=https://<hash>.karasu.pages.dev \
//   PR_VERIFY_OUT=/abs/dir \
//   pnpm --dir <PR checkout>/packages/e2e exec playwright test \
//     -c <this file> [spec paths relative to the test dir…]
//
// PR_VERIFY_E2E_DIR is the packages/e2e of the PR's checkout, so the PR's own
// specs, fixtures and config are the ones used; this file only overrides what
// ties the run to a local server. Without it, the packages/e2e beside this
// skill is used.
//
// PR_VERIFY_TEST_DIR=/abs/dir runs the throwaway specs written there instead of
// <e2e>/tests (the manual items driven step by step). Such a spec imports the
// fixtures by absolute path, e.g.
//   import { test, expect } from "<PR checkout>/packages/e2e/fixtures/opfs.ts";
// so that @playwright/test resolves from that packages/e2e.
//
// The serve-mode specs (at-0032, at-3258) need `karasu serve` and cannot run
// against a preview; the repo config's testIgnore keeps them out of tests/.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const e2eDir = path.resolve(process.env.PR_VERIFY_E2E_DIR ?? path.join(here, "../../../../packages/e2e"));
const { default: base } = await import(pathToFileURL(path.join(e2eDir, "playwright.config.ts")).href);

const baseURL = process.env.PR_VERIFY_BASE_URL;
if (!baseURL) throw new Error("set PR_VERIFY_BASE_URL to the PR's app preview URL");
const out = path.resolve(process.env.PR_VERIFY_OUT ?? path.join(e2eDir, "test-results", "pr-verify"));
const throwaway = process.env.PR_VERIFY_TEST_DIR;

const chromium = (base.projects ?? []).filter((p: { name?: string }) => p.name === "chromium");

export default {
  ...base,
  testDir: throwaway ? path.resolve(throwaway) : path.join(e2eDir, "tests"),
  outputDir: path.join(out, "test-results"),
  // The preview is a remote deployment: allow for network latency.
  timeout: 45_000,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: path.join(out, "results.json") }]],
  use: { ...base.use, baseURL, video: "on", screenshot: "on", trace: "off" },
  projects: throwaway ? chromium.map(({ testIgnore: _, ...p }: { testIgnore?: unknown }) => p) : chromium,
  webServer: undefined,
};
