import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences what an ADR `assumptions:` entry may assert about a dependency
// range, decided in ADR-2628.
//
// `assumptions:` exists so CI fails when the world an ADR relies on moves
// (ADR-788). That only works if the assertion is the *decision*. Twice an ADR
// wrote the literal version instead, and both times a routine Dependabot bump
// turned a decision nobody had revisited into a red build:
//
//   - ADR-1338 asserted `fast-uri: \^3\.1\.2`; ADR-2115 loosened it.
//   - ADR-2447 asserted `"oxfmt": "\^0.62.0"`; #2614 went red on the next
//     oxfmt release and ADR-2623 loosened it.
//
// The failure is expensive out of proportion to its size. Dependabot cannot
// edit `docs/adr/`, so the bot PR cannot go green on its own: someone has to
// notice the red is ours rather than upstream's, then raise a replacement PR
// carrying the same bump. Twice now that has cost a PR that changed nothing
// about any decision.
//
// The rule this guard enforces is narrow on purpose: **a caret or tilde range
// may not be asserted down to a full `major.minor.patch`.** The caret is
// already a statement that the tail is allowed to move, so asserting the tail
// contradicts the range in the same breath. Stop at the major (`\^0\.`) and
// the assertion says what the ADR decided — that the dependency is caret
// pinned to that major — and survives every bump that the caret permits.
//
// An exact pin is deliberately left alone. `"pkg": "1.2.3"` with no caret is a
// decision *about* 1.2.3 — someone chose to freeze it — so the version is the
// content of the assumption and belongs there. The same exemption is what
// keeps `BlueOak-1.0.0` (ADR-2440) out of scope: an SPDX identifier that
// merely looks like a version is not a range at all.
//
// Where this runs matters as much as what it checks. `adr-validate.yml` runs
// `test:scripts` on `docs/adr/**`, which is the path a new ADR takes; `ci.yml`
// runs it via `test:coverage`, and that workflow ignores `docs/**`. Neither
// trigger covers both edits, and together they cover each (TPL-1480).

const REPO_ROOT = resolve(import.meta.dirname, "../..");

const ADR_DIR = "docs/adr";

/**
 * A caret or tilde range asserted all the way down to a patch number.
 *
 * Matched against the entry with backslashes stripped, because assumptions
 * carry regexes and the escaping is inconsistent across ADRs — `\^0.62.0`,
 * `\^1\.125\.0` and `^4.3.3` are all the same assertion wearing different
 * amounts of escaping, and all three must be caught.
 */
const CARET_PINNED_TO_PATCH = /[\^~]\d+\.\d+\.\d+/;

/** True when `entry` asserts a caret/tilde range down to a full version. */
export function pinsRangeToFullVersion(entry: string): boolean {
  return CARET_PINNED_TO_PATCH.test(entry.replace(/\\/g, ""));
}

type Assumption = { readonly adr: string; readonly entry: string };

/**
 * Every ADR file, found by reading the directory rather than from a list of
 * the ADRs that carry assumptions today (TPL-2253: a sweep closed by an
 * enumeration leaves survivors). Generated files (`effective.md`, `graph.md`)
 * and `TEMPLATE.md` have no `assumptions:` block, so they fall out on their
 * own instead of needing to be named here.
 */
function adrFiles(): string[] {
  return readdirSync(join(REPO_ROOT, ADR_DIR))
    .filter((file) => file.endsWith(".md"))
    .sort();
}

/**
 * The `assumptions:` entries of one ADR, read straight out of the frontmatter.
 *
 * Hand-parsed rather than run through a YAML library: the block is a flat list
 * of strings, and the entries are wanted exactly as written so a failure can
 * quote the line the author has to edit. Comment lines are skipped, which is
 * what keeps `TEMPLATE.md`'s commented-out examples from registering.
 */
function readAssumptions(file: string): Assumption[] {
  const source = readFileSync(join(REPO_ROOT, ADR_DIR, file), "utf8");
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(source)?.[1];
  if (frontmatter === undefined) return [];

  const lines = frontmatter.split("\n");
  const start = lines.indexOf("assumptions:");
  if (start === -1) return [];

  const entries: Assumption[] = [];
  for (const line of lines.slice(start + 1)) {
    // The block ends at the next top-level key.
    if (/^\S/.test(line)) break;
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed.startsWith("- ")) continue;
    entries.push({ adr: file, entry: trimmed.slice(2).trim() });
  }
  return entries;
}

const allAssumptions = (): Assumption[] => adrFiles().flatMap(readAssumptions);

/** Printed on failure: what is wrong, how to fix it, and where the examples are. */
const FIX_GUIDANCE = [
  "An `assumptions:` entry pins a caret/tilde range to a full version.",
  "",
  "The caret already says the tail may move, so asserting the tail makes the",
  "next routine bump fail a decision nobody revisited. Assert the major and",
  "stop:",
  "",
  '  - "grep: package.json :: \\"oxfmt\\": \\"\\\\^0.62.0\\""   # breaks on 0.63.0',
  '  + "grep: package.json :: \\"oxfmt\\": \\"\\\\^0\\\\."      # survives every 0.x',
  "",
  "ADR-1338 and ADR-2447 carry the loosened form to copy. If the exact version",
  "really is the decision, drop the caret and pin it exactly: that is a",
  "different assertion and this guard leaves it alone.",
  "",
  "See ADR-2628 and `.claude/rules/adr.md`.",
  "",
  "Offending entries:",
].join("\n");

describe("ADR assumption version policy", () => {
  it("reads the assumptions out of the ADR corpus", () => {
    // Guards the parser, not the policy. Every later assertion is vacuously
    // true if the frontmatter shape changes and this returns nothing.
    expect(allAssumptions().length).toBeGreaterThan(100);
  });

  it("no assumption asserts a caret range down to a full version", () => {
    const offenders = allAssumptions()
      .filter(({ entry }) => pinsRangeToFullVersion(entry))
      .map(({ adr, entry }) => `  ${adr}: ${entry}`);

    // The guidance rides in the compared value rather than in an `expect`
    // message argument, so the whole of it lands in the failure diff.
    const report = offenders.length === 0 ? "" : [FIX_GUIDANCE, "", ...offenders].join("\n");

    expect(report).toBe("");
  });

  it("leaves exact pins and version-shaped identifiers alone", () => {
    // The two shapes that must never trip the guard: an exact pin, where the
    // version is the decision, and an SPDX id that only looks like one
    // (ADR-2440 asserts `BlueOak-1.0.0` in two places).
    expect(pinsRangeToFullVersion('grep: package.json :: "pkg": "1.2.3"')).toBe(false);
    expect(pinsRangeToFullVersion("grep: CONTRIBUTING.md :: `BlueOak-1.0.0`")).toBe(false);
    expect(pinsRangeToFullVersion("grep: package.json :: node: >=24.0.0")).toBe(false);
  });

  it("catches a caret pin at every escaping level ADRs actually use", () => {
    expect(pinsRangeToFullVersion('"pkg": "\\^0.62.0"')).toBe(true);
    expect(pinsRangeToFullVersion('"vscode": "\\^1\\.125\\.0"')).toBe(true);
    expect(pinsRangeToFullVersion("nanoid: ^3.3.18")).toBe(true);
    expect(pinsRangeToFullVersion("pkg: ~4.3.3")).toBe(true);
  });

  it("accepts a range asserted only down to the major", () => {
    expect(pinsRangeToFullVersion('"oxfmt": "\\^0\\.')).toBe(false);
    expect(pinsRangeToFullVersion('"vitest": "\\^4\\.')).toBe(false);
    expect(pinsRangeToFullVersion("fast-uri: \\^3\\.")).toBe(false);
  });
});
