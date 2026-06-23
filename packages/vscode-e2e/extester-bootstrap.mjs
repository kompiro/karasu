/**
 * Shared programmatic ExTester bootstrap for the WebView suites.
 *
 * The CLI (`extest setup-and-run`) packages the extension with vsce in default
 * mode, which runs `npm list --production` against the manifest to validate
 * dependencies. That fails on this monorepo because vsce does not understand
 * pnpm `workspace:*` references.
 *
 * The extension is fully bundled by esbuild (`packages/vscode/out/extension.js`
 * pulls in `@karasu-tools/core` and `marked`), so dependency validation is
 * unnecessary at install time. Both the gated `test:webview` suite
 * (`run-webview-tests.mjs`) and the on-demand `capture:screenshots` generator
 * (`capture-screenshots.mjs`) drive ExTester through {@link runExtester}, which
 * skips the dependency check via `createVSIX({ dependencies: false })`.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as vsce from "@vscode/vsce";
import { ExTester } from "vscode-extension-tester";

/** Absolute path of the `packages/vscode-e2e` package root. */
export const packageRoot = path.dirname(fileURLToPath(import.meta.url));

const repoRoot = path.resolve(packageRoot, "..", "..");
const vscodePkg = path.join(repoRoot, "packages", "vscode");

/** ExTester storage / test-resources directory (downloads, vsix, fixtures). */
export const storage = path.join(packageRoot, "test-resources");

const mochaConfig = path.join(packageRoot, "tests", "webview", ".mocharc.json");
const codeSettings = path.join(packageRoot, "tests", "webview", "settings.json");

/**
 * Package the extension into a vsix (dependency validation skipped), download
 * VS Code + ChromeDriver, install the vsix, and run the mocha specs matched by
 * `testGlob`. `seedFixtures({ storage })` runs before packaging so it can write
 * fixtures and set the env vars the specs read.
 *
 * @param {object} opts
 * @param {string} opts.testGlob   Glob of compiled `*.js` specs to run.
 * @param {(ctx: { storage: string }) => void | Promise<void>} [opts.seedFixtures]
 * @returns {Promise<number>} mocha exit code.
 */
export async function runExtester({ testGlob, seedFixtures }) {
  fs.mkdirSync(storage, { recursive: true });

  if (seedFixtures) {
    await seedFixtures({ storage });
  }

  // Pre-package the extension into a vsix without dependency validation.
  const vsixOut = path.join(storage, "karasu-vscode.vsix");
  await vsce.createVSIX({
    cwd: vscodePkg,
    packagePath: vsixOut,
    dependencies: false,
    skipLicense: true,
  });

  const extester = new ExTester(storage);
  await extester.downloadCode("max");
  await extester.downloadChromeDriver("max");
  await extester.installVsix({ vsixFile: vsixOut, useYarn: false });

  return await extester.runTests(testGlob, {
    config: mochaConfig,
    // Tests create their own untitled buffers and switch language mode to krs —
    // that is more reliable under xvfb than ExTester's `code -r <folder>` path
    // (Phase 2a evidence: VS Code launched without a workspace).
    resources: [],
    // Pre-seed VS Code settings so the workspace-trust prompt and welcome editor
    // do not block command palette interaction on first launch.
    settings: codeSettings,
    cleanup: false,
    logLevel: "Info",
  });
}
