import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { apply, applyIncoming } from "./apply.js";
import { translate } from "./translate/index.js";

// ── Capture helpers (mirrors translate.e2e.test.ts) ───────────────────────────

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

// ── translate | apply pipeline tests ─────────────────────────────────────────

describe("translate | apply pipeline — openapi", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-apply-openapi-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // AT-0060-13
  it("appends a new service block translated from OpenAPI to an empty file", async () => {
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
  /orders/{id}:
    get:
      operationId: getOrder
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "openapi", service: "OrderService" });
    capture.restore();

    const translated = capture.stdout();
    const targetPath = join(tmpDir, "arch.krs");
    const result = applyIncoming("", translated);
    writeFileSync(targetPath, result, "utf-8");

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toContain("service OrderService {");
    expect(content).toContain("usecase PlaceOrder");
    expect(content).toContain("usecase GetOrder");
  });

  // AT-0060-14
  it("replaces an existing service block when the service ID matches", async () => {
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

    // Initial translation → create file
    const capture1 = captureOutput();
    await translate(inputPath, { from: "openapi", service: "OrderService" });
    capture1.restore();
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, applyIncoming("", capture1.stdout()), "utf-8");

    // Update the spec with a new endpoint
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
  /orders/{id}/cancel:
    post:
      operationId: cancelOrder
`,
    );

    // Second translation → apply (should replace, not duplicate)
    const capture2 = captureOutput();
    await translate(inputPath, { from: "openapi", service: "OrderService" });
    capture2.restore();
    const result = applyIncoming(readFileSync(targetPath, "utf-8"), capture2.stdout());
    writeFileSync(targetPath, result, "utf-8");

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toContain("usecase CancelOrder");
    // Service block should appear exactly once
    expect(content.match(/service OrderService \{/g)?.length).toBe(1);
  });

  // AT-0060-15
  it("appends a second service block when a different service ID is translated", async () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, "service OrderService {\n  usecase PlaceOrder {}\n}", "utf-8");

    const inputPath = join(tmpDir, "payment-api.yaml");
    writeFileSync(
      inputPath,
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

    const capture = captureOutput();
    await translate(inputPath, { from: "openapi", service: "PaymentService" });
    capture.restore();

    const result = applyIncoming(readFileSync(targetPath, "utf-8"), capture.stdout());
    writeFileSync(targetPath, result, "utf-8");

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toContain("service OrderService {");
    expect(content).toContain("service PaymentService {");
    expect(content).toContain("usecase CreatePayment");
  });
});

describe("translate | apply pipeline — db", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-apply-db-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // AT-0060-16
  it("appends a new database block translated from SQL to an empty file", async () => {
    const inputPath = join(tmpDir, "schema.sql");
    writeFileSync(
      inputPath,
      `
CREATE TABLE orders (id BIGINT PRIMARY KEY, user_id BIGINT NOT NULL);
CREATE TABLE order_items (id BIGINT PRIMARY KEY, order_id BIGINT NOT NULL);
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "db", database: "OrderDB" });
    capture.restore();

    const targetPath = join(tmpDir, "arch.krs");
    const result = applyIncoming("", capture.stdout());
    writeFileSync(targetPath, result, "utf-8");

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toContain("database OrderDB {");
    expect(content).toContain('table OrdersTable { label "orders" }');
    expect(content).toContain('table OrderItemsTable { label "order_items" }');
  });

  // AT-0060-17
  // NOTE: `database` blocks are not valid top-level KRS nodes (only system/service/domain/deploy
  // are). The parser does not recognise them, so applyIncoming cannot auto-detect the ID and
  // always falls back to append. Applying the same translation twice results in two blocks.
  // This is expected behaviour for the current implementation.
  it("appends a second database block when the same translate output is applied again", async () => {
    const inputPath = join(tmpDir, "schema.sql");
    writeFileSync(inputPath, `CREATE TABLE orders (id BIGINT PRIMARY KEY);`);

    const capture1 = captureOutput();
    await translate(inputPath, { from: "db", database: "OrderDB" });
    capture1.restore();
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(targetPath, applyIncoming("", capture1.stdout()), "utf-8");

    // Apply the same output again — expected to append, not replace
    const capture2 = captureOutput();
    await translate(inputPath, { from: "db", database: "OrderDB" });
    capture2.restore();
    const result = applyIncoming(readFileSync(targetPath, "utf-8"), capture2.stdout());
    writeFileSync(targetPath, result, "utf-8");

    const content = readFileSync(targetPath, "utf-8");
    // Two database blocks present (append, not replace)
    expect(content.match(/database OrderDB \{/g)?.length).toBe(2);
  });

  // AT-0060-18
  it("appends a second database block when a different database ID is translated", async () => {
    const targetPath = join(tmpDir, "arch.krs");
    writeFileSync(
      targetPath,
      'database OrderDB {\n  table OrdersTable { label "orders" }\n}',
      "utf-8",
    );

    const inputPath = join(tmpDir, "user_schema.sql");
    writeFileSync(inputPath, `CREATE TABLE users (id BIGINT PRIMARY KEY);`);

    const capture = captureOutput();
    await translate(inputPath, { from: "db", database: "UserDB" });
    capture.restore();

    const result = applyIncoming(readFileSync(targetPath, "utf-8"), capture.stdout());
    writeFileSync(targetPath, result, "utf-8");

    const content = readFileSync(targetPath, "utf-8");
    expect(content).toContain("database OrderDB {");
    expect(content).toContain("database UserDB {");
    expect(content).toContain('table UsersTable { label "users" }');
  });
});
