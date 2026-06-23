#!/usr/bin/env node
/**
 * Marketplace screenshot capture runner (Issue #1671).
 *
 * Drives the real karasu extension under xvfb via ExTester and saves
 * full-window PNGs of the preview's three faces (System / Deploy / Org) into
 * `packages/vscode/images/screenshots/`. The System shot doubles as the
 * editor ↔ preview workflow image embedded in `packages/vscode/README.md`.
 *
 * This is a manual, on-demand generator — NOT part of the gated `test:webview`
 * suite. It uses its own mocha glob (`out/capture/*.capture.js`) so the capture
 * spec never runs in CI. After running, review the generated PNGs by eye before
 * committing them to a public Marketplace listing, then bump
 * `packages/vscode/package.json` `version` and re-publish via
 * `vscode-release.yml`.
 *
 * Shares the vsix + runTests bootstrap with `run-webview-tests.mjs` via
 * `extester-bootstrap.mjs`; this file only owns the capture glob, the showcase
 * fixture, and the output directory.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { packageRoot, runExtester } from "./extester-bootstrap.mjs";

const repoRoot = path.resolve(packageRoot, "..", "..");
const outDir = path.join(repoRoot, "packages", "vscode", "images", "screenshots");

const exitCode = await runExtester({
  testGlob: path.join(packageRoot, "out", "capture", "*.capture.js"),
  seedFixtures({ storage }) {
    const fixtureDir = path.join(storage, "capture-fixture");
    const fixtureKrs = path.join(fixtureDir, "karasu-showcase.krs");

    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });

    // A showcase model with content in all three faces: services + nested
    // domains (System), deploy units that realize services (Deploy), and an
    // organization with teams that own the services/domains (Org). Team
    // ownership uses the top-level `organization` block — the inline `team`
    // property was removed in ADR-20260614-01, so it must NOT appear inside
    // services (it would render error squiggles in the screenshots). Keep this
    // fixture diagnostic-clean.
    fs.writeFileSync(
      fixtureKrs,
      `system "Shop" {
  service Storefront {
    label "Storefront"
    description """
The customer-facing **web storefront**.

## Responsibilities
- Browse the catalog
- Place orders
"""
    domain Catalog {}
    domain Cart {}
  }
  service OrderService {
    description "Processes orders and coordinates payment."
    domain OrderManagement {}
    domain Payment {}
  }
  service UserService {
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

organization Shop {
  label "Shop Engineering"

  team "web-team" {
    label "Web Team"
    owns Storefront
    owns Catalog
    owns Cart
    member alice { label "Alice Yamamoto" }
  }
  team "order-team" {
    label "Order Team"
    owns OrderService
    owns OrderManagement
    owns Payment
    member bob { label "Bob Tanaka" }
  }
  team "identity-team" {
    label "Identity Team"
    owns UserService
    owns Auth
    member carol { label "Carol Sato" }
  }
}
`,
    );
    process.env.KARASU_E2E_CAPTURE_FIXTURE_KRS = fixtureKrs;
    process.env.KARASU_E2E_CAPTURE_OUT_DIR = outDir;
  },
});

// Screenshots are written to packages/vscode/images/screenshots/ (outDir) by
// the capture spec; the mocha reporter lists each captured file.
process.exit(exitCode);
