import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { insert } from "./insert.js";
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

// ── insert multi-node scenarios ───────────────────────────────────────────────

describe("insert — multi-node file scenarios", () => {
  let tmpDir: string;
  let restoreStdin: () => void;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-insert-e2e-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    restoreStdin?.();
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("inserts multiple children in sequence, all ending up inside the parent", async () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "system ECommerce {}", "utf-8");

    restoreStdin = mockStdin("service OrderService {}");
    await insert("ECommerce", targetPath);
    restoreStdin();

    restoreStdin = mockStdin("service PaymentService {}");
    await insert("ECommerce", targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toBe(
      "system ECommerce {\n  service OrderService {}\n  service PaymentService {}\n}",
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("inserts a multi-line child with correct relative indentation", async () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "system ECommerce {}", "utf-8");

    const childContent =
      "service OrderService {\n  usecase PlaceOrder {}\n  usecase GetOrder {}\n}";
    restoreStdin = mockStdin(childContent);
    await insert("ECommerce", targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toBe(
      "system ECommerce {\n  service OrderService {\n    usecase PlaceOrder {}\n    usecase GetOrder {}\n  }\n}",
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("inserts into a deeply nested block at the correct indent level", async () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(
      targetPath,
      "system Outer {\n  system Inner {\n    service Existing {}\n  }\n}",
      "utf-8",
    );

    restoreStdin = mockStdin("service New {}");
    await insert("Inner", targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toBe(
      "system Outer {\n  system Inner {\n    service Existing {}\n    service New {}\n  }\n}",
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("leaves sibling top-level nodes unchanged when inserting into one system", async () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "system ECommerce {}\n\nsystem Payments {}", "utf-8");

    restoreStdin = mockStdin("service OrderService {}");
    await insert("ECommerce", targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toContain("system ECommerce {\n  service OrderService {}\n}");
    expect(content).toContain("system Payments {}");
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

// ── translate → insert pipeline ───────────────────────────────────────────────

describe("translate | insert pipeline — openapi", () => {
  let tmpDir: string;
  let restoreStdin: () => void;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-insert-e2e-openapi-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    restoreStdin?.();
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("inserts a translated service block as a child of an existing system", async () => {
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

    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "system ECommerce {}", "utf-8");

    const cap = captureOutput();
    await translate(inputPath, { from: "openapi", service: "OrderService" });
    cap.restore();

    restoreStdin = mockStdin(cap.stdout().trim());
    await insert("ECommerce", targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toMatch(/system ECommerce \{/);
    expect(content).toContain("service OrderService {");
    expect(content).toContain("usecase PlaceOrder");
    // The service should be inside the system block (before the outer closing `}`)
    const systemEnd = content.indexOf("\n}");
    const serviceStart = content.indexOf("service OrderService");
    expect(serviceStart).toBeLessThan(systemEnd);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
