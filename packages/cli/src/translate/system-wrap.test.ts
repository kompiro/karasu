import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { translate, wrapInSystem } from "./index.js";

function captureOutput(): { stdout: () => string; stderr: () => string; restore: () => void } {
  let out = "";
  let err = "";
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    err += String(chunk);
    return true;
  });
  return {
    stdout: () => out,
    stderr: () => err,
    restore: () => {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    },
  };
}

describe("wrapInSystem", () => {
  it("indents each non-empty line by 2 spaces and wraps", () => {
    const body = `service Foo {\n  usecase Bar {}\n}\n`;
    expect(wrapInSystem(body, "Orders")).toBe(
      `system Orders {\n  service Foo {\n    usecase Bar {}\n  }\n}\n`,
    );
  });

  it("preserves blank lines as blank (no trailing whitespace)", () => {
    const body = `service A {}\n\nservice B {}\n`;
    expect(wrapInSystem(body, "Acme")).toBe(`system Acme {\n  service A {}\n\n  service B {}\n}\n`);
  });

  it("handles empty body", () => {
    expect(wrapInSystem("", "Empty")).toBe(`system Empty {\n}\n`);
    expect(wrapInSystem("\n\n", "Empty")).toBe(`system Empty {\n}\n`);
  });

  it("throws on invalid identifier", () => {
    expect(() => wrapInSystem("service Foo {}\n", "bad name")).toThrow(/not a valid identifier/);
    expect(() => wrapInSystem("service Foo {}\n", "")).toThrow(/not a valid identifier/);
    expect(() => wrapInSystem("service Foo {}\n", "1Leading")).toThrow(/not a valid identifier/);
  });
});

describe("translate --system", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-system-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("wraps openapi output in `system <Name> { ... }`", async () => {
    const inputPath = join(tmpDir, "api.yaml");
    writeFileSync(
      inputPath,
      `openapi: 3.0.0
info: { title: Orders }
paths:
  /orders:
    get: { operationId: listOrders }
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "openapi", system: "Orders" });
    capture.restore();

    const out = capture.stdout();
    expect(out.startsWith("system Orders {\n")).toBe(true);
    expect(out.trimEnd().endsWith("}")).toBe(true);
    expect(out).toContain("  service Orders {");
  });

  it("wraps db output in `system <Name> { ... }`", async () => {
    const inputPath = join(tmpDir, "schema.sql");
    writeFileSync(
      inputPath,
      `CREATE TABLE orders (id INT PRIMARY KEY);
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "db", database: "OrderDB", system: "Orders" });
    capture.restore();

    const out = capture.stdout();
    expect(out.startsWith("system Orders {\n")).toBe(true);
    expect(out).toContain("  database OrderDB {");
  });

  it("warns and ignores --system for compose", async () => {
    const inputPath = join(tmpDir, "docker-compose.yml");
    writeFileSync(
      inputPath,
      `services:
  api:
    image: api:1.0.0
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "compose", system: "Orders" });
    capture.restore();

    expect(capture.stderr()).toContain(
      "--system is only supported with --from openapi or --from db",
    );
    expect(capture.stdout()).not.toContain("system Orders {");
    expect(capture.stdout()).toContain('deploy "');
  });

  it("warns and ignores --system for k8s", async () => {
    const inputPath = join(tmpDir, "deploy.yaml");
    writeFileSync(
      inputPath,
      `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: prod
spec:
  template:
    spec:
      containers:
        - name: api
          image: api:1.0.0
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "k8s", system: "Orders" });
    capture.restore();

    expect(capture.stderr()).toContain("--system is only supported");
    expect(capture.stdout()).not.toContain("system Orders {");
  });
});
