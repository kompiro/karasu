import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { append } from "./append.js";
import { applyIncoming } from "./apply.js";
import { translate } from "./translate/index.js";

// ── Capture helpers ───────────────────────────────────────────────────────────

function captureOutput(): { stdout: () => string; restore: () => void } {
  let out = "";
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  return {
    stdout: () => out,
    restore: () => stdoutSpy.mockRestore(),
  };
}

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

// ── append multi-step scenarios ───────────────────────────────────────────────

describe("append — multi-step file scenarios", () => {
  let tmpDir: string;
  let restoreStdin: () => void;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-append-e2e-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    restoreStdin?.();
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // AT-0080-01 (extended): appending multiple blocks in sequence
  it("appends multiple blocks in sequence, each appearing after the previous", async () => {
    const targetPath = join(tmpDir, "arch.krs");

    restoreStdin = mockStdin("system ECommerce {}");
    await append(targetPath);
    restoreStdin();

    restoreStdin = mockStdin("service Payments {}");
    await append(targetPath);
    restoreStdin();

    restoreStdin = mockStdin('deploy "production" {}');
    await append(targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toBe('system ECommerce {}\nservice Payments {}\ndeploy "production" {}');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // AT-0080-03 (stdin variant): same as apply but always appends, no replace
  it("appends even when a node with the same ID already exists (unlike apply)", async () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "system ECommerce {}", "utf-8");

    restoreStdin = mockStdin("system ECommerce {}");
    await append(targetPath);

    const content = readFileSync(targetPath, "utf-8");
    // append always adds — no deduplication
    expect(content.match(/system ECommerce \{\}/g)?.length).toBe(2);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

// ── translate → append pipeline ──────────────────────────────────────────────

describe("translate | append pipeline — openapi", () => {
  let tmpDir: string;
  let restoreStdin: () => void;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-append-e2e-openapi-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    restoreStdin?.();
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // AT-0080-03: stdin variant — translate output piped to append
  it("appends a service block translated from OpenAPI to an empty file", async () => {
    const inputPath = join(tmpDir, "order-api.yaml");
    writeFileSync(
      inputPath,
      `
openapi: "3.0.0"
info:
  title: Order API
paths:
  /orders:
    post:
      operationId: placeOrder
`,
    );

    const cap = captureOutput();
    await translate(inputPath, { from: "openapi", service: "OrderService" });
    cap.restore();

    const targetPath = join(tmpDir, "arch.krs");
    const translated = cap.stdout().trim();

    restoreStdin = mockStdin(translated);
    await append(targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toContain("service OrderService {");
    expect(content).toContain("usecase ManageOrders");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("appends a second translated service, keeping both in the file", async () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "service OrderService {\n  usecase PlaceOrder {}\n}", "utf-8");

    const paymentApiPath = join(tmpDir, "payment-api.yaml");
    writeFileSync(
      paymentApiPath,
      `
openapi: "3.0.0"
info:
  title: Payment API
paths:
  /payments:
    post:
      operationId: createPayment
`,
    );

    const cap = captureOutput();
    await translate(paymentApiPath, { from: "openapi", service: "PaymentService" });
    cap.restore();

    // Use applyIncoming (apply) to verify append differs: apply would replace if ID matches,
    // append always adds. Here IDs differ so both should appear.
    const translated = cap.stdout().trim();
    restoreStdin = mockStdin(translated);
    await append(targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toContain("service OrderService {");
    expect(content).toContain("service PaymentService {");
    expect(content).toContain("usecase ManagePayments");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // Contrast with apply: append does NOT replace existing nodes
  it("differs from apply — appends even when the same service ID already exists", async () => {
    const inputPath = join(tmpDir, "api.yaml");
    writeFileSync(
      inputPath,
      `
openapi: "3.0.0"
info:
  title: Order API
paths:
  /orders:
    post:
      operationId: placeOrder
`,
    );

    const cap1 = captureOutput();
    await translate(inputPath, { from: "openapi", service: "OrderService" });
    cap1.restore();
    const translated = cap1.stdout().trim();

    const targetPath = join(tmpDir, "arch.krs");
    // First: apply (replaces/creates correctly)
    writeFileSync(targetPath, applyIncoming("", translated), "utf-8");
    expect(readFileSync(targetPath, "utf-8").match(/service OrderService \{/g)?.length).toBe(1);

    // Second: append (always adds — creates a duplicate)
    restoreStdin = mockStdin(translated);
    await append(targetPath);
    expect(readFileSync(targetPath, "utf-8").match(/service OrderService \{/g)?.length).toBe(2);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
