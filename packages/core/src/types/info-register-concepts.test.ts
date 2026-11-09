import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { DiagnosticCode } from "./ast.js";
import { INFO_WARNING_KINDS, warningSeverity, type WarningKind } from "./warnings.js";

// Every `info` diagnostic is classified in `docs/concepts.md`'s "What karasu
// visualizes vs. what it doesn't prescribe" table, in both locales, or is
// exempt here with the reason it is not a style smell (TPL-1386 item 5).
//
// The info set is closed on both sides karasu emits from: `INFO_WARNING_KINDS`
// for resolver warnings, and the catalog rows whose Severity is `info` for
// parser diagnostics. A diagnostic code's severity is set where it is emitted,
// so for codes this reads the catalog, which `diagnostics-catalog.test.ts`
// forces to list every code; every warning kind's catalog severity is checked
// against `warningSeverity()` below, so a kind made info in code but not in the
// catalog (or the other way round) fails.

const repoRoot = resolve(import.meta.dirname, "../../../..");
const read = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");

/** Info diagnostics that are not a school's smell, so they stay out of the table. */
const NOT_A_STYLE_SMELL = {
  "missing-runtime": "Points at a deploy property not written yet: a completeness hint.",
  "missing-realizes": "Points at a deploy property not written yet: a completeness hint.",
  "duplicate-boundary-assignment":
    "Membership is 1:N by design (TPL-2161); the fact is reported, and no school is judging it.",
  "boundary-membership-not-drawn":
    "Reports a limit of the boundary layout, not a property of the model.",
  "infra-leaf-redeclared-silently":
    "A leaf repeated inside one block is merged; it is a slip in the file, not a design choice.",
} satisfies Record<string, string>;

/** `code` -> Severity of every row in the catalog's tables (an ID column may sit between). */
function catalogSeverities(): Map<string, string> {
  const rows = read("docs/spec/diagnostics.md").matchAll(
    /^\|\s*`([a-z][a-z0-9-]+)`\s*\|(?:\s*KRS[0-9]{3}\s*\|)?\s*(error|warning|info)\s*\|/gm,
  );
  return new Map([...rows].map((m) => [m[1], m[2]]));
}

/** Lines of the visualizes-vs-prescribes section. */
function registerSection(rel: string): string {
  const text = read(rel);
  const start = text.indexOf('<a id="visualizes-vs-prescribes"></a>');
  if (start < 0) throw new Error(`${rel}: visualizes-vs-prescribes anchor not found`);
  const end = text.indexOf("\n## ", start);
  return text.slice(start, end < 0 ? undefined : end);
}

/** Every warning kind, kept complete by the `satisfies` clause. */
const WARNING_KINDS = Object.keys({
  "domain-dispersal": true,
  "shared-infra-fan-in": true,
  "cross-domain-store-access": true,
  "style-conflict": true,
  "missing-runtime": true,
  "missing-realizes": true,
  "unresolved-realizes": true,
  "invalid-owns": true,
  "unassigned-domain": true,
  "unassigned-service": true,
  "unassigned-client": true,
  "unresolved-handles": true,
  "unassigned-database": true,
  "unassigned-queue": true,
  "unassigned-storage": true,
  "unassigned-resource": true,
  "cross-system-ref-implicit-external": true,
  "cross-system-ref-unresolved": true,
  "unresolved-edge-endpoint": true,
  "edge-endpoint-not-at-scope": true,
  "edge-target-ambiguous": true,
  "cyclic-dependency": true,
  "delivers-target-not-client": true,
  "client-capability-duplicate": true,
  "tag-not-builtin": true,
  "tag-not-applicable": true,
  "annotation-not-builtin": true,
  "style-tag-selector-not-builtin": true,
  "style-annotation-selector-not-builtin": true,
  "facet-not-declared": true,
  "entity-anchor-collision": true,
  "legend-ref-unresolved": true,
  "style-column-ignored-non-system-view": true,
  "style-invalid-enum-value": true,
  "style-invalid-hex-color": true,
  "style-missing-length-unit": true,
  "style-invalid-length-unit": true,
  "style-out-of-range": true,
  "style-unknown-property": true,
  "style-unknown-icon": true,
} satisfies Record<WarningKind, true>) as WarningKind[];

/**
 * Kinds that are also a diagnostic code, whose catalog row gives the code's
 * severity. `validateStyleValues` reports these as errors (the LSP and
 * `karasu lint-style` show them that way); the compile pipeline turns the same
 * finding into a warning for the app's panel.
 */
const ROW_IS_THE_CODE: Partial<Record<Extract<WarningKind, DiagnosticCode>, string>> = {
  "style-invalid-enum-value": "validateStyleValues reports it as an error.",
  "style-invalid-hex-color": "validateStyleValues reports it as an error.",
  "style-missing-length-unit": "validateStyleValues reports it as an error.",
  "style-invalid-length-unit": "validateStyleValues reports it as an error.",
  "style-out-of-range": "validateStyleValues reports it as an error.",
};

const catalog = catalogSeverities();
const infoSet = new Set([
  ...INFO_WARNING_KINDS,
  ...[...catalog].filter(([, severity]) => severity === "info").map(([code]) => code),
]);

describe("info diagnostics are classified in docs/concepts (TPL-1386)", () => {
  it("reads a non-trivial info set", () => {
    expect(catalog.size).toBeGreaterThan(40);
    expect(infoSet.size).toBeGreaterThanOrEqual(INFO_WARNING_KINDS.size);
  });

  it("the catalog gives every warning kind the severity warningSeverity() gives it", () => {
    const disagree = WARNING_KINDS.filter((k) => !(k in ROW_IS_THE_CODE))
      .filter((k) => catalog.get(k) !== warningSeverity(k))
      .map((k) => `${k}: catalog ${catalog.get(k) ?? "(missing)"}, code ${warningSeverity(k)}`);
    expect(disagree).toEqual([]);
  });

  it.each(["docs/concepts.md", "docs/concepts.ja.md"])(
    "%s lists every info diagnostic that is not exempt",
    (rel) => {
      const section = registerSection(rel);
      const missing = [...infoSet]
        .filter((code) => !(code in NOT_A_STYLE_SMELL))
        .filter((code) => !section.includes(`| \`${code}\` (info) |`));
      expect(missing).toEqual([]);
      // An exemption that is also in the table, or names no info diagnostic, is stale.
      const stale = Object.keys(NOT_A_STYLE_SMELL).filter(
        (code) => !infoSet.has(code) || section.includes(`| \`${code}\` (info) |`),
      );
      expect(stale).toEqual([]);
    },
  );
});
