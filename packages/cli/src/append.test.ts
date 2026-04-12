import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { append } from "./append.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockStdin(content: string): () => void {
  const emitter = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
  emitter.setEncoding = vi.fn<typeof emitter.setEncoding>();

  const original = process.stdin;
  Object.defineProperty(process, "stdin", { value: emitter, writable: true });

  setTimeout(() => {
    if (content) emitter.emit("data", content);
    emitter.emit("end");
  }, 0);

  return () => {
    Object.defineProperty(process, "stdin", { value: original, writable: true });
  };
}

// ── append() integration tests ────────────────────────────────────────────────

describe("append", () => {
  let tmpDir: string;
  let restoreStdin: () => void;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-append-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    restoreStdin?.();
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // AT-0080-01: appends block at end of file
  it("appends a block at the end of an existing file", async () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "system ECommerce {}", "utf-8");
    restoreStdin = mockStdin("service Payments {}");

    await append(targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toContain("system ECommerce {}");
    expect(content).toContain("service Payments {}");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // AT-0080-02: creates the file if it does not exist
  it("creates the file when it does not exist", async () => {
    const targetPath = join(tmpDir, "new.krs");
    expect(existsSync(targetPath)).toBe(false);
    restoreStdin = mockStdin("system ECommerce {}");

    await append(targetPath);

    expect(existsSync(targetPath)).toBe(true);
    expect(readFileSync(targetPath, "utf-8")).toBe("system ECommerce {}");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // AT-0080-04: exits with code 1 when stdin is empty
  it("exits with code 1 and prints error when stdin is empty", async () => {
    const targetPath = join(tmpDir, "arch.krs");
    restoreStdin = mockStdin("");

    await append(targetPath);

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("stdin is empty"));
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(existsSync(targetPath)).toBe(false);
  });

  it("appends a second block to a file that already has one", async () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "system ECommerce {}", "utf-8");
    restoreStdin = mockStdin("system Payments {}");

    await append(targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toBe("system ECommerce {}\nsystem Payments {}");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("trims surrounding whitespace from stdin content before appending", async () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "system ECommerce {}", "utf-8");
    restoreStdin = mockStdin("  service Foo {}  \n");

    await append(targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toBe("system ECommerce {}\nservice Foo {}");
  });
});
