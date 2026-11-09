import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { INFO_WARNING_KINDS } from "./warnings.js";

// Every `info` diagnostic is classified in `docs/concepts.md`'s "What karasu
// visualizes vs. what it doesn't prescribe" table, in both locales, or is
// exempt here with the reason it is not a style smell (TPL-1386 item 5).
//
// The info set is closed on both sides karasu emits from: `INFO_WARNING_KINDS`
// for resolver warnings, and the catalog rows whose Severity is `info` for
// parser diagnostics. A diagnostic code's severity is set where it is emitted,
// so for codes this reads the catalog, which `diagnostics-catalog.test.ts`
// forces to list every code; a warning kind's catalog severity is checked
// against `warningSeverity()` below.

const repoRoot = resolve(import.meta.dirname, "../../../..");
const read = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");

/** Info diagnostics that are not a school's smell, so they stay out of the table. */
const NOT_A_STYLE_SMELL: Record<string, string> = {
  "missing-runtime": "Points at a deploy property not written yet: a completeness hint.",
  "missing-realizes": "Points at a deploy property not written yet: a completeness hint.",
  "duplicate-boundary-assignment":
    "Membership is 1:N by design (TPL-2161); the fact is reported, and no school is judging it.",
  "boundary-membership-not-drawn":
    "Reports a limit of the boundary layout, not a property of the model.",
  "infra-leaf-redeclared-silently":
    "A leaf repeated inside one block is merged; it is a slip in the file, not a design choice.",
};

/** `code` -> Severity of every row in the catalog's tables. */
function catalogSeverities(): Map<string, string> {
  const rows = read("docs/spec/diagnostics.md").matchAll(
    /^\|\s*`([a-z][a-z0-9-]+)`\s*\|\s*(error|warning|info)\s*\|/gm,
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

  it("the catalog gives every info warning kind the info severity", () => {
    expect([...INFO_WARNING_KINDS].filter((k) => catalog.get(k) !== "info")).toEqual([]);
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
