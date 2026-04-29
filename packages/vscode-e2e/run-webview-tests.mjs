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
const codeSettings = path.join(here, "tests", "webview", "settings.json");
const fixtureDir = path.join(storage, "at-0039-fixture");
const fixtureKrs = path.join(fixtureDir, "at-0039.krs");
const at0038FixtureDir = path.join(storage, "at-0038-fixture");
const at0038FixtureKrs = path.join(at0038FixtureDir, "at-0038.krs");

fs.mkdirSync(storage, { recursive: true });
fs.mkdirSync(fixtureDir, { recursive: true });
fs.mkdirSync(at0038FixtureDir, { recursive: true });

// Write the AT-0039 fixture to a stable on-disk path that the test can
// reach via VS Code's "File: Open File…" command. We do this in the
// runner (rather than committing a fixture under fixtures/) so the path
// is absolute + writable in the CI sandbox. The content mirrors the
// AT-0039 spec fixture: OrderService has a Markdown description block,
// links, and a team (so the detail-panel content TC can assert all
// three sections), Customer is a leaf user with a role (used by
// TC-01 / TC-03 / TC-04 / TC-08), and OrderManagement is a leaf inside
// OrderService (referenced by TC-06).
fs.writeFileSync(
  fixtureKrs,
  `system Demo {
  service OrderService {
    description """
Handles **order processing** and payment.

## Responsibilities
- Accept new orders
- Process payments
"""
    link "Design Wiki" "https://wiki.example.com/order"
    link "API Docs" "https://api.example.com/order"
    team "Order Team"

    domain OrderManagement {}
    domain Inventory {}
  }
  user Customer [human] {
    description "A customer who purchases products."
    role "Buyer"
  }
  Customer -> OrderService "places an order"
}
`,
);
process.env.KARASU_E2E_FIXTURE_KRS = fixtureKrs;

// AT-0038 fixture needs a parent node (service with children) so the
// drill-down half of the hint-visibility check (TC-02) has somewhere to
// drill into.
fs.writeFileSync(
  at0038FixtureKrs,
  `system ECommerce {
  service OrderService {
    domain OrderManagement {}
    domain Inventory {}
  }
  service UserService {
    domain Auth {}
  }
  OrderService -> UserService
}
`,
);
process.env.KARASU_E2E_FIXTURE_KRS_AT0038 = at0038FixtureKrs;

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

const exitCode = await extester.runTests(testGlob, {
  config: mochaConfig,
  // Tests create their own untitled buffers and switch language mode to
  // krs — that is more reliable under xvfb than ExTester's
  // `code -r <folder>` path (Phase 2a evidence: VS Code launched without a
  // workspace).
  resources: [],
  // Pre-seed VS Code settings so the workspace-trust prompt and welcome
  // editor do not block command palette interaction on first launch.
  settings: codeSettings,
  cleanup: false,
  logLevel: "Info",
});

process.exit(exitCode);
