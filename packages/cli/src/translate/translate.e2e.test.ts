import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { translate } from "./index.js";

// Capture stdout and stderr instead of writing to the real process
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

describe("translate E2E — docker-compose", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-e2e-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("AT-0050-01: translates compose file to stdout using naming heuristic", async () => {
    const inputPath = join(tmpDir, "docker-compose.yml");
    writeFileSync(
      inputPath,
      `
name: production
services:
  order-service:
    image: order-service:1.0.0
  payment-svc:
    image: payment-svc:latest
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "compose" });
    capture.restore();

    const out = capture.stdout();
    expect(out).toContain('deploy "production" {');
    expect(out).toContain('  oci "order-service" {');
    expect(out).toContain('    image "order-service:1.0.0"');
    expect(out).toContain("    realizes OrderService");
    expect(out).toContain('  oci "payment-svc" {');
    expect(out).toContain("    realizes PaymentSvc");
  });

  it("AT-0050-02: karasu/realizes label takes priority over heuristic", async () => {
    const inputPath = join(tmpDir, "docker-compose.yml");
    writeFileSync(
      inputPath,
      `
name: prod
services:
  monolith:
    image: monolith:1.0.0
    labels:
      karasu/realizes: "OrderService,InventoryService"
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "compose" });
    capture.restore();

    const out = capture.stdout();
    expect(out).toContain("    realizes OrderService");
    expect(out).toContain("    realizes InventoryService");
  });

  it("AT-0050-03: karasu.map.yaml beside input file is auto-discovered", async () => {
    const inputPath = join(tmpDir, "docker-compose.yml");
    const mapPath = join(tmpDir, "karasu.map.yaml");

    writeFileSync(
      inputPath,
      `
name: production
services:
  app:
    image: app:1.0.0
`,
    );
    writeFileSync(mapPath, "app: ECommerce\n");

    const capture = captureOutput();
    await translate(inputPath, { from: "compose" });
    capture.restore();

    expect(capture.stdout()).toContain("    realizes ECommerce");
  });

  it("AT-0050-04: --map flag overrides default karasu.map.yaml location", async () => {
    const inputPath = join(tmpDir, "docker-compose.yml");
    const mapDir = mkdtempSync(join(tmpdir(), "karasu-map-"));
    const mapPath = join(mapDir, "karasu.map.yaml");

    writeFileSync(
      inputPath,
      `
name: production
services:
  app:
    image: app:1.0.0
`,
    );
    writeFileSync(mapPath, "app: ECommerce\n");

    const capture = captureOutput();
    await translate(inputPath, { from: "compose", map: mapPath });
    capture.restore();

    rmSync(mapDir, { recursive: true, force: true });
    expect(capture.stdout()).toContain("    realizes ECommerce");
  });

  it("AT-0050-05: unresolvable unit emits TODO comment and stderr warning", async () => {
    const inputPath = join(tmpDir, "docker-compose.yml");
    writeFileSync(
      inputPath,
      `
name: prod
services:
  app:
    image: app:latest
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "compose" });
    capture.restore();

    expect(capture.stdout()).toContain("// TODO: realizes ?");
    expect(capture.stderr()).toContain('Warning: Could not resolve realizes for "app"');
  });

  it("AT-0050-08: --output flag writes result to file instead of stdout", async () => {
    const inputPath = join(tmpDir, "docker-compose.yml");
    const outputPath = join(tmpDir, "deploy.krs");

    writeFileSync(
      inputPath,
      `
name: prod
services:
  order-service:
    image: order-service:1.0.0
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "compose", output: outputPath });
    capture.restore();

    // Nothing written to stdout
    expect(capture.stdout()).toBe("");
    // File contains the output
    const fileContent = readFileSync(outputPath, "utf-8");
    expect(fileContent).toContain('deploy "prod" {');
    expect(fileContent).toContain('  oci "order-service" {');
  });
});

describe("translate E2E — k8s", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-e2e-k8s-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("AT-0050-06: translates k8s Deployment to oci unit", async () => {
    const inputPath = join(tmpDir, "deployment.yaml");
    writeFileSync(
      inputPath,
      `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
spec:
  template:
    spec:
      containers:
        - name: app
          image: order-service:1.0.0
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "k8s" });
    capture.restore();

    const out = capture.stdout();
    expect(out).toContain('deploy "production" {');
    expect(out).toContain('  oci "order-service" {');
    expect(out).toContain('    image "order-service:1.0.0"');
    expect(out).toContain("    realizes OrderService");
  });

  it("AT-0050-07: translates CronJob to job unit with schedule", async () => {
    const inputPath = join(tmpDir, "cronjob.yaml");
    writeFileSync(
      inputPath,
      `
apiVersion: batch/v1
kind: CronJob
metadata:
  name: billing-job
  namespace: default
spec:
  schedule: "0 0 1 * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: job
              image: billing-job:latest
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "k8s" });
    capture.restore();

    const out = capture.stdout();
    expect(out).toContain('  job "billing-job" {');
    expect(out).toContain('    image "billing-job:latest"');
    expect(out).toContain('    schedule "0 0 1 * *"');
  });
});

describe("translate E2E — error handling", () => {
  it("AT-0050-10: exits with code 1 and error message for missing file", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const capture = captureOutput();

    await expect(
      translate("/nonexistent/path/docker-compose.yml", { from: "compose" }),
    ).rejects.toThrow("process.exit called");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(capture.stderr()).toContain("Error: File not found");

    capture.restore();
    exitSpy.mockRestore();
  });
});
