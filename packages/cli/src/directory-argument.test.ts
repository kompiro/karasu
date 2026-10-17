import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("./stdin.js", () => ({ readStdin: async () => "service Added {}\n" }));

const { remove } = await import("./remove.js");
const { insert } = await import("./insert.js");
const { apply } = await import("./apply.js");
const { append } = await import("./append.js");
const { fmt } = await import("./fmt.js");
const { diff } = await import("./diff.js");
const { translate } = await import("./translate/index.js");

/**
 * Every command that takes a path, given a directory (#3106, TPL-2942).
 *
 * #2942 fixed the commands that share `resolveKrsFileOrExit`; the others
 * checked the path on their own and, given a directory, printed a raw
 * `EISDIR`, a Node stack trace, or "File not found" for a path that exists.
 * Each command now either takes the directory (fmt walks it, diff reads its
 * index.krs) or stops with a message that says it is a directory.
 */
describe("a directory argument", () => {
  let tmpDir: string;
  let dir: string;
  let stderr: string;
  let stdout: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-dir-arg-"));
    dir = join(tmpDir, "e");
    mkdirSync(dir);
    stderr = "";
    stdout = "";
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    // Throw so a command stops where it exits, as the real process would.
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const isDirectory = () => `Error: ${dir} is a directory; pass a .krs file\n`;

  it("remove says the path is a directory", () => {
    expect(() => remove("A", dir)).toThrow("process.exit(1)");
    expect(stderr).toBe(isDirectory());
  });

  it("insert says the path is a directory", async () => {
    await expect(insert("A", dir)).rejects.toThrow("process.exit(1)");
    expect(stderr).toBe(isDirectory());
  });

  it("apply says the path is a directory, and writes nothing", async () => {
    await expect(apply(dir)).rejects.toThrow("process.exit(1)");
    expect(stderr).toBe(isDirectory());
    expect(readdirSync(dir)).toEqual([]);
  });

  it("append says the path is a directory, and writes nothing", async () => {
    await expect(append(dir)).rejects.toThrow("process.exit(1)");
    expect(stderr).toBe(isDirectory());
    expect(readdirSync(dir)).toEqual([]);
  });

  it("translate says the source is a directory, not that it is missing", async () => {
    await expect(translate(dir, { from: "compose" })).rejects.toThrow("process.exit(1)");
    expect(stderr).toBe(`Error: ${dir} is a directory; pass a file\n`);
  });

  it("fmt formats every .krs file under the directory", async () => {
    mkdirSync(join(dir, "nested"));
    writeFileSync(join(dir, "a.krs"), "system   S {}\n");
    writeFileSync(join(dir, "nested", "b.krs"), "service   B {}\n");

    await fmt([dir], {});

    expect(stderr).toBe("");
    expect(readFileSync(join(dir, "a.krs"), "utf8")).toBe("system S {}\n");
    expect(readFileSync(join(dir, "nested", "b.krs"), "utf8")).toBe("service B {}\n");
  });

  it("fmt on an empty directory reports no files instead of a stack trace", async () => {
    await expect(fmt([dir], {})).rejects.toThrow("process.exit(0)");
    expect(stderr).toBe("No .krs files found.\n");
  });

  it("diff reads each directory's index.krs", async () => {
    const before = join(tmpDir, "before");
    mkdirSync(before);
    writeFileSync(join(before, "index.krs"), "system S {\n  service A {}\n}\n");
    writeFileSync(join(dir, "index.krs"), "system S {\n  service A {}\n  service B {}\n}\n");
    const output = join(tmpDir, "diff.svg");

    await diff(before, dir, { view: "system", output });

    expect(stderr).not.toContain("not found");
    expect(readFileSync(output, "utf8")).toContain("<svg");
  });

  it("diff says a directory without index.krs has none, not that it is missing", async () => {
    writeFileSync(join(tmpDir, "a.krs"), "system S {}\n");

    await expect(diff(join(tmpDir, "a.krs"), dir, {})).rejects.toThrow("process.exit(1)");
    expect(stderr).toBe(`Error: ${dir} has no index.krs; pass the entry .krs file\n`);
  });

  it("diff resolves the file side before reading stdin, so an early exit leaves no tempfile", async () => {
    await expect(diff("-", dir, {})).rejects.toThrow("process.exit(1)");
    expect(stderr).toContain("has no index.krs");
    expect(readdirSync(dir)).toEqual([]);
  });
});
