import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULT_SKIP_DIRS, findFilesBySuffix, resolveTargets } from "./find-files.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "karasu-find-files-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("findFilesBySuffix", () => {
  it("collects matching files recursively and ignores other suffixes", async () => {
    await writeFile(join(tmpDir, "a.krs"), "");
    await writeFile(join(tmpDir, "b.krs.style"), "");
    await mkdir(join(tmpDir, "nested"));
    await writeFile(join(tmpDir, "nested", "c.krs"), "");

    const found = findFilesBySuffix(tmpDir, ".krs", DEFAULT_SKIP_DIRS).sort();
    expect(found).toEqual([join(tmpDir, "a.krs"), join(tmpDir, "nested", "c.krs")]);
  });

  it("does not descend into DEFAULT_SKIP_DIRS entries (including .claude)", async () => {
    await writeFile(join(tmpDir, "keep.krs"), "");
    for (const dir of DEFAULT_SKIP_DIRS) {
      await mkdir(join(tmpDir, dir, "sub"), { recursive: true });
      await writeFile(join(tmpDir, dir, "sub", "skipped.krs"), "");
    }

    const found = findFilesBySuffix(tmpDir, ".krs", DEFAULT_SKIP_DIRS);
    expect(found).toEqual([join(tmpDir, "keep.krs")]);
  });

  it("DEFAULT_SKIP_DIRS covers worktree copies under .claude", () => {
    // Regression guard for the fmt SKIP-set drift: a no-arg `karasu fmt`
    // must not rewrite .krs files inside `.claude/worktrees/` clones.
    expect(DEFAULT_SKIP_DIRS.has(".claude")).toBe(true);
  });
});

describe("resolveTargets", () => {
  it("resolves explicit arguments without invoking the finder", () => {
    let called = false;
    const targets = resolveTargets(["x/y.krs"], () => {
      called = true;
      return [];
    });
    expect(targets).toEqual([resolve("x/y.krs")]);
    expect(called).toBe(false);
  });

  it("falls back to the sorted finder result when no files are given", () => {
    const targets = resolveTargets([], () => ["/b.krs", "/a.krs"]);
    expect(targets).toEqual(["/a.krs", "/b.krs"]);
  });
});
