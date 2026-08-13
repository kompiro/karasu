import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences the typecheck coverage restored in Issue #2446: the `Check` job — the
// machine that gates merges — typechecks *every* workspace package, and does so
// by running the root script rather than naming packages one at a time.
//
// The enumeration it replaced named core / app / cli, so `lsp`, `vscode`,
// `nest`, `i18n`, `docs-site`, `vscode-e2e` and `scripts/` reached `main`
// unchecked. Nothing looked broken locally, because the pre-push hook runs the
// root `pnpm run typecheck` and covers all of them — the gap only opened where
// the hook never runs. Dependabot's #2432 was green on every check while
// widening `Diagnostic.message` broke 12 assertions in `packages/lsp`
// (TPL-2446).
//
// So the invariant is not "these packages are typechecked" — that is the shape
// that already failed. It is "no package can be left out": every workspace
// package defines a `typecheck` script, and CI runs the recursive script that
// reaches all of them. A new package that forgets the script, or a workflow
// edit that goes back to naming packages, fails here.

const REPO_ROOT = resolve(import.meta.dirname, "../..");

const read = (path: string): string => readFileSync(join(REPO_ROOT, path), "utf8");

const readScripts = (packageJsonPath: string): Record<string, string> =>
  (JSON.parse(read(packageJsonPath)) as { scripts?: Record<string, string> }).scripts ?? {};

/**
 * The one workspace glob this guard knows how to walk. Asserted rather than
 * assumed: a second glob (`apps/*`, say) would add packages the directory scan
 * below never visits, and an uncovered package that reads as covered is the
 * failure this file exists to prevent.
 */
const WORKSPACE_GLOB = "packages/*";

/**
 * The `packages:` list only — the file's later keys (`overrides:`,
 * `minimumReleaseAgeExclude:`) hold entries at the same indentation, so the
 * scan stops at the first line that is not a list item.
 */
function workspaceGlobs(): string[] {
  const lines = read("pnpm-workspace.yaml").split("\n");
  const globs: string[] = [];
  for (const line of lines.slice(lines.indexOf("packages:") + 1)) {
    const entry = /^ {2}- "(.+)"\s*$/.exec(line);
    if (!entry) break;
    globs.push(entry[1]);
  }
  return globs;
}

const packageDirs = readdirSync(join(REPO_ROOT, "packages"), { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() && existsSync(join(REPO_ROOT, "packages", entry.name, "package.json")),
  )
  .map((entry) => entry.name)
  .sort();

const ciWorkflow = read(".github/workflows/ci.yml");

describe("typecheck coverage policy (Issue #2446)", () => {
  it("walks the whole workspace", () => {
    // Parser sanity: an empty or truncated package list would make the
    // per-package assertion below pass vacuously.
    expect(workspaceGlobs()).toEqual([WORKSPACE_GLOB]);
    expect(packageDirs.length).toBeGreaterThanOrEqual(10);
  });

  it("gives every workspace package a typecheck script", () => {
    // `pnpm -r run typecheck` skips a package with no such script silently —
    // it reports the same "Scope: N of M" line either way. `packages/e2e` sat
    // in exactly that state until #2446: TypeScript specs, checked nowhere.
    const withoutTypecheck = packageDirs.filter(
      (dir) => !readScripts(`packages/${dir}/package.json`).typecheck,
    );
    expect(withoutTypecheck).toEqual([]);
  });

  it("keeps the root typecheck script recursive", () => {
    // The property that makes a new package covered on the day it is created.
    expect(readScripts("package.json").typecheck).toContain("pnpm -r run typecheck");
  });

  it("runs the root typecheck script in CI", () => {
    expect(ciWorkflow).toMatch(/^\s+run: pnpm run typecheck$/m);
  });

  it("names no individual package in a CI typecheck step", () => {
    // The regression this guard is named for. Deploy workflows may filter to
    // their own package (`nest-deploy.yml` typechecks `nest` before shipping
    // it); the rule is about `ci.yml`, which gates merges for everything.
    const enumerated = ciWorkflow
      .split("\n")
      .filter((line) => /pnpm --filter \S+ run typecheck/.test(line));
    expect(enumerated).toEqual([]);
  });
});
