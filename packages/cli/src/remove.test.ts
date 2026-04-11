import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { remove } from "./remove.js";

describe("remove", () => {
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-remove-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // AT-0070-01: removes the target node from the file
  it("removes a top-level node from the file", () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "system ECommerce {}\n\nservice PaymentService {}\n", "utf-8");

    remove("PaymentService", targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toContain("system ECommerce {}");
    expect(content).not.toContain("PaymentService");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // AT-0070-01 (deploy variant): removes a deploy block
  it("removes a deploy block from the file", () => {
    const targetPath = join(tmpDir, "deploy.krs");
    writeFileSync(
      targetPath,
      'deploy "production" {\n  oci "api" {}\n}\n\ndeploy "staging" {\n  oci "api" {}\n}\n',
      "utf-8",
    );

    remove("production", targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).not.toContain('"production"');
    expect(content).toContain('"staging"');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // AT-0070-02: surrounding whitespace is cleaned up correctly
  it("does not leave orphaned blank lines after removal of a middle node", () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(
      targetPath,
      "system ECommerce {}\n\nservice PaymentService {}\n\nservice OrderService {}\n",
      "utf-8",
    );

    remove("PaymentService", targetPath);

    const content = readFileSync(targetPath, "utf-8");
    // Should not have consecutive blank lines
    expect(content).not.toMatch(/\n{3,}/);
    expect(content).toContain("system ECommerce {}");
    expect(content).toContain("service OrderService {}");
  });

  it("does not leave orphaned blank lines after removal of the only node", () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "system ECommerce {}\n", "utf-8");

    remove("ECommerce", targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content.trim()).toBe("");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // AT-0070-03: exits with non-zero if node ID is not found
  it("exits with code 1 and prints error when node ID is not found", () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "system ECommerce {}\n", "utf-8");

    remove("NonExistentNode", targetPath);

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("NonExistentNode"));
    expect(exitSpy).toHaveBeenCalledWith(1);
    // File should be unchanged
    expect(readFileSync(targetPath, "utf-8")).toBe("system ECommerce {}\n");
  });

  // AT-0070-04: exits with non-zero if the file does not exist
  it("exits with code 1 and prints error when file does not exist", () => {
    const nonExistentPath = join(tmpDir, "does-not-exist.krs");

    remove("SomeNode", nonExistentPath);

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("does-not-exist.krs"));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
