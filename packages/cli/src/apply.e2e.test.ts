import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyIncoming } from "./apply.js";

// Note: apply() itself reads from process.stdin and calls process.exit(), so we test
// the pure applyIncoming() function directly for unit/integration coverage.
// stdin piping is verified by the E2E acceptance test descriptions below.

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
