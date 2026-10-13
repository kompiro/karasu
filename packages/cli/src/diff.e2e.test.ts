import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { diff } from "./diff.js";

/**
 * AT-1020: stdin handling for `karasu diff -`. Mocks process.stdin so the
 * stdin shim treats the test data as a piped revision (typical in a git
 * external-diff invocation: `git show HEAD~1:file.krs | karasu diff - new.krs`).
 */

let tmpDir: string;
let stderrSpy: ReturnType<typeof vi.spyOn>;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let stdout = "";
let stderr = "";

function pipeStdin(text: string): () => void {
  const original = Object.getOwnPropertyDescriptor(process, "stdin")!;
  const stream = Readable.from([Buffer.from(text)]);
  Object.defineProperty(process, "stdin", { value: stream, configurable: true });
  return () => Object.defineProperty(process, "stdin", original);
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "karasu-diff-e2e-"));
  stdout = "";
  stderr = "";
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  exitSpy = vi.spyOn(process, "exit").mockImplementation(((_code: number) => {
    throw new Error(`process.exit(${_code})`);
  }) as never);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  exitSpy.mockRestore();
});

describe("AT-1020 karasu diff — stdin handling", () => {
  it("reads the before side from stdin when first arg is `-`", async () => {
    const after = join(tmpDir, "after.krs");
    await writeFile(after, "system Demo { service Api {} service NewService {} }\n");
    const restore = pipeStdin("system Demo { service Api {} }\n");
    try {
      await diff("-", after, {});
    } finally {
      restore();
    }
    expect(stdout).toContain("<svg");
    expect(stdout).toMatch(/<g[^>]*data-diff-state="added"/);
  });

  it("reads the after side from stdin when second arg is `-`", async () => {
    const before = join(tmpDir, "before.krs");
    await writeFile(before, "system Demo { service Api {} service Removed {} }\n");
    const restore = pipeStdin("system Demo { service Api {} }\n");
    try {
      await diff(before, "-", {});
    } finally {
      restore();
    }
    expect(stdout).toContain("<svg");
    expect(stdout).toMatch(/<g[^>]*data-diff-state="removed"/);
  });

  // #2879: the after model's warnings name the entry as the user typed it. For
  // a stdin side that is `-`, not the temporary file the shim deletes on exit.
  it("names a stdin after side `-` in its warnings", async () => {
    const before = join(tmpDir, "before.krs");
    await writeFile(before, "system Demo { service Api {} }\n");
    const restore = pipeStdin("system Demo { service Api {} }\ndomain Orphan {}\n");
    try {
      await diff(before, "-", {});
    } finally {
      restore();
    }
    expect(stderr).toContain('Warning: -:2:1: Domain "Orphan" is not assigned to any service');
    expect(stderr).not.toContain(".karasu-diff-");
  });

  // #3122: a relative import in the stdin side resolves against the other
  // side's directory, the way it does for the file on disk. The shim used to
  // write stdin one directory below it, where `./` found nothing.
  it("resolves a stdin before side's relative imports against the after side's directory", async () => {
    await writeFile(join(tmpDir, "shared.krs"), "system Demo { service Shared {} }\n");
    const after = join(tmpDir, "after.krs");
    await writeFile(
      after,
      'import "./shared.krs"\nsystem Demo { service Api {} service NewService {} }\n',
    );
    const restore = pipeStdin('import "./shared.krs"\nsystem Demo { service Api {} }\n');
    try {
      await diff("-", after, {});
    } finally {
      restore();
    }
    expect(stderr).not.toContain("not found");
    expect(stdout).toMatch(/<g[^>]*data-node-id="Shared"[^>]*data-diff-state="unchanged"/);
    expect(stdout).toMatch(/<g[^>]*data-node-id="NewService"[^>]*data-diff-state="added"/);
  });

  it("resolves a stdin after side's style import against the before side's directory", async () => {
    await writeFile(join(tmpDir, "after.krs.style"), "service { color: #ff0000; }\n");
    const before = join(tmpDir, "before.krs");
    await writeFile(before, "system Demo { service Api {} }\n");
    const restore = pipeStdin('@import "./after.krs.style"\nsystem Demo { service Api {} }\n');
    try {
      await diff(before, "-", {});
    } finally {
      restore();
    }
    expect(stderr).not.toContain("Style file not found");
  });

  it("removes the stdin tempfile from the other side's directory", async () => {
    const before = join(tmpDir, "before.krs");
    await writeFile(before, "system Demo { service Api {} }\n");
    const restore = pipeStdin("system Demo { service Api {} }\n");
    try {
      await diff(before, "-", {});
    } finally {
      restore();
    }
    expect(await readdir(tmpDir)).toEqual(["before.krs"]);
  });

  // `process.exit` skips a pending `finally`, so a failing diff must remove
  // the tempfile before it exits. The mocked exit throws, which would run the
  // `finally` anyway, so look at the directory at the moment exit is called.
  it("removes the stdin tempfile before exiting on a failed compile", async () => {
    const before = join(tmpDir, "before.krs");
    await writeFile(before, "system Demo { service Api {} }\n");
    let filesAtExit: string[] = [];
    exitSpy.mockImplementation(((code: number) => {
      filesAtExit = readdirSync(tmpDir);
      throw new Error(`process.exit(${code})`);
    }) as never);
    const restore = pipeStdin("system Demo { service Api {\n");
    try {
      await expect(diff(before, "-", {})).rejects.toThrow("process.exit(1)");
    } finally {
      restore();
    }
    expect(stderr).toContain("Error:");
    expect(filesAtExit).toEqual(["before.krs"]);
  });
});

// #2715: core positions are 1-based, and `karasu diff` used to add 1 to both
// axes before printing them, the same slip `karasu render` had.
describe("karasu diff: printed positions are not shifted (#2715)", () => {
  it("prints a warning at the declaration's own line and column", async () => {
    const before = join(tmpDir, "before.krs");
    const after = join(tmpDir, "after.krs");
    await writeFile(before, "system Legacy {\n  service Search\n}\n");
    // The second `Search` loses the id, so the warning anchors on line 5, column 3.
    await writeFile(
      after,
      "system Legacy {\n  service Search\n}\nsystem Next {\n  service Search\n}\n",
    );

    await diff(before, after, {});

    expect(stderr).toMatch(/^Warning: 5:3 Node id "Search" appears in multiple locations/m);
  });
});
