#!/usr/bin/env node
/**
 * Programmatic ExTester runner for the gated WebView E2E suite.
 *
 * Shares the vsix + runTests bootstrap with the capture generator via
 * `extester-bootstrap.mjs`; this file only owns the spec glob and the AT-0038 /
 * AT-0039 fixtures.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { packageRoot, runExtester } from "./extester-bootstrap.mjs";

const exitCode = await runExtester({
  testGlob: path.join(packageRoot, "out", "webview", "**", "*.test.js"),
  seedFixtures({ storage }) {
    const fixtureDir = path.join(storage, "at-0039-fixture");
    const fixtureKrs = path.join(fixtureDir, "at-0039.krs");
    const at0038FixtureDir = path.join(storage, "at-0038-fixture");
    const at0038FixtureKrs = path.join(at0038FixtureDir, "at-0038.krs");

    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.mkdirSync(at0038FixtureDir, { recursive: true });

    // Write the AT-0039 fixture to a stable on-disk path that the test can
    // reach via VS Code's "File: Open File…" command. We do this in the
    // runner (rather than committing a fixture under fixtures/) so the path
    // is absolute + writable in the CI sandbox. The content mirrors the
    // AT-0039 spec fixture and is also reused by AT-0042-vscode (cross-
    // diagram navigation): OrderService has a Markdown description block,
    // links, and is owned by `order-team` (AT-0039 TC-02) plus a matching
    // deploy unit (AT-0042 TC-1 / TC-2). UserService is owned by `user-team`
    // but has no deploy block (AT-0042 TC-5). Customer is a leaf user with a
    // role (AT-0039 TC-01 / TC-03 / TC-04 / TC-08).
    //
    // Team ownership lives in a top-level `organization { team { owns … } }`
    // block: the inline `team "…"` property on service/domain was removed in
    // ADR-20260614-01 (it now emits a `team-property-removed` error). The
    // detail panel's Org navigation button is keyed on the *resolved owner
    // team id* (`ownerIndex`), so the AT-0042 assertions look for
    // `data-nav-node="order-team"` rather than the old team label.
    //
    // Issue #2068 additions (kept after Customer's own block so
    // `FIXTURE_LINE.Customer` in at-0039-detail-panel.test.ts does not
    // shift): `UserService` gets `@deprecated(until: …)` for the Migration
    // intent section; `WebApp` (a `client` node) carries `resource` /
    // `capability` declarations for the Storage resources / Capabilities
    // sections; `OrderDB` (a `database`) is realized by a deploy `store`
    // unit so the store kind gets its own detail-panel icon (previously
    // unmapped, falling back to "■" — the bug this issue fixed alongside
    // the `usecase`/`domain` icon collision). WebApp's `geolocation`
    // capability carries an explicit empty `label ""` to fence the panel's
    // `cap.label ?? cap.name` fallback (must NOT show the name "geolocation"
    // — the code-review `??` vs `||` finding on PR #2072).
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
    link "https://wiki.example.com/order" "Design Wiki"
    link "https://api.example.com/order" "API Docs"

    domain OrderManagement {}
    domain Inventory {}
  }
  service UserService @deprecated(until: "2026-12-31") {}
  user Customer [human] {
    description "A customer who purchases products."
    role "Buyer"
  }
  client WebApp [web] {
    label "Customer SPA"
    resource localStorage "preferences"
    resource indexedDB "outbox"
    capability notification
    capability camera {
      label "QR scanning"
      description "Used to scan QR codes"
    }
    capability geolocation {
      label ""
      description "explicit empty label — must NOT fall through to the name (#2068 ?? vs || fence)"
    }
  }
  database OrderDB {
    table OrderTable {}
  }
  Customer -> OrderService "places an order"
}

deploy "production" {
  oci "order-svc" {
    image "order:1.0"
    runtime "Node 20"
    realizes OrderService
  }
  store "order-db" {
    type "Aurora PostgreSQL 15"
    realizes OrderDB
  }
}

organization Demo {
  team "order-team" {
    label "Order Team"
    owns OrderService
  }
  team "user-team" {
    label "User Team"
    owns UserService
  }
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
  },
});

process.exit(exitCode);
