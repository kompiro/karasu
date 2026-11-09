import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  asList,
  asMap,
  asStrings,
  globToRegExp,
  jobs,
  readWorkflow,
  ROOT,
  triggers,
  workflowFiles,
  type Yaml,
} from "./workflow-yaml";

// An E2E suite that only PRs start sees main only through the PRs that happen
// to touch its paths, so a flake that builds up on main stays out of sight
// until it blocks an unrelated PR (TPL-976). Each suite therefore needs a run
// that does not wait for a PR: a `schedule`, or a `push` to main.
//
// The closed set is the workspace packages that depend on an E2E runner, so a
// new E2E package is checked the day it lands; the runs are found by reading
// every workflow's triggers and the `pnpm --filter` of its commands.

/** Dependencies that make a package an E2E suite. */
const E2E_RUNNERS = [
  "@playwright/test",
  "playwright",
  "vscode-extension-tester",
  "@vscode/test-electron",
];

/** Suites with no run outside PRs, and why. Each entry is a gap until it is removed. */
const NO_UNATTENDED_RUN: Record<string, string> = {
  "@karasu-tools/vscode-e2e":
    "A gap (#3724): vscode-e2e.yml runs only on PRs that touch its paths. The VS Code jobs are long and not required (#3330), and a scheduled run has no tracking Issue to report to yet, unlike e2e-nightly.yml.",
};

interface Suite {
  readonly dir: string;
  readonly name: string;
}

const SUITES: Suite[] = readdirSync(resolve(ROOT, "packages"), { withFileTypes: true })
  // A leftover directory without a manifest is not a package.
  .filter(
    (entry) =>
      entry.isDirectory() && existsSync(resolve(ROOT, "packages", entry.name, "package.json")),
  )
  .map((entry) => {
    const manifest = JSON.parse(
      readFileSync(resolve(ROOT, "packages", entry.name, "package.json"), "utf-8"),
    ) as { name: string; dependencies?: object; devDependencies?: object };
    const deps = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    return {
      dir: entry.name,
      name: manifest.name,
      e2e: deps.some((dep) => E2E_RUNNERS.includes(dep)),
    };
  })
  .filter((suite) => suite.e2e)
  .map(({ dir, name }) => ({ dir, name }));

/**
 * Whether these triggers start a run without a PR: a schedule, or a push that
 * fires for `main` on every change. A push narrowed by `paths`, to tags only,
 * or away from main by `branches` / `branches-ignore` does not count: main can
 * drift for days without one.
 */
function runsUnattended(on: { [event: string]: Yaml }): boolean {
  if (asList(on.schedule).length > 0) return true;
  if (!("push" in on)) return false;
  const push = asMap(on.push);
  if ("paths" in push || "paths-ignore" in push) return false;
  const named = (key: string) =>
    asStrings(push[key]).some((glob) => globToRegExp(glob).test("main"));
  const hasBranches = "branches" in push || "branches-ignore" in push;
  if (!hasBranches && ("tags" in push || "tags-ignore" in push)) return false;
  if ("branches" in push && !named("branches")) return false;
  return !named("branches-ignore");
}

const workflowRunsUnattended = (name: string) => runsUnattended(triggers(readWorkflow(name)));

/** The packages a command selects with `--filter <name>` or `--filter ./packages/<dir>`. */
function filtered(command: string): string[] {
  const words = command.split(" ");
  return words.flatMap((word, i) => (word === "--filter" && words[i + 1] ? [words[i + 1]!] : []));
}

const runsSuite = (name: string, suite: Suite): boolean =>
  jobs(readWorkflow(name)).some((job) =>
    job.commands.some((command) =>
      filtered(command).some((target) => [suite.name, `./packages/${suite.dir}`].includes(target)),
    ),
  );

describe("every E2E suite runs outside PRs (TPL-976)", () => {
  it("finds the suites", () => {
    // Sanity: an empty enumeration would pass the test below.
    expect(SUITES.map((suite) => suite.name)).toEqual(
      expect.arrayContaining(["@karasu-tools/e2e", "@karasu-tools/vscode-e2e"]),
    );
  });

  it.each(SUITES)("$name has a scheduled or post-merge run, or a recorded gap", (suite) => {
    const unattended = workflowFiles().filter(
      (name) => workflowRunsUnattended(name) && runsSuite(name, suite),
    );
    const exempted = suite.name in NO_UNATTENDED_RUN;
    // An exemption for a suite that gained a run has outlived its reason.
    expect({ runs: unattended.length > 0, exempted }).toEqual({ runs: !exempted, exempted });
  });

  it("names only suites that exist", () => {
    expect(
      Object.keys(NO_UNATTENDED_RUN).filter((name) => !SUITES.some((suite) => suite.name === name)),
    ).toEqual([]);
  });

  it("reads the triggers it relies on", () => {
    expect(workflowRunsUnattended("e2e-nightly.yml")).toBe(true);
    expect(workflowRunsUnattended("e2e.yml")).toBe(false);
    expect(filtered("xvfb-run -a pnpm --filter @karasu-tools/vscode-e2e test")).toEqual([
      "@karasu-tools/vscode-e2e",
    ]);
  });

  it.each([
    [{ push: null }, true],
    [{ push: { branches: ["main"] } }, true],
    [{ push: { branches: ["ma*"] } }, true],
    [{ push: { "branches-ignore": ["release/**"] } }, true],
    [{ schedule: [{ cron: "0 0 * * *" }] }, true],
    [{ push: { tags: ["v*"] } }, false],
    [{ push: { branches: ["release/**"] } }, false],
    [{ push: { "branches-ignore": ["main"] } }, false],
    [{ push: { branches: ["main"], paths: ["packages/**"] } }, false],
    [{ pull_request: null }, false],
  ] as const)("counts %j as unattended: %s", (on, expected) => {
    expect(runsUnattended(on as unknown as { [event: string]: Yaml })).toBe(expected);
  });
});
