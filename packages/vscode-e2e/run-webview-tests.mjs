#!/usr/bin/env node
/**
 * Programmatic ExTester runner for the WebView E2E suite.
 *
 * The CLI (`extest setup-and-run`) packages the extension with vsce in
 * default mode, which runs `npm list --production` against the manifest
 * to validate dependencies. That fails on this monorepo because vsce
 * does not understand pnpm `workspace:*` references.
 *
 * The extension is fully bundled by esbuild (`packages/vscode/out/extension.js`
 * pulls in `@karasu-tools/core` and `marked`), so dependency validation is
 * unnecessary at install time. We therefore drive ExTester programmatically
 * and tell vsce to skip the dependency check via the `dependencies: false`
 * option of `createVSIX`.
 */

import { ExTester } from "vscode-extension-tester";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as vsce from "@vscode/vsce";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const vscodePkg = path.join(repoRoot, "packages", "vscode");
const storage = path.join(here, "test-resources");
const mochaConfig = path.join(here, "tests", "webview", ".mocharc.json");
const testGlob = path.join(here, "out", "webview", "**", "*.test.js");

fs.mkdirSync(storage, { recursive: true });

// Pre-package the extension into a vsix without dependency validation.
const vsixOut = path.join(storage, "karasu-vscode.vsix");
const cwdBefore = process.cwd();
process.chdir(vscodePkg);
try {
  await vsce.createVSIX({
    cwd: vscodePkg,
    packagePath: vsixOut,
    dependencies: false,
    skipLicense: true,
  });
} finally {
  process.chdir(cwdBefore);
}

const extester = new ExTester(storage);
await extester.downloadCode("max");
await extester.downloadChromeDriver("max");
await extester.installVsix({ vsixFile: vsixOut, useYarn: false });

const exitCode = await extester.runTests(testGlob, {
  config: mochaConfig,
});

process.exit(exitCode);
