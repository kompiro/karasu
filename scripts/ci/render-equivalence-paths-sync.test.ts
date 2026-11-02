import { existsSync, readFileSync } from "node:fs";
import { dirname, matchesGlob, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// `render-equivalence.yml` runs the `Render equivalence` check on the paths it
// lists, and `render-equivalence-skip.yml` reports a no-op one on every other
// PR through the same list as `paths-ignore:` (Issue #3509). When the lists
// drift, a PR on the missing path gets no check at all (it hangs pending once
// required) or only the no-op one (TPL-1480).
//
// The list also has to start the check when the comparison itself changes.
// The comparison imports modules from other script directories
// (`scripts/pr-shots/`, `scripts/lint/krs-fences.ts`); an edit to one of them
// that the list missed would change the check without running it.

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, ".github/workflows", path), "utf-8");

/** The entries of each `<key>:` list in a workflow, in file order. */
function lists(yaml: string, key: "paths" | "paths-ignore"): string[][] {
  const out: string[][] = [];
  const lines = yaml.split("\n");
  for (const [i, line] of lines.entries()) {
    if (line.trim() !== `${key}:`) continue;
    const entries: string[] = [];
    for (const next of lines.slice(i + 1)) {
      const m = /^\s+-\s+"?([^"]+?)"?\s*$/.exec(next);
      if (!m) break;
      entries.push(m[1]);
    }
    out.push(entries);
  }
  return out;
}

const ENTRY_POINTS = [
  "scripts/render-equivalence/run.ts",
  "scripts/render-equivalence/render-child.ts",
  "scripts/render-equivalence/verdict.ts",
];

/**
 * Every repo file reachable from `entries` through relative imports, stopping
 * at `packages/` (a package is one glob on the list, and walking the core
 * would only repeat it).
 */
function importClosure(entries: readonly string[]): string[] {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (file.startsWith("packages/")) continue;
    const text = readFileSync(resolve(ROOT, file), "utf-8");
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*"(\.{1,2}\/[^"]+)"/g)) {
      const target = relative(ROOT, resolve(ROOT, dirname(file), m[1]));
      if (existsSync(resolve(ROOT, target))) queue.push(target);
    }
  }
  return [...seen].sort();
}

describe("render-equivalence paths", () => {
  const paths = lists(read("render-equivalence.yml"), "paths");
  const skip = lists(read("render-equivalence-skip.yml"), "paths-ignore");

  it("has one paths list", () => {
    expect(paths).toHaveLength(1);
  });

  it("is mirrored by the skip workflow's paths-ignore", () => {
    expect(skip).toHaveLength(1);
    expect([...skip[0]].sort()).toEqual([...paths[0]].sort());
  });

  it("covers the packages, the lockfile and the workflow itself", () => {
    expect(paths[0]).toEqual(
      expect.arrayContaining([
        "packages/**",
        "pnpm-lock.yaml",
        "package.json",
        "scripts/render-equivalence/**",
        ".github/workflows/render-equivalence.yml",
      ]),
    );
  });

  it("covers every file the comparison imports", () => {
    const closure = importClosure(ENTRY_POINTS);
    // Sanity: the walk reached the modules borrowed from pr:shots and the
    // fence reader, so an empty closure cannot pass vacuously.
    expect(closure).toEqual(
      expect.arrayContaining(["scripts/pr-shots/candidates.ts", "scripts/lint/krs-fences.ts"]),
    );
    const uncovered = closure.filter((file) => !paths[0].some((glob) => matchesGlob(file, glob)));
    expect(uncovered).toEqual([]);
  });
});
