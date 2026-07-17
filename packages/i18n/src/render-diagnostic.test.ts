import { describe, it, expect } from "vitest";
import type { Diagnostic, DiagnosticCode } from "@karasu-tools/core";
import { renderDiagnostic } from "./render-diagnostic.js";
import { bindTranslate } from "./translate.js";

// One sample `Diagnostic` per `DiagnosticCode`, mirroring the
// `Record<WarningKind, Warning>` map in `render-warning.test.ts`. The mapped
// type refines `Record<DiagnosticCode, Diagnostic>` in two ways: adding a new
// code to the core union without a sample here is a compile error, and each
// key can only hold a diagnostic of that same code (a key ↔ code mismatch is
// a compile error too). Params and severities mirror what core's producers
// emit — see `packages/core/src/parser/parser.ts`, `parser/style-parser.ts`,
// `style/value-validator.ts`, `fs/import-resolver.ts`, and
// `resolver/canonical-id.ts`.
type SamplesByCode = { [K in DiagnosticCode]: Extract<Diagnostic, { code: K }> };

const SAMPLES: SamplesByCode = {
  // ── Token / parse structure ─────────────────────────────────────────────
  "token-type-mismatch": {
    severity: "error",
    code: "token-type-mismatch",
    params: { expected: "LeftBrace", got: "Identifier", value: "orders" },
  },
  "unexpected-token-root": {
    severity: "error",
    code: "unexpected-token-root",
    params: { tokenType: "RightBrace", value: "}" },
  },
  "top-level-declaration": {
    severity: "error",
    code: "top-level-declaration",
    params: { construct: "user" },
  },
  // The named-block key; the sub-resource / generic / deploy-node keys are
  // fenced in the dedicated variants block below.
  "unexpected-token-in-block": {
    severity: "error",
    code: "unexpected-token-in-block",
    params: { blockKind: "legend", tokenType: "Identifier", value: "swtch" },
  },
  "expected-brace-or-string": {
    severity: "error",
    code: "expected-brace-or-string",
    params: { got: "Identifier", value: "orders" },
  },
  "expected-identifier": {
    severity: "error",
    code: "expected-identifier",
    params: { got: "Comma", value: "," },
  },
  "expected-string-after": {
    severity: "error",
    code: "expected-string-after",
    params: { property: "label" },
  },
  // The `role` key; the handles / delivers / operations keys are fenced in
  // the dedicated variants block below.
  "property-not-for-node-kind": {
    severity: "error",
    code: "property-not-for-node-kind",
    params: { property: "role", nodeKind: "service" },
  },
  "infra-not-in-context": {
    severity: "error",
    code: "infra-not-in-context",
    params: { infraKind: "database", parentKind: "domain" },
  },
  "entity-not-in-domain": {
    severity: "error",
    code: "entity-not-in-domain",
    params: { parentKind: "service" },
  },
  "legend-not-top-level": {
    severity: "error",
    code: "legend-not-top-level",
    params: { parentKind: "system" },
  },
  "expected-id-or-string": {
    severity: "error",
    code: "expected-id-or-string",
    params: { context: "entity table infra id" },
  },
  "expected-node-id": {
    severity: "error",
    code: "expected-node-id",
    params: { kind: "service" },
  },
  "invalid-node-kind": {
    severity: "error",
    code: "invalid-node-kind",
    params: { kind: "component" },
  },
  "expected-property-value": {
    severity: "error",
    code: "expected-property-value",
    params: { propName: "label" },
  },
  "expected-id-after": {
    severity: "error",
    code: "expected-id-after",
    params: { property: "owns" },
  },

  // ── Parser semantic diagnostics ─────────────────────────────────────────
  "team-property-removed": {
    severity: "error",
    code: "team-property-removed",
    params: {},
  },
  "annotation-param-unsupported": {
    severity: "warning",
    code: "annotation-param-unsupported",
    params: { annotation: "deprecated", key: "reason" },
  },
  "link-url-scheme-not-allowed": {
    severity: "warning",
    code: "link-url-scheme-not-allowed",
    params: { url: "javascript:alert(1)", scheme: "javascript" },
  },
  "edge-source-mismatch": {
    severity: "error",
    code: "edge-source-mismatch",
    params: { from: "PaymentService", parentId: "OrderService" },
  },
  "client-resource-invalid-kind": {
    severity: "error",
    code: "client-resource-invalid-kind",
    params: { kind: "cookies", name: "SessionCache" },
  },
  "unknown-resource-operation": {
    severity: "warning",
    code: "unknown-resource-operation",
    params: { operation: "browse", resourceId: "Order" },
  },
  "duplicate-resource-operation": {
    severity: "warning",
    code: "duplicate-resource-operation",
    params: { operation: "read", resourceId: "Order" },
  },
  "invalid-crud-decoration": {
    severity: "error",
    code: "invalid-crud-decoration",
    params: { operation: "manage", value: "browse", resourceId: "Order" },
  },
  "empty-crud-decoration": {
    severity: "error",
    code: "empty-crud-decoration",
    params: { operation: "manage", resourceId: "Order" },
  },
  "duplicate-crud-decoration-target": {
    severity: "warning",
    code: "duplicate-crud-decoration-target",
    params: { operation: "manage", value: "read", resourceId: "Order" },
  },
  "duplicate-owner-assignment": {
    severity: "info",
    code: "duplicate-owner-assignment",
    params: { nodeId: "OrderService", existingTeam: "Checkout" },
  },
  "duplicate-boundary-assignment": {
    severity: "info",
    code: "duplicate-boundary-assignment",
    params: { nodeId: "OrderService", existingBoundary: "OrderIntake" },
  },
  "contains-target-not-found": {
    severity: "warning",
    code: "contains-target-not-found",
    params: { memberId: "MissingSvc" },
  },
  "duplicate-team-id": {
    severity: "error",
    code: "duplicate-team-id",
    params: { teamId: "Platform" },
  },
  "node-id-multiple-locations": {
    severity: "warning",
    code: "node-id-multiple-locations",
    params: { nodeId: "OrderService" },
  },
  "duplicate-node-id-parent": {
    severity: "error",
    code: "duplicate-node-id-parent",
    params: { nodeId: "OrderService" },
  },
  "owns-target-not-found": {
    severity: "warning",
    code: "owns-target-not-found",
    params: { ownedId: "MissingSvc" },
  },
  "duplicate-edge-id": {
    severity: "error",
    code: "duplicate-edge-id",
    params: { authorId: "checkout" },
  },
  "ambiguous-edge-base": {
    severity: "warning",
    code: "ambiguous-edge-base",
    params: { fromId: "OrderService", toId: "PaymentService", arrow: "->" },
  },

  // ── Style parser ────────────────────────────────────────────────────────
  "style-token-type-mismatch": {
    severity: "error",
    code: "style-token-type-mismatch",
    params: { expected: "Identifier", got: "Semicolon", value: ";" },
  },
  "expected-style-property-name": {
    severity: "error",
    code: "expected-style-property-name",
    params: { got: "Colon" },
  },
  "expected-semicolon-between-properties": {
    severity: "error",
    code: "expected-semicolon-between-properties",
    params: { property: "color" },
  },
  "unknown-edge-selector-attribute": {
    severity: "error",
    code: "unknown-edge-selector-attribute",
    params: { attribute: "source" },
  },

  // ── Style value validator ───────────────────────────────────────────────
  "style-invalid-enum-value": {
    severity: "error",
    code: "style-invalid-enum-value",
    params: { property: "direction", value: "sideways", allowed: ["auto", "up", "down"] },
  },
  "style-invalid-hex-color": {
    severity: "error",
    code: "style-invalid-hex-color",
    params: { property: "color", value: "#zzz" },
  },
  "style-missing-length-unit": {
    severity: "error",
    code: "style-missing-length-unit",
    params: { property: "stroke-width", value: "2", allowedUnits: ["px"] },
  },
  "style-invalid-length-unit": {
    severity: "error",
    code: "style-invalid-length-unit",
    params: { property: "stroke-width", value: "2em", unit: "em", allowedUnits: ["px"] },
  },
  "style-out-of-range": {
    severity: "error",
    code: "style-out-of-range",
    params: { property: "opacity", value: 1.5, min: 0, max: 1 },
  },
  "style-unknown-property": {
    severity: "warning",
    code: "style-unknown-property",
    params: { property: "colr" },
  },

  // ── Import resolver ─────────────────────────────────────────────────────
  "circular-import": {
    severity: "warning",
    code: "circular-import",
    params: { filePath: "services/orders.krs" },
  },
  "file-not-found": {
    severity: "error",
    code: "file-not-found",
    params: { filePath: "services/missing.krs" },
  },
  "directory-not-found": {
    severity: "error",
    code: "directory-not-found",
    params: { dirPath: "services" },
  },
  "service-outside-system": {
    severity: "warning",
    code: "service-outside-system",
    params: { serviceId: "OrderService" },
  },
  "duplicate-node-in-system": {
    severity: "error",
    code: "duplicate-node-in-system",
    params: { nodeId: "OrderService", systemId: "Acme" },
  },
  "duplicate-node-in-deploy": {
    severity: "error",
    code: "duplicate-node-in-deploy",
    params: { nodeId: "OrderUnit", deployId: "Production" },
  },
  "duplicate-team-in-organization": {
    severity: "error",
    code: "duplicate-team-in-organization",
    params: { teamId: "Platform", orgId: "AcmeOrg" },
  },
  "system-property-conflict": {
    severity: "warning",
    code: "system-property-conflict",
    params: {
      blockId: "Acme",
      blockKind: "system",
      property: "label",
      chosen: "Acme Platform",
      ignored: "Acme Commerce",
    },
  },
  "infra-redeclared-across-files": {
    severity: "info",
    code: "infra-redeclared-across-files",
    params: { blockId: "OrderDB", blockKind: "database" },
  },
  "infra-leaf-redeclared-silently": {
    severity: "info",
    code: "infra-leaf-redeclared-silently",
    params: { leafId: "orders", leafKind: "table", infraId: "OrderDB", infraKind: "database" },
  },
  "import-id-not-found": {
    severity: "error",
    code: "import-id-not-found",
    params: { id: "OrderService", path: "services/orders.krs" },
  },
  "import-path-not-found": {
    severity: "error",
    code: "import-path-not-found",
    params: {
      path: ["Acme", "Payments", "Ledger"],
      failedAt: 2,
      importPath: "acme.krs",
      lastResolvedId: "Payments",
    },
  },
  "circular-style-import": {
    severity: "warning",
    code: "circular-style-import",
    params: { filePath: "theme.krs.style" },
  },
  "style-file-not-found": {
    severity: "warning",
    code: "style-file-not-found",
    params: { filePath: "missing.krs.style" },
  },

  // ── App-level synthetic diagnostics ─────────────────────────────────────
  "app-project-compile-error": {
    severity: "error",
    code: "app-project-compile-error",
    params: {},
  },
  "app-org-parse-error": {
    severity: "error",
    code: "app-org-parse-error",
    params: {},
  },
  "generic-text": {
    severity: "error",
    code: "generic-text",
    params: { text: "Something went wrong while compiling" },
  },
};

// Identifying fields that should appear verbatim in the rendered message,
// per DiagnosticCode, in both locales. The catalogs are free to add
// surrounding prose, but the id/value the user needs to find in their
// source must be present (no forgotten interpolation). Codes whose params
// are empty (`team-property-removed`, `app-project-compile-error`,
// `app-org-parse-error`) have nothing to interpolate and list no
// identifiers — their static messages are still fenced by the non-empty
// and ja≠en assertions.
const IDENTIFIERS: Record<DiagnosticCode, string[]> = {
  "token-type-mismatch": ["LeftBrace", "Identifier", "orders"],
  "unexpected-token-root": ["RightBrace", "}"],
  "top-level-declaration": ["user"],
  "unexpected-token-in-block": ["legend", "Identifier", "swtch"],
  "expected-brace-or-string": ["Identifier", "orders"],
  "expected-identifier": ["Comma"],
  "expected-string-after": ["label"],
  // `nodeKind` is intentionally not rendered — the message is a static
  // sentence naming the property and the node kinds it is valid for.
  "property-not-for-node-kind": ["role"],
  "infra-not-in-context": ["database", "domain"],
  "entity-not-in-domain": ["service"],
  "legend-not-top-level": ["system"],
  "expected-id-or-string": ["entity table infra id"],
  "expected-node-id": ["service"],
  "invalid-node-kind": ["component"],
  "expected-property-value": ["label"],
  "expected-id-after": ["owns"],
  "team-property-removed": [],
  "annotation-param-unsupported": ["@deprecated", "reason"],
  "link-url-scheme-not-allowed": ["javascript:alert(1)", '"javascript"'],
  "edge-source-mismatch": ["PaymentService", "OrderService"],
  "client-resource-invalid-kind": ["cookies", "SessionCache"],
  "unknown-resource-operation": ["browse", "Order"],
  "duplicate-resource-operation": ["read", "Order"],
  "invalid-crud-decoration": ["manage", "browse", "Order"],
  "empty-crud-decoration": ["manage", "Order"],
  "duplicate-crud-decoration-target": ["manage", "read", "Order"],
  "duplicate-owner-assignment": ["OrderService", "Checkout"],
  "duplicate-boundary-assignment": ["OrderService", "OrderIntake"],
  "contains-target-not-found": ["MissingSvc"],
  "duplicate-team-id": ["Platform"],
  "node-id-multiple-locations": ["OrderService"],
  "duplicate-node-id-parent": ["OrderService"],
  "owns-target-not-found": ["MissingSvc"],
  "duplicate-edge-id": ["#checkout"],
  "ambiguous-edge-base": ["OrderService->PaymentService"],
  "style-token-type-mismatch": ["Identifier", "Semicolon"],
  "expected-style-property-name": ["Colon"],
  "expected-semicolon-between-properties": ["color"],
  "unknown-edge-selector-attribute": ["source"],
  "style-invalid-enum-value": ["direction", "sideways", "auto, up, down"],
  "style-invalid-hex-color": ["color", "#zzz"],
  "style-missing-length-unit": ["stroke-width", '"2"', "px"],
  "style-invalid-length-unit": ["stroke-width", "2em", '"em"', "px"],
  "style-out-of-range": ["opacity", "1.5", "[0, 1]"],
  "style-unknown-property": ["colr"],
  "circular-import": ["services/orders.krs"],
  "file-not-found": ["services/missing.krs"],
  "directory-not-found": ["services"],
  "service-outside-system": ["OrderService"],
  "duplicate-node-in-system": ["OrderService", "Acme"],
  "duplicate-node-in-deploy": ["OrderUnit", "Production"],
  "duplicate-team-in-organization": ["Platform", "AcmeOrg"],
  "system-property-conflict": ["Acme", "label", "Acme Platform", "Acme Commerce"],
  "infra-redeclared-across-files": ["database", "OrderDB"],
  "infra-leaf-redeclared-silently": ["table", "orders", "database", "OrderDB"],
  "import-id-not-found": ["OrderService", "services/orders.krs"],
  "import-path-not-found": ["Acme.Payments.Ledger", "Ledger", "Payments"],
  "circular-style-import": ["theme.krs.style"],
  "style-file-not-found": ["missing.krs.style"],
  "app-project-compile-error": [],
  "app-org-parse-error": [],
  "generic-text": ["Something went wrong while compiling"],
};

const PLACEHOLDER = /\{\{[^}]+\}\}/;

// Codes whose ja rendering is identical to en BY DESIGN. `generic-text`
// carries a pre-built string that `renderDiagnostic` returns verbatim in
// every locale (the param IS the message; there is nothing to translate —
// see the `case "generic-text"` passthrough). Every other code MUST render
// differently in ja: adding a code here needs an explicit design reason,
// not a missing `ja.ts` entry.
const JA_EQUALS_EN_BY_DESIGN = new Set<DiagnosticCode>(["generic-text"]);

const ALL_CODES = Object.keys(SAMPLES) as DiagnosticCode[];
const JA_MUST_DIFFER_CODES = ALL_CODES.filter((code) => !JA_EQUALS_EN_BY_DESIGN.has(code));

describe("renderDiagnostic — i18n coverage for every DiagnosticCode", () => {
  for (const code of ALL_CODES) {
    const sample = SAMPLES[code];
    const identifiers = IDENTIFIERS[code];

    describe(`code: ${code}`, () => {
      it("renders a non-empty en message with no unresolved placeholders", () => {
        const out = renderDiagnostic(sample, bindTranslate("en"));
        expect(out.trim().length).toBeGreaterThan(0);
        expect(out).not.toMatch(PLACEHOLDER);
      });

      it("renders a non-empty ja message with no unresolved placeholders", () => {
        const out = renderDiagnostic(sample, bindTranslate("ja"));
        expect(out.trim().length).toBeGreaterThan(0);
        expect(out).not.toMatch(PLACEHOLDER);
      });

      it("the rendered en message surfaces the identifying field(s)", () => {
        const out = renderDiagnostic(sample, bindTranslate("en"));
        for (const id of identifiers) {
          expect(out).toContain(id);
        }
      });

      it("the rendered ja message surfaces the identifying field(s)", () => {
        const out = renderDiagnostic(sample, bindTranslate("ja"));
        for (const id of identifiers) {
          expect(out).toContain(id);
        }
      });
    });
  }
});

// A missing `diagnostic.*` key in `ja.ts` makes `translate("ja", ...)` fall
// back to the en entry, so the ja rendering would silently equal en. Fence
// every code except the by-design passthrough set above.
describe("ja differs from en (no silent English fallback)", () => {
  for (const code of JA_MUST_DIFFER_CODES) {
    it(`code: ${code}`, () => {
      const sample = SAMPLES[code];
      const en = renderDiagnostic(sample, bindTranslate("en"));
      const ja = renderDiagnostic(sample, bindTranslate("ja"));
      expect(ja).not.toBe(en);
    });
  }

  it("code: generic-text renders the same passthrough text in en and ja (by design)", () => {
    const sample = SAMPLES["generic-text"];
    expect(renderDiagnostic(sample, bindTranslate("ja"))).toBe(
      renderDiagnostic(sample, bindTranslate("en")),
    );
  });
});

// `unexpected-token-in-block` dispatches to one of four translation keys
// based on `blockKind`. The SAMPLES entry covers the named-block key
// (`diagnostic.unexpectedTokenInBlock.named`); the remaining keys get the
// same non-empty / identifier / ja≠en fence here so that dropping e.g.
// `diagnostic.unexpectedTokenInBlock.deployNode` from `ja.ts` cannot
// silently fall back to English.
describe("unexpected-token-in-block blockKind key variants", () => {
  const variants: { name: string; diagnostic: Diagnostic; identifiers: string[] }[] = [
    {
      name: "sub-resource block (diagnostic.unexpectedTokenInBlock.subResource)",
      diagnostic: {
        severity: "error",
        code: "unexpected-token-in-block",
        params: { blockKind: "sub-resource", tokenType: "Service", value: "service" },
      },
      identifiers: ["sub-resource", "Service"],
    },
    {
      name: "anonymous block (diagnostic.unexpectedTokenInBlock.generic)",
      diagnostic: {
        severity: "error",
        code: "unexpected-token-in-block",
        params: { blockKind: "", tokenType: "RightBracket", value: "]" },
      },
      identifiers: ["RightBracket"],
    },
    {
      name: "deploy node (diagnostic.unexpectedTokenInBlock.deployNode)",
      diagnostic: {
        severity: "error",
        code: "unexpected-token-in-block",
        params: { blockKind: "deploy node", tokenType: "Domain", value: "domain" },
      },
      identifiers: ["deploy", "Domain"],
    },
  ];

  for (const { name, diagnostic, identifiers } of variants) {
    describe(`variant: ${name}`, () => {
      it("renders a non-empty en message surfacing the identifying field(s)", () => {
        const out = renderDiagnostic(diagnostic, bindTranslate("en"));
        expect(out.trim().length).toBeGreaterThan(0);
        for (const id of identifiers) {
          expect(out).toContain(id);
        }
      });

      it("renders a non-empty ja message surfacing the identifying field(s)", () => {
        const out = renderDiagnostic(diagnostic, bindTranslate("ja"));
        expect(out.trim().length).toBeGreaterThan(0);
        for (const id of identifiers) {
          expect(out).toContain(id);
        }
      });

      it("ja message differs from en (catches a missing ja translation falling through)", () => {
        const en = renderDiagnostic(diagnostic, bindTranslate("en"));
        const ja = renderDiagnostic(diagnostic, bindTranslate("ja"));
        expect(ja).not.toBe(en);
      });
    });
  }
});

// `property-not-for-node-kind` dispatches to one static translation key per
// property. The SAMPLES entry covers `role`; handles / delivers / operations
// get the same fence here so that each per-property key must exist in both
// catalogs.
describe("property-not-for-node-kind property key variants", () => {
  const variants: { property: "handles" | "delivers" | "operations"; nodeKind: string }[] = [
    { property: "handles", nodeKind: "domain" },
    { property: "delivers", nodeKind: "client" },
    { property: "operations", nodeKind: "service" },
  ];

  for (const { property, nodeKind } of variants) {
    describe(`property: ${property} (diagnostic.propertyNotForNodeKind.${property})`, () => {
      const diagnostic: Diagnostic = {
        severity: "error",
        code: "property-not-for-node-kind",
        params: { property, nodeKind },
      };

      it("renders a non-empty en message naming the property", () => {
        const out = renderDiagnostic(diagnostic, bindTranslate("en"));
        expect(out.trim().length).toBeGreaterThan(0);
        expect(out).toContain(property);
      });

      it("renders a non-empty ja message naming the property", () => {
        const out = renderDiagnostic(diagnostic, bindTranslate("ja"));
        expect(out.trim().length).toBeGreaterThan(0);
        expect(out).toContain(property);
      });

      it("ja message differs from en (catches a missing ja translation falling through)", () => {
        const en = renderDiagnostic(diagnostic, bindTranslate("en"));
        const ja = renderDiagnostic(diagnostic, bindTranslate("ja"));
        expect(ja).not.toBe(en);
      });
    });
  }
});
