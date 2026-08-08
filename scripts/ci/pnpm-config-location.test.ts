import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences where pnpm configuration lives, decided in ADR-2401 (pnpm 11
// migration). pnpm 11 no longer reads the `pnpm` field of `package.json`
// (pnpm/pnpm#10086) and, critically, does not error when it finds one — it
// prints a warning and carries on with the setting absent.
//
// That failure mode is why this guard exists. The block that would go silent is
// `overrides:`, which is where every transitive security floor lives (ADR-1474
// and the ~10 security ADRs that follow it). Those ADRs all say "root
// `package.json` の `pnpm.overrides`", because that was true when they were
// written, so the documented remediation procedure now points at a file where
// edits do nothing. Someone following one of them would raise a floor, see a
// green build, and ship an unpatched dependency.

const REPO_ROOT = resolve(import.meta.dirname, "../..");

/** Keys pnpm 11 removed outright; writing them anywhere is a silent no-op. */
const REMOVED_WORKSPACE_KEYS = [
  "onlyBuiltDependencies",
  "onlyBuiltDependenciesFile",
  "neverBuiltDependencies",
  "ignoredBuiltDependencies",
  "ignoreDepScripts",
  "allowNonAppliedPatches",
  "ignorePatchFailures",
  "managePackageManagerVersions",
  "packageManagerStrict",
  "packageManagerStrictVersion",
];

const read = (path: string): string => readFileSync(join(REPO_ROOT, path), "utf8");

const packageManifests = (): string[] =>
  [
    "package.json",
    ...readdirSync(join(REPO_ROOT, "packages")).map((p) => `packages/${p}/package.json`),
  ]
    .filter((file) => existsSync(join(REPO_ROOT, file)))
    .sort();

/**
 * Top-level keys of `pnpm-workspace.yaml`. A line scan rather than a YAML
 * parser, matching the other guards in this directory — the file is a flat map
 * of scalars and simple blocks, and staying dependency-free keeps the guard
 * from failing for reasons unrelated to what it checks.
 */
const workspaceTopLevelKeys = (): string[] =>
  read("pnpm-workspace.yaml")
    .split("\n")
    .flatMap((line) => {
      const match = /^([A-Za-z][A-Za-z0-9_-]*):/.exec(line);
      return match ? [match[1]] : [];
    });

/** Entry keys nested one level under the given top-level key. */
const workspaceBlockEntries = (key: string): string[] => {
  const lines = read("pnpm-workspace.yaml").split("\n");
  const start = lines.findIndex((line) => new RegExp(`^${key}:\\s*$`).test(line));
  if (start === -1) return [];
  const entries: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const match = /^ {2}["']?([^"':\s]+)["']?:/.exec(line);
    if (match) entries.push(match[1]);
  }
  return entries;
};

describe("pnpm configuration location (ADR-2401)", () => {
  it("finds the manifests it is meant to guard", () => {
    // Parser sanity: an empty set would make every assertion below vacuous.
    expect(packageManifests().length).toBeGreaterThan(5);
  });

  it("keeps no `pnpm` field in any package.json", () => {
    const offenders = packageManifests().filter((file) => {
      const manifest = JSON.parse(read(file)) as Record<string, unknown>;
      return manifest.pnpm !== undefined;
    });
    // pnpm only warns about this, so nothing else in the pipeline fails.
    expect(offenders).toEqual([]);
  });

  it("declares the security floors in pnpm-workspace.yaml, where pnpm reads them", () => {
    expect(workspaceTopLevelKeys(), "pnpm-workspace.yaml has no `overrides:` block").toContain(
      "overrides",
    );
    // Guards against the block being emptied rather than moved. The exact count
    // is expected to drift as advisories come and go; the floor is what matters.
    expect(workspaceBlockEntries("overrides").length).toBeGreaterThan(15);
  });

  it("uses no pnpm-10 setting that v11 removed", () => {
    const keys = workspaceTopLevelKeys();
    const offenders = REMOVED_WORKSPACE_KEYS.filter((key) => keys.includes(key));
    expect(offenders).toEqual([]);
  });

  it("pins a pnpm major that reads this layout", () => {
    const root = JSON.parse(read("package.json")) as { packageManager?: string };
    const major = /^pnpm@(\d+)\./.exec(root.packageManager ?? "")?.[1];
    // Below 11 the `pnpm` field is still honoured, so the guard above would be
    // asserting a layout the toolchain does not actually require.
    expect(Number(major)).toBeGreaterThanOrEqual(11);
  });
});
