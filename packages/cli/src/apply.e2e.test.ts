import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { apply, applyIncoming } from "./apply.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockStdin(content: string): () => void {
  const emitter = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
  emitter.setEncoding = vi.fn<typeof emitter.setEncoding>();

  const original = process.stdin;
  Object.defineProperty(process, "stdin", { value: emitter, writable: true });

  // Emit data asynchronously to simulate real stdin piping
  setTimeout(() => {
    if (content) emitter.emit("data", content);
    emitter.emit("end");
  }, 0);

  return () => {
    Object.defineProperty(process, "stdin", { value: original, writable: true });
  };
}

// ── applyIncoming unit tests ───────────────────────────────────────────────────

describe("applyIncoming", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-apply-e2e-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // AT-0060-01
  it("appends a new block when the target file is empty", () => {
    const incoming = 'deploy "production" {\n  oci "api" {}\n}';
    const result = applyIncoming("", incoming);
    expect(result).toBe(incoming);
  });

  // AT-0060-02
  it("appends a new block when the node ID does not exist in the file", () => {
    const existing = "system ECommerce {}";
    const incoming = 'deploy "production" {\n  oci "api" {}\n}';
    const result = applyIncoming(existing, incoming);
    expect(result).toBe(existing + "\n" + incoming);
  });

  // AT-0060-03
  it("replaces an existing deploy block when the ID already exists", () => {
    const existing = 'deploy "production" {\n  oci "old-api" {}\n}';
    const incoming = 'deploy "production" {\n  oci "new-api" {}\n}';
    const result = applyIncoming(existing, incoming);
    expect(result).toBe(incoming);
    expect(result).not.toContain("old-api");
    expect(result).toContain("new-api");
  });

  // AT-0060-04
  it("replaces an existing logical node (system) when the ID already exists", () => {
    const existing = "system ECommerce {\n  service OrderService {}\n}";
    const incoming =
      "system ECommerce {\n  service OrderService {}\n  service PaymentService {}\n}";
    const result = applyIncoming(existing, incoming);
    expect(result).toBe(incoming);
    expect(result).toContain("PaymentService");
  });

  // AT-0060-05
  it("appends when incoming has a new node, replaces when it has an existing node", () => {
    const existing = 'system ECommerce {}\n\ndeploy "prod" {\n  oci "api" {}\n}';
    // incoming updates the deploy block and adds a new system
    const incoming = 'deploy "prod" {\n  oci "api-v2" {}\n}\n\nsystem Payments {}';
    const result = applyIncoming(existing, incoming);
    expect(result).toContain("system ECommerce {}");
    expect(result).toContain("api-v2");
    expect(result).not.toContain('oci "api" {}');
    expect(result).toContain("system Payments {}");
  });

  // AT-0060-06
  it("writes the result to the target file when the file does not exist", () => {
    const targetPath = join(tmpDir, "new.krs");
    expect(existsSync(targetPath)).toBe(false);

    const incoming = "system Foo {}";
    const result = applyIncoming("", incoming);
    writeFileSync(targetPath, result, "utf-8");

    expect(existsSync(targetPath)).toBe(true);
    expect(readFileSync(targetPath, "utf-8")).toBe(incoming);
  });

  // AT-0060-07
  it("writes the result to the target file when appending", () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "system ECommerce {}", "utf-8");

    const incoming = "system Payments {}";
    const existing = readFileSync(targetPath, "utf-8");
    const result = applyIncoming(existing, incoming);
    writeFileSync(targetPath, result, "utf-8");

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toContain("system ECommerce {}");
    expect(content).toContain("system Payments {}");
  });

  // AT-0060-08
  it("handles incoming content with no recognizable top-level nodes by appending as-is", () => {
    const existing = "system Foo {}";
    // Plain text that doesn't parse as any known node
    const incoming = "// just a comment";
    const result = applyIncoming(existing, incoming);
    expect(result).toContain("system Foo {}");
    expect(result).toContain("// just a comment");
  });
});

// ── apply() integration tests (stdin + file I/O) ──────────────────────────────

describe("apply (stdin integration)", () => {
  let tmpDir: string;
  let restoreStdin: () => void;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-apply-stdin-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    restoreStdin?.();
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // AT-0060-09
  it("creates a new file when target does not exist", async () => {
    const targetPath = join(tmpDir, "deploy.krs");
    const content = 'deploy "production" {\n  oci "api" {}\n}';
    restoreStdin = mockStdin(content);

    await apply(targetPath);

    expect(existsSync(targetPath)).toBe(true);
    expect(readFileSync(targetPath, "utf-8")).toBe(content);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // AT-0060-10
  it("appends to an existing file when node ID differs", async () => {
    const targetPath = join(tmpDir, "deploy.krs");
    writeFileSync(targetPath, 'deploy "prod" {\n  oci "api" {}\n}', "utf-8");

    restoreStdin = mockStdin('deploy "staging" {\n  oci "api" {}\n}');
    await apply(targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toContain('deploy "prod"');
    expect(content).toContain('deploy "staging"');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // AT-0060-11
  it("replaces an existing node when node ID matches", async () => {
    const targetPath = join(tmpDir, "deploy.krs");
    writeFileSync(targetPath, 'deploy "prod" {\n  oci "api-v1" {}\n}', "utf-8");

    restoreStdin = mockStdin('deploy "prod" {\n  oci "api-v2" {}\n}');
    await apply(targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toContain("api-v2");
    expect(content).not.toContain("api-v1");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // AT-0060-12
  it("exits with code 1 and prints error when stdin is empty", async () => {
    const targetPath = join(tmpDir, "deploy.krs");
    restoreStdin = mockStdin("");

    await apply(targetPath);

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("stdin is empty"));
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(existsSync(targetPath)).toBe(false);
  });
});
