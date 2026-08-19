// The `reports/` convention is only worth anything if it is mechanically true:
// generated evidence must be unable to reach a mainline PR, while the README
// that documents the rule must stay committed (Issue #2419). Asserting it
// through `git check-ignore` catches an edit to .gitignore that quietly flips
// either half.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

function isIgnored(path: string): boolean {
  const result = spawnSync("git", ["check-ignore", "-q", "--no-index", path], { cwd: REPO_ROOT });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git check-ignore failed for ${path}: ${result.stderr?.toString() ?? ""}`);
  }
  return result.status === 0;
}

describe("reports/ gitignore rule", () => {
  it.each([
    "reports/demo/index.html",
    "reports/demo/artifact.html",
    "reports/demo/build.ts",
    "reports/node-chrome-poc/shots/before.png",
    "reports/stray-note.md",
  ])("ignores generated output at %s", (path) => {
    expect(isIgnored(path)).toBe(true);
  });

  it("keeps the convention README committable", () => {
    expect(existsSync(join(REPO_ROOT, "reports/README.md"))).toBe(true);
    expect(isIgnored("reports/README.md")).toBe(false);
  });
});
