import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  asMap,
  asStrings,
  jobs,
  pullRequestFilter,
  readWorkflow,
  triggers,
  WORKFLOW_DIR,
  workflowFiles,
} from "./workflow-yaml";

// The paired-stub pattern (ADR-953): a path-filtered workflow reports a
// Required check, and its `<name>-skip.yml` stub reports a no-op check of the
// same name on the inverse filter, so every PR gets exactly one real verdict or
// one no-op. When the two filters stop being complements, a PR on the gap gets
// no check at all (it hangs pending) or only the no-op one (the real check is
// skipped where it mattered, TPL-1480). When the job names drift, the stub
// reports a check nobody requires.
//
// This enumerates every `*-skip.yml` rather than naming the pairs, so a new
// stub is checked the day it lands. It also enumerates every check name that
// two PR workflows share, so a stub that is not named `-skip` cannot hide.
// The per-pair tests (`adr-validate-paths-sync.test.ts`,
// `render-equivalence-paths-sync.test.ts`, `e2e-suite-paths-policy.test.ts`,
// `scripts/lint/docs-site-ci-paths-sync.ts`) keep what is specific to each pair.

const STUBS = workflowFiles().filter((name) => name.endsWith("-skip.yml"));

/**
 * Path-filtered PR workflows that share a check name with another PR workflow
 * without being one half of a stub pair, and why that is not a gap.
 */
const EXTRA_REPORTERS: Record<string, string> = {
  "at-check-coverage.yml":
    "Reports an additional `Check` on the AT paths. `ci.yml` and `ci-skip.yml` already report `Check` on every PR, so its filter cannot leave a PR without one.",
};

const sorted = (list: readonly string[] | undefined) => [...(list ?? [])].sort();
const checkNames = (name: string) =>
  jobs(readWorkflow(name))
    .map((job) => job.name)
    .sort();
const branches = (name: string) =>
  sorted(asStrings(asMap(triggers(readWorkflow(name)).pull_request).branches));

describe("paired-stub workflows (ADR-953, TPL-1480)", () => {
  it("finds the stubs", () => {
    // Sanity: an empty enumeration would pass every test below.
    expect(STUBS).toEqual(expect.arrayContaining(["ci-skip.yml", "e2e-skip.yml"]));
  });

  describe.each(STUBS)("%s", (stub) => {
    const base = stub.replace(/-skip\.yml$/, ".yml");

    it("has its base workflow, and both run on pull requests", () => {
      expect(existsSync(resolve(WORKFLOW_DIR, base))).toBe(true);
      expect(pullRequestFilter(readWorkflow(base))).toBeDefined();
      expect(pullRequestFilter(readWorkflow(stub))).toBeDefined();
    });

    it("fires on exactly the inverse of the base's path filter", () => {
      const real = pullRequestFilter(readWorkflow(base))!;
      const skip = pullRequestFilter(readWorkflow(stub))!;
      // One side lists the paths and the other ignores the same list: either
      // the base lists `paths` (most pairs) or `paths-ignore` (ci.yml).
      const shape = real.paths !== undefined ? "paths" : "paths-ignore";
      expect({
        base: shape === "paths" ? real.pathsIgnore : real.paths,
        stub: shape === "paths" ? skip.paths : skip.pathsIgnore,
      }).toEqual({ base: undefined, stub: undefined });
      expect(sorted(shape === "paths" ? skip.pathsIgnore : skip.paths)).toEqual(
        sorted(shape === "paths" ? real.paths : real.pathsIgnore),
      );
      expect(sorted(skip.paths ?? skip.pathsIgnore).length).toBeGreaterThan(0);
    });

    it("reports the same check names on the same branches", () => {
      expect(checkNames(stub).length).toBeGreaterThan(0);
      expect(checkNames(stub)).toEqual(checkNames(base));
      expect(branches(stub)).toEqual(branches(base));
    });
  });

  it("leaves no check name shared by a path-filtered workflow outside a stub pair", () => {
    const paired = new Set(STUBS.flatMap((stub) => [stub, stub.replace(/-skip\.yml$/, ".yml")]));
    const onPr = workflowFiles().filter(
      (name) => pullRequestFilter(readWorkflow(name)) !== undefined,
    );
    const unexplained = onPr.filter((name) => {
      const filter = pullRequestFilter(readWorkflow(name))!;
      if (paired.has(name) || name in EXTRA_REPORTERS) return false;
      if (filter.paths === undefined && filter.pathsIgnore === undefined) return false;
      const shared = checkNames(name).filter((check) =>
        onPr.some((other) => other !== name && checkNames(other).includes(check)),
      );
      return shared.length > 0;
    });
    expect(unexplained).toEqual([]);
    // An entry whose workflow no longer shares a name has outlived its reason.
    for (const name of Object.keys(EXTRA_REPORTERS)) {
      expect(onPr).toContain(name);
    }
  });
});
