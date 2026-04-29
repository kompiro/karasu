import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
    expect(stdout).toContain('data-diff-state="added"');
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
    expect(stdout).toContain('data-diff-state="removed"');
  });
});
