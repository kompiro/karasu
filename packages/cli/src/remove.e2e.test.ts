import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { remove } from "./remove.js";
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

// ── remove + apply pipeline ───────────────────────────────────────────────────

describe("remove — multi-node file scenarios", () => {
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-remove-e2e-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // AT-0070-01 (extended): removes one node from a file with many top-level nodes,
  // leaving all others intact.
  it("removes a single node from a file with multiple top-level nodes", () => {
    const targetPath = join(tmpDir, "arch.krs");
    const initial = "system ECommerce {}\n\nservice PaymentService {}\n\nservice OrderService {}\n";
    writeFileSync(targetPath, initial, "utf-8");

    remove("PaymentService", targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toContain("system ECommerce {}");
    expect(content).toContain("service OrderService {}");
    expect(content).not.toContain("PaymentService");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // Removing nodes one by one until the file is empty.
  it("removes nodes one by one, leaving an empty file when all nodes are removed", () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "system ECommerce {}\n\nservice Payments {}\n", "utf-8");

    remove("ECommerce", targetPath);
    expect(readFileSync(targetPath, "utf-8")).not.toContain("ECommerce");
    expect(readFileSync(targetPath, "utf-8")).toContain("service Payments {}");

    remove("Payments", targetPath);
    expect(readFileSync(targetPath, "utf-8").trim()).toBe("");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // Removing the same node twice should fail the second time.
  it("exits with code 1 when removing an already-removed node", () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "system ECommerce {}\n\nservice Payments {}\n", "utf-8");

    remove("Payments", targetPath);
    expect(exitSpy).not.toHaveBeenCalled();

    remove("Payments", targetPath);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Payments"));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // Removing a nested child node inside a system block.
  it("removes a nested child node from inside a system block", () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(
      targetPath,
      "system ECommerce {\n  service OrderService {}\n  service PaymentService {}\n}\n",
      "utf-8",
    );

    remove("PaymentService", targetPath);

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toContain("service OrderService {}");
    expect(content).not.toContain("PaymentService");
    // Outer system block must still be present and well-formed
    expect(content).toMatch(/system ECommerce \{/);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

// ── translate → apply → remove pipeline ──────────────────────────────────────

describe("translate | apply | remove pipeline — openapi", () => {
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-remove-e2e-openapi-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // Translate → apply → remove: full lifecycle for a service node.
  it("removes a service block that was previously applied from an OpenAPI translation", async () => {
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

    // Step 1: translate → apply
    const capture = captureOutput();
    await translate(inputPath, { from: "openapi", service: "OrderService" });
    capture.restore();

    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, applyIncoming("", capture.stdout()), "utf-8");

    expect(readFileSync(targetPath, "utf-8")).toContain("service OrderService {");

    // Step 2: remove the node
    remove("OrderService", targetPath);

    expect(readFileSync(targetPath, "utf-8")).not.toContain("OrderService");
    expect(readFileSync(targetPath, "utf-8").trim()).toBe("");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // Translate two services → apply both → remove one → other is intact.
  it("removes one service while keeping a second service that was applied separately", async () => {
    const orderApiPath = join(tmpDir, "order-api.yaml");
    writeFileSync(
      orderApiPath,
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

    const targetPath = join(tmpDir, "arch.krs");

    // Apply OrderService
    const cap1 = captureOutput();
    await translate(orderApiPath, { from: "openapi", service: "OrderService" });
    cap1.restore();
    writeFileSync(targetPath, applyIncoming("", cap1.stdout()), "utf-8");

    // Apply PaymentService
    const cap2 = captureOutput();
    await translate(paymentApiPath, { from: "openapi", service: "PaymentService" });
    cap2.restore();
    const combined = applyIncoming(readFileSync(targetPath, "utf-8"), cap2.stdout());
    writeFileSync(targetPath, combined, "utf-8");

    expect(readFileSync(targetPath, "utf-8")).toContain("service OrderService {");
    expect(readFileSync(targetPath, "utf-8")).toContain("service PaymentService {");

    // Remove OrderService only
    remove("OrderService", targetPath);

    const final = readFileSync(targetPath, "utf-8");
    expect(final).not.toContain("OrderService");
    expect(final).toContain("service PaymentService {");
    expect(final).toContain("usecase CreatePayment");
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe("translate | apply | remove pipeline — compose", () => {
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-remove-e2e-compose-"));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // Translate compose → apply → remove the deploy block.
  it("removes a deploy block that was applied from a docker-compose translation", async () => {
    const composePath = join(tmpDir, "docker-compose.yml");
    writeFileSync(
      composePath,
      `
services:
  api:
    image: node:20
  db:
    image: postgres:16
`,
    );

    const cap = captureOutput();
    await translate(composePath, { from: "compose" });
    cap.restore();

    const targetPath = join(tmpDir, "deploy.krs");
    const translated = cap.stdout();
    writeFileSync(targetPath, applyIncoming("", translated), "utf-8");

    // Find the deploy block ID from the translated output
    const deployIdMatch = translated.match(/deploy "([^"]+)"/);
    expect(deployIdMatch).not.toBeNull();
    const deployId = deployIdMatch![1];

    expect(readFileSync(targetPath, "utf-8")).toContain(`deploy "${deployId}"`);

    remove(deployId, targetPath);

    expect(readFileSync(targetPath, "utf-8")).not.toContain(`deploy "${deployId}"`);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
