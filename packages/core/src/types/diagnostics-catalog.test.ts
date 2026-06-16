import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Guards docs/spec/diagnostics.md against drift from the emitted code surface
// (TPL-20260616-02). Every member of DiagnosticParamsByCode and WarningKind
// must appear as a `code` in the catalog, in both en and ja. The code-side
// source-of-truth is the type declarations in this directory; we extract the
// string-literal keys / members from the source text (they are erased at
// runtime, so we cannot enumerate them by importing).

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");

function read(relative: string): string {
  return readFileSync(resolve(repoRoot, relative), "utf8");
}

/** Member keys of `export interface DiagnosticParamsByCode { ... }`. */
function diagnosticCodes(): string[] {
  const src = read("packages/core/src/types/ast.ts");
  const block = /export interface DiagnosticParamsByCode\s*{([\s\S]*?)\n}/.exec(src);
  if (!block) throw new Error("DiagnosticParamsByCode interface not found");
  // Member keys are quoted strings at the start of a line followed by `:`.
  // Nested param objects use bare identifier keys, and string union *values*
  // sit on the right of a colon, so neither matches this anchored pattern.
  return [...block[1].matchAll(/^\s*"([a-z][a-z0-9-]+)":/gm)].map((m) => m[1]);
}

/** Members of the `export type WarningKind = | "a" | "b" ...` union. */
function warningKinds(): string[] {
  const src = read("packages/core/src/types/warnings.ts");
  const block = /export type WarningKind\s*=([\s\S]*?);/.exec(src);
  if (!block) throw new Error("WarningKind union not found");
  return [...block[1].matchAll(/"([a-z][a-z0-9-]+)"/g)].map((m) => m[1]);
}

const CATALOGS = ["docs/spec/diagnostics.md", "docs/spec/diagnostics.ja.md"] as const;

describe("diagnostics catalog completeness (TPL-20260616-02)", () => {
  const codes = diagnosticCodes();
  const kinds = warningKinds();

  it("extracts a non-trivial code surface", () => {
    // Sanity: the regexes found the real lists, not an empty match.
    expect(codes.length).toBeGreaterThan(40);
    expect(kinds.length).toBeGreaterThan(20);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  for (const catalog of CATALOGS) {
    it(`documents every diagnostic code and warning kind in ${catalog}`, () => {
      const text = read(catalog);
      const documented = new Set([...text.matchAll(/`([a-z][a-z0-9-]+)`/g)].map((m) => m[1]));
      // Test title names the catalog; a non-empty array lists the offenders.
      const missing = [...new Set([...codes, ...kinds])].filter((c) => !documented.has(c)).sort();
      expect(missing).toEqual([]);
    });
  }
});
