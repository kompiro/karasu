import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { insert } from "./insert.js";

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

// ── insert() integration tests ────────────────────────────────────────────────

describe("insert", () => {
  let tmpDir: string;
  let restoreStdin: () => void;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-insert-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    restoreStdin?.();
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("inserts a child node into an existing parent block", async () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "system ECommerce {\n  service OrderService {}\n}", "utf-8");
    restoreStdin = mockStdin("service PaymentService {}");

    await insert("ECommerce", targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toBe(
      "system ECommerce {\n  service OrderService {}\n  service PaymentService {}\n}",
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("inserts a child into an empty (inline) block", async () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "system ECommerce {}", "utf-8");
    restoreStdin = mockStdin("service Payments {}");

    await insert("ECommerce", targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toBe("system ECommerce {\n  service Payments {}\n}");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("exits with code 1 and prints error when stdin is empty", async () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "system ECommerce {}", "utf-8");
    restoreStdin = mockStdin("");

    await insert("ECommerce", targetPath);

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("stdin is empty"));
    expect(exitSpy).toHaveBeenCalledWith(1);
    // File should be unchanged
    expect(readFileSync(targetPath, "utf-8")).toBe("system ECommerce {}");
  });

  it("exits with code 1 and prints error when file does not exist", async () => {
    const nonExistentPath = join(tmpDir, "does-not-exist.krs");
    restoreStdin = mockStdin("service Foo {}");

    await insert("ECommerce", nonExistentPath);

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("does-not-exist.krs"));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits with code 1 and prints error when parent node is not found", async () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "system ECommerce {}", "utf-8");
    restoreStdin = mockStdin("service Foo {}");

    await insert("NonExistent", targetPath);

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("NonExistent"));
    expect(exitSpy).toHaveBeenCalledWith(1);
    // File should be unchanged
    expect(readFileSync(targetPath, "utf-8")).toBe("system ECommerce {}");
  });
});
