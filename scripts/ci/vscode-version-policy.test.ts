import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences the VS Code version policy: `@types/vscode` and `engines.vscode` are
// always the same range, and the suites that exercise the extension track the
// stable channel so CI never runs below the floor we advertise.
//
// The invariant is not "we are on 1.125" but "every declaration agrees". Two of
// the three sites are `devDependencies` entries, which Dependabot rewrites on
// its own; `engines.vscode` it cannot touch. So the natural failure mode is a
// half-move, and that half-move is not silent in the usual way: `vsce` refuses
// to package with `@types/vscode ... greater than engines.vscode ...`, which
// surfaces as a red E2E job whose message points at packaging rather than at
// the manifest that drifted. This guard fails first, in the unit run, naming
// the file.
//
// Because the floor moves with every `@types/vscode` release, no version
// constant lives here. Pinning one would add a fourth site to sweep and would
// make the guard drift on exactly the bumps it exists to police.
//
// The `version: "stable"` assertion is the other half of the policy. Tracking
// stable is what makes "CI verifies at or above the floor" true without anyone
// comparing numbers: the newest VS Code is always at least as new as any
// published `@types/vscode`. Pin a version there and that stops holding for
// free, so this guard fails and forces the comparison to be written down.

const REPO_ROOT = resolve(import.meta.dirname, "../..");

const VSCODE_TEST_CONFIG = "packages/vscode-e2e/.vscode-test.mjs";

/** The manifest that ships the extension, and therefore owns the floor. */
const EXTENSION_MANIFEST = "packages/vscode/package.json";

type Declaration = { readonly where: string; readonly value: string };

const read = (path: string): string => readFileSync(join(REPO_ROOT, path), "utf8");

/** The root manifest plus every workspace package manifest. */
const packageManifests = (): string[] =>
  [
    "package.json",
    ...readdirSync(join(REPO_ROOT, "packages")).map((p) => `packages/${p}/package.json`),
  ]
    .filter((file) => existsSync(join(REPO_ROOT, file)))
    .sort();

/**
 * Every `@types/vscode` range across the workspace, found by walking the
 * manifests rather than from a hand-written list of the two that declare it
 * today (TPL-2253: a sweep closed by an enumeration leaves survivors). A third
 * package picking up the types starts out covered.
 */
function readTypesRanges(): Declaration[] {
  return packageManifests().flatMap((file) => {
    const manifest = JSON.parse(read(file)) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const value =
      manifest.devDependencies?.["@types/vscode"] ?? manifest.dependencies?.["@types/vscode"];
    return value === undefined ? [] : [{ where: file, value }];
  });
}

/** The `engines.vscode` range declared by the shipped extension. */
function readEnginesRange(): string | undefined {
  const manifest = JSON.parse(read(EXTENSION_MANIFEST)) as { engines?: { vscode?: string } };
  return manifest.engines?.vscode;
}

describe("VS Code version policy", () => {
  it("finds the declarations it is meant to guard", () => {
    // Parser sanity: a rename or a manifest reshuffle would otherwise make
    // every assertion below pass over an empty set.
    expect(readTypesRanges().length).toBeGreaterThanOrEqual(2);
    expect(readEnginesRange()).toBeDefined();
  });

  it("declares one @types/vscode range across the workspace", () => {
    const ranges = readTypesRanges();
    const expected = ranges.find((r) => r.where === EXTENSION_MANIFEST)?.value;
    expect(expected, `${EXTENSION_MANIFEST} must declare @types/vscode`).toBeDefined();
    const offenders = ranges
      .filter((range) => range.value !== expected)
      .map((range) => `${range.where} → ${range.value} (expected ${expected})`);
    expect(offenders).toEqual([]);
  });

  it("keeps engines.vscode equal to the @types/vscode range", () => {
    // Not "engines is at least the types version": equal. A floor below the
    // types we compile against advertises hosts whose API surface we never
    // typechecked, and `vsce` only rejects the other direction.
    const types = readTypesRanges().find((r) => r.where === EXTENSION_MANIFEST)?.value;
    expect(readEnginesRange()).toBe(types);
  });

  it("runs the extension suite against the stable channel, not a pinned version", () => {
    const version = /^\s*version:\s*"([^"]+)"/m.exec(read(VSCODE_TEST_CONFIG));
    expect(version, `no version found in ${VSCODE_TEST_CONFIG}`).not.toBeNull();
    expect(version?.[1]).toBe("stable");
  });
});
