import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences the unit-test reach restored in Issue #3590: the `Check` job runs the
// vitest suite of every workspace package that has one.
//
// `ci.yml`'s Test step runs the root `test:coverage`, which names packages one
// at a time. `lsp` and `vscode` were never added to it, so their 15 test files
// could break with every check green; `pnpm test` named them, but no workflow
// runs `pnpm test`. It is the same shape as the typecheck gap of #2446
// (`typecheck-coverage-policy.test.ts`, TPL-2446), on the test step.
//
// The root script stays an enumeration (each package's coverage report and
// thresholds run one after another), so the invariant is checked here instead:
// every package whose `test` script is vitest defines `test:coverage` and is
// named in the root `test:coverage`, and a package whose tests use another
// runner names the workflow that runs them. A new package that forgets either
// fails here.

const REPO_ROOT = resolve(import.meta.dirname, "../..");

const read = (path: string): string => readFileSync(join(REPO_ROOT, path), "utf8");

interface PackageJson {
  name: string;
  scripts?: Record<string, string>;
}

const readPackage = (path: string): PackageJson => JSON.parse(read(path)) as PackageJson;

/**
 * Packages whose tests are not vitest, with the workflow and the command that
 * runs them in CI. Each entry is checked against the workflow, so an entry
 * cannot outlive the step it points at.
 */
const OTHER_RUNNERS: Record<string, { workflow: string; command: RegExp }> = {
  "@karasu-tools/e2e": {
    workflow: ".github/workflows/e2e.yml",
    command: /pnpm --filter @karasu-tools\/e2e (?:run )?test\b/,
  },
  "@karasu-tools/vscode-e2e": {
    workflow: ".github/workflows/vscode-e2e.yml",
    command: /pnpm --filter @karasu-tools\/vscode-e2e (?:run )?test\b/,
  },
};

const packages = readdirSync(join(REPO_ROOT, "packages"), { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() && existsSync(join(REPO_ROOT, "packages", entry.name, "package.json")),
  )
  .map((entry) => ({ dir: entry.name, ...readPackage(`packages/${entry.name}/package.json`) }))
  .sort((a, b) => a.dir.localeCompare(b.dir));

const withTests = packages.filter((p) => p.scripts?.test !== undefined);
const vitestPackages = withTests.filter((p) => /^vitest run\b/.test(p.scripts!.test));
const rootTestCoverage = readPackage("package.json").scripts?.["test:coverage"] ?? "";

/** The workspace packages the root `test:coverage` names, by name or by path. */
const named = new Set(
  [...rootTestCoverage.matchAll(/--filter[=\s](\S+) run test:coverage/g)].map((m) => m[1]),
);
const isNamed = (p: { dir: string; name: string }): boolean =>
  named.has(p.name) || named.has(`./packages/${p.dir}`);

describe("unit-test reach policy (Issue #3590)", () => {
  it("finds the workspace's test suites", () => {
    // Parser sanity: an empty scan would make every assertion below vacuous.
    expect(vitestPackages.length).toBeGreaterThanOrEqual(8);
    expect(named.size).toBeGreaterThanOrEqual(8);
  });

  it("gives every vitest package a test:coverage script", () => {
    const missing = vitestPackages
      .filter((p) => p.scripts?.["test:coverage"] === undefined)
      .map((p) => p.name);
    expect(missing).toEqual([]);
  });

  it("names every vitest package in the root test:coverage", () => {
    expect(vitestPackages.filter((p) => !isNamed(p)).map((p) => p.name)).toEqual([]);
  });

  it("keeps scripts/ in the root test:coverage", () => {
    // `scripts/` is not a workspace package, so the scan above never sees it.
    expect(rootTestCoverage).toContain("pnpm run test:scripts");
  });

  it("names a workflow for every package whose tests use another runner", () => {
    const unaccounted = withTests
      .filter((p) => !vitestPackages.includes(p) && OTHER_RUNNERS[p.name] === undefined)
      .map((p) => p.name);
    expect(unaccounted).toEqual([]);
    for (const [name, { workflow, command }] of Object.entries(OTHER_RUNNERS)) {
      expect(read(workflow), `${workflow} runs the tests of ${name}`).toMatch(command);
    }
  });

  it("runs the root test:coverage in the Check job", () => {
    expect(read(".github/workflows/ci.yml")).toMatch(/^\s+run: pnpm run test:coverage$/m);
  });
});
