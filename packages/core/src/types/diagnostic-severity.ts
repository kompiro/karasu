/**
 * Three-level severity. `info` is reserved for diagnostics that surface a
 * **structural fact karasu visualizes but does not prescribe** — e.g. shared
 * databases across services (`infra-redeclared-across-files`). The wording
 * is fact-first; any "this is a smell" framing belongs in linked
 * documentation, not in the message itself. `info` SHOULD render less
 * prominently than `warning` in downstream surfaces (App diagnostic banner,
 * LSP, CLI). See design doc `karasu-position-on-style-prescriptions.md`.
 */
export type DiagnosticSeverity = "error" | "warning" | "info";

/**
 * The one severity each `Diagnostic` code is emitted at (TPL-2171).
 *
 * `Diagnostic` types its `severity` from this table per code, so an emission
 * site that writes another severity fails the type check, and a new code
 * without a row here fails it too (it cannot index the table).
 * `diagnostics-catalog.test.ts` compares the table with the Severity column of
 * `docs/spec/diagnostics.md` and `.ja.md`, so the spec and the code cannot
 * disagree on a code's register.
 *
 * A leaf module: `ast.ts` reads it by `import type`, and it imports nothing
 * back, so the two do not form a cycle.
 *
 * The `style-*` value checks are also `Warning` kinds, reported at
 * `warningSeverity()` by `render`; this table holds their `Diagnostic` side
 * (`lint-style`, `tidy-style`).
 */
export const DIAGNOSTIC_SEVERITY = {
  "token-type-mismatch": "error",
  "unexpected-token-root": "error",
  "top-level-declaration": "error",
  "unexpected-token-in-block": "error",
  "expected-brace-or-string": "error",
  "expected-identifier": "error",
  "expected-string-after": "error",
  "property-not-for-node-kind": "error",
  "infra-not-in-context": "error",
  "entity-not-in-domain": "error",
  "node-not-in-context": "error",
  "legend-not-top-level": "error",
  "expected-id-or-string": "error",
  "expected-node-id": "error",
  "invalid-node-kind": "error",
  "expected-property-value": "error",
  "expected-id-after": "error",
  "infra-path-too-long": "error",
  "team-property-removed": "error",
  "annotation-param-unsupported": "warning",
  "annotation-param-value-unreadable": "warning",
  "annotation-param-conflict": "warning",
  "duplicate-annotation": "warning",
  "annotation-possible-typo": "error",
  "link-url-scheme-not-allowed": "warning",
  "edge-source-mismatch": "error",
  "client-resource-invalid-kind": "error",
  "unknown-resource-operation": "warning",
  "duplicate-resource-operation": "warning",
  "invalid-crud-decoration": "error",
  "empty-crud-decoration": "error",
  "duplicate-crud-decoration-target": "warning",
  "duplicate-owner-assignment": "info",
  "duplicate-boundary-assignment": "info",
  "boundary-not-in-context": "error",
  "duplicate-boundary-id": "error",
  "duplicate-facet-id": "error",
  "positional-label-removed": "error",
  "contains-target-not-found": "warning",
  "unresolved-resource-ref": "warning",
  "resource-target-ambiguous": "warning",
  "unresolved-table-ref": "warning",
  "duplicate-team-id": "error",
  "node-id-multiple-locations": "warning",
  "duplicate-node-id-parent": "error",
  "owns-target-not-found": "warning",
  "owns-target-ambiguous": "warning",
  "contains-target-ambiguous": "warning",
  "realizes-target-ambiguous": "warning",
  "duplicate-edge-id": "error",
  "duplicate-edge-label": "error",
  "ambiguous-edge-base": "warning",
  "style-token-type-mismatch": "error",
  "expected-style-property-name": "error",
  "expected-semicolon-between-properties": "error",
  "unknown-edge-selector-attribute": "error",
  "style-invalid-enum-value": "error",
  "style-invalid-hex-color": "error",
  "style-missing-length-unit": "error",
  "style-invalid-length-unit": "error",
  "style-out-of-range": "error",
  "style-unknown-property": "warning",
  "style-unknown-icon": "warning",
  "circular-import": "warning",
  "file-not-found": "error",
  "directory-not-found": "error",
  "service-outside-system": "warning",
  "duplicate-node-in-system": "error",
  "duplicate-node-in-deploy": "error",
  "duplicate-team-in-organization": "error",
  "system-property-conflict": "warning",
  "infra-redeclared-across-files": "info",
  "infra-leaf-redeclared-silently": "info",
  "import-id-not-found": "error",
  "import-path-not-found": "error",
  "import-target-ambiguous": "warning",
  "style-file-not-found": "warning",
  "boundary-membership-not-drawn": "info",
  "app-project-compile-error": "error",
  "app-org-parse-error": "error",
  // Tests build this one with whatever severity they need. No production code
  // emits it, which is the only reason its catalog row can say error.
  "generic-text": "error" as DiagnosticSeverity,
} as const;

/**
 * The codes emitted as errors. Helpers that write `severity: "error"` for the
 * code they are given (`ctx.error`, `rejectConstruct`, ...) take only these, so
 * a warning or info code cannot reach the catalog's error rows through them.
 */
export type ErrorDiagnosticCode = {
  [K in keyof typeof DIAGNOSTIC_SEVERITY]: (typeof DIAGNOSTIC_SEVERITY)[K] extends "error"
    ? K
    : never;
}[keyof typeof DIAGNOSTIC_SEVERITY];
