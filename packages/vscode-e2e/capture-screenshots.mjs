#!/usr/bin/env node
/**
 * Marketplace screenshot capture runner (Issue #1671).
 *
 * Drives the real karasu extension under xvfb via ExTester and saves
 * full-window PNGs of the preview's three faces (System / Deploy / Org) into
 * `packages/vscode/images/screenshots/`. The System shot doubles as the
 * editor ↔ preview workflow image embedded in `packages/vscode/README.md`.
 *
 * This is a manual, on-demand generator — NOT part of the gated
 * `test:webview` suite. It uses its own mocha glob (`out/capture/*.capture.js`)
 * so the capture spec never runs in CI. After running, review the generated
 * PNGs by eye before committing them to a public Marketplace listing, then
 * bump `packages/vscode/package.json` `version` and re-publish via
 * `vscode-release.yml`.
 *
 * Mirrors `run-webview-tests.mjs`: it drives ExTester programmatically and
 * tells vsce to skip dependency validation (`dependencies: false`), because
 * vsce's default `npm list --production` check does not understand pnpm
 * `workspace:*` references in this monorepo.
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
const testGlob = path.join(here, "out", "capture", "*.capture.js");
const codeSettings = path.join(here, "tests", "webview", "settings.json");
const fixtureDir = path.join(storage, "capture-fixture");
const fixtureKrs = path.join(fixtureDir, "karasu-showcase.krs");
const outDir = path.join(vscodePkg, "images", "screenshots");

fs.mkdirSync(storage, { recursive: true });
fs.mkdirSync(fixtureDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

// A showcase model with content in all three faces: services + nested domains
// (System), deploy units that realize services (Deploy), and teams (Org).
fs.writeFileSync(
  fixtureKrs,
  `system "Shop" {
  service Storefront {
    description """
The customer-facing **web storefront**.

## Responsibilities
- Browse the catalog
- Place orders
"""
    team "Web Team"

    domain Catalog {}
    domain Cart {}
  }
  service OrderService {
    description "Processes orders and coordinates payment."
    team "Order Team"

    domain OrderManagement {}
    domain Payment {}
  }
  service UserService {
    team "Identity Team"
    domain Auth {}
  }
  user Customer [human] {
    description "A shopper browsing and buying products."
    role "Buyer"
  }

  Customer -> Storefront "browses and buys"
  Storefront -> OrderService "submits orders"
  OrderService -> UserService "verifies the customer"
}

deploy "production" {
  oci "storefront" {
    image "storefront:1.0"
    runtime "Node 20"
    realizes Storefront
  }
  oci "order-svc" {
    image "order:1.0"
    runtime "Node 20"
    realizes OrderService
  }
  oci "user-svc" {
    image "user:1.0"
    runtime "Node 20"
    realizes UserService
  }
}
`,
);
process.env.KARASU_E2E_CAPTURE_FIXTURE_KRS = fixtureKrs;
process.env.KARASU_E2E_CAPTURE_OUT_DIR = outDir;

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
  resources: [],
  settings: codeSettings,
  cleanup: false,
  logLevel: "Info",
});

// Screenshots are written to packages/vscode/images/screenshots/ (outDir) by
// the capture spec; the mocha reporter lists each captured file.
process.exit(exitCode);
