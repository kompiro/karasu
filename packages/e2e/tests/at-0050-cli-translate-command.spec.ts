import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * AT-0050: CLI `translate --from compose|k8s`.
 *
 * Drives the built `karasu` binary to exercise compose/k8s translation,
 * heuristic + karasu/realizes label + karasu.map.yaml resolution chains,
 * unresolved TODO comments, --output file writes, and missing-file errors.
 *
 * Out of scope:
 *  - AT-0050-09 (shell-level concatenation of multiple files): covered by the
 *    file-write assertion and standard shell behavior; not an interesting
 *    CLI contract to re-verify here.
 */

const CLI_ENTRY = resolve(__dirname, "../../cli/dist/index.js");

function runCli(
  args: string[],
  opts: { expectFailure?: boolean } = {},
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, [CLI_ENTRY, ...args], { encoding: "utf-8" });
  if (!opts.expectFailure && result.status !== 0) {
    throw new Error(
      `CLI exited with ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

let tmpDir: string;

test.beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "karasu-at0050-"));
});

test.afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

test.describe("AT-0050 CLI translate — compose / k8s", () => {
  test("compose heuristic realizes from naming convention (AT-0050-01)", () => {
    const input = join(tmpDir, "docker-compose.yml");
    writeFileSync(
      input,
      `name: production
services:
  order-service:
    image: order-service:1.0.0
  payment-svc:
    image: payment-svc:latest
`,
    );

    const { stdout } = runCli(["translate", "--from", "compose", input]);

    expect(stdout).toContain('deploy "production" {');
    expect(stdout).toContain('oci "order-service" {');
    expect(stdout).toContain('image "order-service:1.0.0"');
    expect(stdout).toContain("realizes OrderService");
    expect(stdout).toContain('oci "payment-svc" {');
    expect(stdout).toContain("realizes PaymentSvc");
  });

  test("karasu/realizes label overrides heuristic (AT-0050-02)", () => {
    const input = join(tmpDir, "docker-compose.yml");
    writeFileSync(
      input,
      `name: production
services:
  monolith:
    image: monolith:1.0.0
    labels:
      karasu/realizes: "OrderService,InventoryService"
`,
    );

    const { stdout } = runCli(["translate", "--from", "compose", input]);

    expect(stdout).toContain("realizes OrderService");
    expect(stdout).toContain("realizes InventoryService");
  });

  test("karasu.map.yaml beside input is auto-discovered (AT-0050-03)", () => {
    const input = join(tmpDir, "docker-compose.yml");
    writeFileSync(
      input,
      `name: production
services:
  app:
    image: app:1.0.0
`,
    );
    writeFileSync(join(tmpDir, "karasu.map.yaml"), "app: ECommerce\n");

    const { stdout } = runCli(["translate", "--from", "compose", input]);

    expect(stdout).toContain("realizes ECommerce");
  });

  test("--map flag points at an explicit karasu.map.yaml (AT-0050-04)", () => {
    const input = join(tmpDir, "docker-compose.yml");
    writeFileSync(
      input,
      `name: production
services:
  app:
    image: app:1.0.0
`,
    );

    const mapDir = mkdtempSync(join(tmpdir(), "karasu-at0050-map-"));
    const mapPath = join(mapDir, "karasu.map.yaml");
    writeFileSync(mapPath, "app: ECommerce\n");

    try {
      const { stdout } = runCli(["translate", "--from", "compose", input, "--map", mapPath]);
      expect(stdout).toContain("realizes ECommerce");
    } finally {
      rmSync(mapDir, { recursive: true, force: true });
    }
  });

  test("unresolved unit emits TODO comment and stderr warning (AT-0050-05)", () => {
    const input = join(tmpDir, "docker-compose.yml");
    writeFileSync(
      input,
      `name: production
services:
  app:
    image: app:latest
`,
    );

    const { stdout, stderr } = runCli(["translate", "--from", "compose", input]);

    expect(stdout).toContain("// TODO: realizes ?");
    expect(stderr).toContain('Warning: Could not resolve realizes for "app"');
  });

  test("k8s Deployment manifest translates to oci unit (AT-0050-06)", () => {
    const input = join(tmpDir, "deployment.yaml");
    writeFileSync(
      input,
      `apiVersion: apps/v1
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

    const { stdout } = runCli(["translate", "--from", "k8s", input]);

    expect(stdout).toContain('deploy "production" {');
    expect(stdout).toContain('oci "order-service" {');
    expect(stdout).toContain('image "order-service:1.0.0"');
    expect(stdout).toContain("realizes OrderService");
  });

  test("k8s CronJob becomes a job unit with schedule (AT-0050-07)", () => {
    const input = join(tmpDir, "cronjob.yaml");
    writeFileSync(
      input,
      `apiVersion: batch/v1
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

    const { stdout } = runCli(["translate", "--from", "k8s", input]);

    expect(stdout).toContain('job "billing-job" {');
    expect(stdout).toContain('image "billing-job:latest"');
    expect(stdout).toContain('schedule "0 0 1 * *"');
  });

  test("--output flag writes the file instead of stdout (AT-0050-08)", () => {
    const input = join(tmpDir, "docker-compose.yml");
    const output = join(tmpDir, "deploy.krs");
    writeFileSync(
      input,
      `name: production
services:
  order-service:
    image: order-service:1.0.0
`,
    );

    const { stdout } = runCli(["translate", "--from", "compose", input, "--output", output]);

    expect(stdout).toBe("");
    const written = readFileSync(output, "utf-8");
    expect(written).toContain('deploy "production" {');
    expect(written).toContain('oci "order-service" {');
  });

  test("missing input file exits 1 with File not found on stderr (AT-0050-10)", () => {
    const { stderr, status } = runCli(
      ["translate", "--from", "compose", join(tmpDir, "nonexistent.yml")],
      { expectFailure: true },
    );

    expect(status).toBe(1);
    expect(stderr).toContain("File not found");
  });
});
