import type { DiagnosticCode } from "./ast.js";
import type { WarningKind } from "./warnings.js";

/**
 * A short, stable alias of a diagnostic code, shown to people in front of a
 * diagnostic's message (`Warning[KRS041]: ...`) so they can look it up in the
 * catalog (`docs/spec/diagnostics.md`) whatever the locale (#3654).
 *
 * The kebab code stays the key machines judge by (`karasu check --format json`);
 * the ID is its alias for people. It carries no severity: a code that is an
 * error on one surface and a warning on another has one ID.
 */
export type DiagnosticId = `KRS${string}`;

/**
 * Every code a `Diagnostic` or a `Warning` can carry, mapped to its ID.
 *
 * One record over both unions, so a name both declare (the style value checks
 * that `lint-style` reports as diagnostics and `render` as warnings) has one ID
 * by construction, and a new code without an ID fails the type check.
 *
 * Rules (enforced by `diagnostic-ids.test.ts` and
 * `scripts/lint/diagnostic-ids-history.ts`):
 * - an ID names one code; a new code takes the next number
 * - an ID is never reused. Retiring a code moves its ID to
 *   `RETIRED_DIAGNOSTIC_IDS`, so the numbers stay contiguous
 * - an ID in a published release names the same code ever after. An ID not
 *   yet released may be renumbered to resolve a clash between parallel PRs
 *
 * Keep one `"code": "KRS000",` entry per line: the history check reads this
 * file from a release tag as text.
 */
export const DIAGNOSTIC_IDS: Readonly<Record<DiagnosticCode | WarningKind, DiagnosticId>> = {
  "edge-source-mismatch": "KRS001",
  "edge-endpoint-not-at-scope": "KRS002",
  "edge-target-ambiguous": "KRS003",
  "ambiguous-edge-base": "KRS004",
  "duplicate-edge-label": "KRS005",
  "service-outside-system": "KRS006",
  "infra-not-in-context": "KRS007",
  "boundary-not-in-context": "KRS008",
  "entity-not-in-domain": "KRS009",
  "node-not-in-context": "KRS010",
  "legend-not-top-level": "KRS011",
  "top-level-declaration": "KRS012",
  "system-property-conflict": "KRS013",
  "cyclic-dependency": "KRS014",
  "duplicate-edge-id": "KRS015",
  "duplicate-node-id-parent": "KRS016",
  "entity-anchor-collision": "KRS017",
  "duplicate-node-in-system": "KRS018",
  "duplicate-node-in-deploy": "KRS019",
  "duplicate-team-id": "KRS020",
  "duplicate-team-in-organization": "KRS021",
  "duplicate-resource-operation": "KRS022",
  "duplicate-crud-decoration-target": "KRS023",
  "duplicate-owner-assignment": "KRS024",
  "duplicate-boundary-assignment": "KRS025",
  "boundary-membership-not-drawn": "KRS026",
  "duplicate-boundary-id": "KRS027",
  "duplicate-facet-id": "KRS028",
  "positional-label-removed": "KRS029",
  "node-id-multiple-locations": "KRS030",
  "owns-target-not-found": "KRS031",
  "invalid-owns": "KRS032",
  "contains-target-not-found": "KRS033",
  "owns-target-ambiguous": "KRS034",
  "contains-target-ambiguous": "KRS035",
  "realizes-target-ambiguous": "KRS036",
  "import-target-ambiguous": "KRS037",
  "facet-not-declared": "KRS038",
  "import-id-not-found": "KRS039",
  "import-path-not-found": "KRS040",
  "unresolved-edge-endpoint": "KRS041",
  "unresolved-handles": "KRS042",
  "unresolved-realizes": "KRS043",
  "legend-ref-unresolved": "KRS044",
  "cross-system-ref-unresolved": "KRS045",
  "cross-system-ref-implicit-external": "KRS046",
  "delivers-target-not-client": "KRS047",
  "unresolved-resource-ref": "KRS048",
  "unresolved-table-ref": "KRS049",
  "infra-redeclared-across-files": "KRS050",
  "infra-leaf-redeclared-silently": "KRS051",
  "shared-infra-fan-in": "KRS052",
  "cross-domain-store-access": "KRS053",
  "invalid-crud-decoration": "KRS054",
  "empty-crud-decoration": "KRS055",
  "unknown-resource-operation": "KRS056",
  "unassigned-service": "KRS057",
  "unassigned-domain": "KRS058",
  "unassigned-client": "KRS059",
  "unassigned-database": "KRS060",
  "unassigned-queue": "KRS061",
  "unassigned-storage": "KRS062",
  "unassigned-resource": "KRS063",
  "domain-dispersal": "KRS064",
  "missing-realizes": "KRS065",
  "missing-runtime": "KRS066",
  "annotation-param-unsupported": "KRS067",
  "annotation-param-value-unreadable": "KRS068",
  "annotation-param-conflict": "KRS069",
  "duplicate-annotation": "KRS070",
  "annotation-possible-typo": "KRS071",
  "tag-not-builtin": "KRS072",
  "tag-not-applicable": "KRS073",
  "annotation-not-builtin": "KRS074",
  "style-tag-selector-not-builtin": "KRS075",
  "style-annotation-selector-not-builtin": "KRS076",
  "team-property-removed": "KRS077",
  "circular-import": "KRS078",
  "file-not-found": "KRS080",
  "directory-not-found": "KRS081",
  "style-file-not-found": "KRS082",
  "style-unknown-property": "KRS083",
  "style-unknown-icon": "KRS084",
  "style-invalid-enum-value": "KRS085",
  "style-invalid-hex-color": "KRS086",
  "style-invalid-length-unit": "KRS087",
  "style-missing-length-unit": "KRS088",
  "style-out-of-range": "KRS089",
  "style-token-type-mismatch": "KRS090",
  "expected-style-property-name": "KRS091",
  "expected-semicolon-between-properties": "KRS092",
  "unknown-edge-selector-attribute": "KRS093",
  "style-conflict": "KRS094",
  "style-column-ignored-non-system-view": "KRS095",
  "client-resource-invalid-kind": "KRS096",
  "client-capability-duplicate": "KRS097",
  "token-type-mismatch": "KRS098",
  "unexpected-token-root": "KRS099",
  "unexpected-token-in-block": "KRS100",
  "expected-brace-or-string": "KRS101",
  "expected-identifier": "KRS102",
  "expected-string-after": "KRS103",
  "expected-id-or-string": "KRS104",
  "expected-node-id": "KRS105",
  "expected-property-value": "KRS106",
  "expected-id-after": "KRS107",
  "infra-path-too-long": "KRS108",
  "invalid-node-kind": "KRS109",
  "property-not-for-node-kind": "KRS110",
  "link-url-scheme-not-allowed": "KRS111",
  "app-project-compile-error": "KRS112",
  "app-org-parse-error": "KRS113",
  "generic-text": "KRS114",
};

/**
 * IDs whose code was retired, kept so the number is never handed to another
 * code and an old output still finds its row in the catalog's retired table.
 *
 * Keep one `{ id: "KRS000", code: "old-code" },` entry per line (read as text
 * by the history check).
 */
export const RETIRED_DIAGNOSTIC_IDS: readonly { id: DiagnosticId; code: string }[] = [
  { id: "KRS079", code: "circular-style-import" },
];

/** The ID of a `Diagnostic` code or a `Warning` kind. */
export function diagnosticIdOf(code: DiagnosticCode | WarningKind): DiagnosticId {
  return DIAGNOSTIC_IDS[code];
}
