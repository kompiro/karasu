import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences the trigger decided in ADR-3000: karasu-nest deploys on a push to
// `main` whose `paths:` cover nest and every workspace package it depends on,
// transitively. Those packages are bundled into the Worker, so a change in one
// of them changes the deploy. When nest gains a workspace dependency (the
// preview component from `@karasu-tools/app` is the expected one), a filter
// that was not updated would skip exactly the deploys that ship it, and
// nothing would turn red. This guard turns that into a failing test in the PR
// that adds the dependency.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const PACKAGES_DIR = join(REPO_ROOT, "packages");
const WORKFLOW_FILE = ".github/workflows/nest-deploy.yml";
const NEST_PACKAGE = "@karasu-tools/nest";

type PackageJson = {
  readonly name?: string;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
};

/** Workspace package name → its directory under `packages/`. */
const packageDirs = new Map<string, string>();
const packageJsons = new Map<string, PackageJson>();
for (const dir of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  let pkg: PackageJson;
  try {
    pkg = JSON.parse(readFileSync(join(PACKAGES_DIR, dir.name, "package.json"), "utf8"));
  } catch {
    continue;
  }
  if (!pkg.name) continue;
  packageDirs.set(pkg.name, dir.name);
  packageJsons.set(pkg.name, pkg);
}

/**
 * The `workspace:` dependencies of `name`, followed transitively. Both
 * `dependencies` and `devDependencies` count: wrangler bundles what the Worker
 * imports, whichever key declares it.
 */
function workspaceClosure(name: string): Set<string> {
  const seen = new Set<string>([name]);
  const queue = [name];
  while (queue.length > 0) {
    const pkg = packageJsons.get(queue.shift() as string);
    const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
    for (const [dep, spec] of Object.entries(deps)) {
      if (!spec.startsWith("workspace:") || seen.has(dep)) continue;
      seen.add(dep);
      queue.push(dep);
    }
  }
  return seen;
}

/**
 * `on.push.branches` and `on.push.paths` of the workflow. The file is
 * uniformly formatted (`push:` at 2 spaces, its keys at 4, list items at 6), so
 * a line scan is enough and keeps this guard dependency-free.
 */
function readPushTrigger(): { branches: string[]; paths: string[] } {
  const lines = readFileSync(join(REPO_ROOT, WORKFLOW_FILE), "utf8").split("\n");
  const result = { branches: [] as string[], paths: [] as string[] };
  let inPush = false;
  let key: "branches" | "paths" | null = null;

  for (const line of lines) {
    if (/^ {2}push:\s*$/.test(line)) {
      inPush = true;
      continue;
    }
    if (!inPush) continue;
    if (/^ {0,2}\S/.test(line)) break;

    const inline = /^ {4}(branches|paths):\s*\[(.*)\]\s*$/.exec(line);
    if (inline) {
      result[inline[1] as "branches" | "paths"].push(
        ...inline[2].split(",").map((item) => item.trim().replace(/^["']|["']$/g, "")),
      );
      key = null;
      continue;
    }
    const block = /^ {4}(branches|paths):\s*$/.exec(line);
    if (block) {
      key = block[1] as "branches" | "paths";
      continue;
    }
    const item = /^ {6}-\s*["']?([^"'\s]+)["']?\s*$/.exec(line);
    if (item && key) result[key].push(item[1]);
  }

  return result;
}

describe("karasu-nest deploy trigger", () => {
  const trigger = readPushTrigger();
  const packagePaths = trigger.paths.filter((path) => path.startsWith("packages/"));
  const expected = [...workspaceClosure(NEST_PACKAGE)]
    .map((name) => packageDirs.get(name))
    .filter((dir): dir is string => dir !== undefined)
    .map((dir) => `packages/${dir}/**`);

  it("deploys on a push to main", () => {
    expect(trigger.branches).toEqual(["main"]);
  });

  it("covers nest and every workspace package nest depends on, transitively", () => {
    expect(expected).toContain("packages/nest/**");
    const missing = expected.filter((path) => !packagePaths.includes(path));
    expect(missing, `add these to on.push.paths in ${WORKFLOW_FILE}`).toEqual([]);
  });

  it("lists no package nest does not depend on", () => {
    const stale = packagePaths.filter((path) => !expected.includes(path));
    expect(stale, `remove these from on.push.paths in ${WORKFLOW_FILE}`).toEqual([]);
  });

  it("redeploys when the workflow itself changes", () => {
    expect(trigger.paths).toContain(WORKFLOW_FILE);
  });

  // Security fixes for bundled third-party code arrive as `overrides:` in
  // pnpm-workspace.yaml and touch no package.json, so the package paths above
  // would not see them.
  it("redeploys when the workspace overrides change", () => {
    expect(trigger.paths).toContain("pnpm-workspace.yaml");
  });
});
