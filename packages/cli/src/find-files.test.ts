import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
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
  let stderr: string;
  let exitCode: number | undefined;

  beforeEach(() => {
    stderr = "";
    exitCode = undefined;
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    vi.spyOn(process, "exit").mockImplementation((code) => {
      exitCode = Number(code ?? 0);
      return undefined as never;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("takes a file argument as it is, whatever its suffix", async () => {
    const file = join(tmpDir, "notes.txt");
    await writeFile(file, "");

    expect(resolveTargets([file], ".krs")).toEqual([file]);
  });

  it("walks the working directory, sorted, when no files are given", async () => {
    await writeFile(join(tmpDir, "b.krs"), "");
    await writeFile(join(tmpDir, "a.krs"), "");
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);

    expect(resolveTargets([], ".krs")).toEqual([join(tmpDir, "a.krs"), join(tmpDir, "b.krs")]);
  });

  // #3106: a directory argument was read as a file and crashed with a stack trace.
  it("expands a directory argument to the matching files under it", async () => {
    await writeFile(join(tmpDir, "b.krs"), "");
    await writeFile(join(tmpDir, "theme.krs.style"), "");
    await mkdir(join(tmpDir, "nested"));
    await writeFile(join(tmpDir, "nested", "a.krs"), "");
    await mkdir(join(tmpDir, "node_modules"));
    await writeFile(join(tmpDir, "node_modules", "skipped.krs"), "");

    expect(resolveTargets([tmpDir], ".krs")).toEqual([
      join(tmpDir, "b.krs"),
      join(tmpDir, "nested", "a.krs"),
    ]);
    expect(resolveTargets([tmpDir], ".krs.style")).toEqual([join(tmpDir, "theme.krs.style")]);
  });

  it("returns an empty list for a directory with no matching file", async () => {
    expect(resolveTargets([tmpDir], ".krs")).toEqual([]);
    expect(exitCode).toBeUndefined();
  });

  it("lists a file once when a directory argument also covers it", async () => {
    const file = join(tmpDir, "a.krs");
    await writeFile(file, "");

    expect(resolveTargets([file, tmpDir], ".krs")).toEqual([file]);
  });

  it("reports an argument that is not there as not found", () => {
    const missing = join(tmpDir, "missing.krs");

    expect(resolveTargets([missing], ".krs")).toBeUndefined();
    expect(exitCode).toBe(1);
    expect(stderr).toBe(`Error: File not found: ${missing}\n`);
  });
});
