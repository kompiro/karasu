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
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-e2e-err-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

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

  it("AT-0053-08: exits with code 1 and error message for missing openapi file", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const capture = captureOutput();

    await expect(
      translate("/nonexistent/path/api.yaml", { from: "openapi", service: "Foo" }),
    ).rejects.toThrow("process.exit called");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(capture.stderr()).toContain("Error: File not found");

    capture.restore();
    exitSpy.mockRestore();
  });

  it("exits with code 1 and error message for invalid compose YAML (parse error path)", async () => {
    const inputPath = join(tmpDir, "docker-compose.yml");
    writeFileSync(inputPath, "{ invalid yaml: [unclosed\n");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const capture = captureOutput();

    await expect(translate(inputPath, { from: "compose" })).rejects.toThrow("process.exit called");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(capture.stderr()).toContain("Error: Failed to parse");

    capture.restore();
    exitSpy.mockRestore();
  });

  it("exits with code 1 for invalid OpenAPI YAML (parse error path)", async () => {
    const inputPath = join(tmpDir, "api.yaml");
    writeFileSync(inputPath, "{ not: [valid yaml\n");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const capture = captureOutput();

    await expect(translate(inputPath, { from: "openapi", service: "Foo" })).rejects.toThrow(
      "process.exit called",
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(capture.stderr()).toContain("Error: Failed to parse");

    capture.restore();
    exitSpy.mockRestore();
  });

  it("writes warnings to stderr for each unresolvable realizes", async () => {
    const inputPath = join(tmpDir, "docker-compose.yml");
    writeFileSync(
      inputPath,
      `
name: prod
services:
  app:
    image: app:1.0.0
  monolith:
    image: monolith:2.0.0
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "compose" });
    capture.restore();

    const stderr = capture.stderr();
    expect(stderr).toContain('Warning: Could not resolve realizes for "app"');
    expect(stderr).toContain('Warning: Could not resolve realizes for "monolith"');
  });

  it("does not write to stderr when all realizes are resolved via naming heuristic", async () => {
    const inputPath = join(tmpDir, "docker-compose.yml");
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
    await translate(inputPath, { from: "compose" });
    capture.restore();

    expect(capture.stderr()).toBe("");
  });

  it("auto-discovers karasu.map.yaml beside the input when --map is not given", async () => {
    const inputPath = join(tmpDir, "docker-compose.yml");
    writeFileSync(inputPath, "services:\n  app:\n    image: app:1.0.0\n");
    writeFileSync(join(tmpDir, "karasu.map.yaml"), "app: ECommerce\n");

    const capture = captureOutput();
    await translate(inputPath, { from: "compose" });
    capture.restore();

    // Warning should be gone because mapFile resolved "app"
    expect(capture.stderr()).toBe("");
    expect(capture.stdout()).toContain("realizes ECommerce");
  });
});

describe("translate E2E — openapi", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-e2e-openapi-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("AT-0053-01: groups RESTful operations on the same resource into one usecase by default", async () => {
    const inputPath = join(tmpDir, "api.yaml");
    writeFileSync(
      inputPath,
      `openapi: "3.0.0"
info:
  title: ECommerce API
paths:
  /orders:
    get:
      operationId: listOrders
    post:
      operationId: placeOrder
  /orders/{id}:
    get:
      operationId: getOrder
    delete:
      operationId: deleteOrder
  /orders/{id}/cancel:
    post:
      operationId: cancelOrder
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "openapi", service: "ECommerce" });
    capture.restore();

    const out = capture.stdout();
    expect(out).toContain("service ECommerce {");
    expect(out).toContain("usecase ManageOrders {");
    expect(out).toContain('    label "manage orders"');
    expect(out).toContain('    description """');
    expect(out).toContain("      - POST /orders/{id}/cancel");
    expect(out).not.toContain("usecase PlaceOrder");
  });

  it("AT-0053-02: groups operations even when operationId is absent", async () => {
    const inputPath = join(tmpDir, "api.yaml");
    writeFileSync(
      inputPath,
      `openapi: "3.0.0"
info:
  title: Simple API
paths:
  /items:
    get: {}
    post: {}
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "openapi", service: "ItemService" });
    capture.restore();

    const out = capture.stdout();
    expect(out).toContain("service ItemService {");
    expect(out).toContain("usecase ManageItems {");
    expect(out).toContain('    label "manage items"');
  });

  it("AT-0053-03: derives service name from info.title when --service is omitted", async () => {
    const inputPath = join(tmpDir, "api.yaml");
    writeFileSync(
      inputPath,
      `openapi: "3.0.0"
info:
  title: Order Service
paths:
  /orders:
    get:
      operationId: listOrders
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "openapi" });
    capture.restore();

    const out = capture.stdout();
    expect(out).toContain("service OrderService {");
    expect(out).toContain("usecase ManageOrders {");
    expect(out).toContain('    label "manage orders"');
  });

  it("AT-0053-09: --granularity operation emits one usecase per HTTP operation", async () => {
    const inputPath = join(tmpDir, "api.yaml");
    writeFileSync(
      inputPath,
      `openapi: "3.0.0"
info:
  title: ECommerce API
paths:
  /orders:
    post:
      operationId: placeOrder
  /orders/{id}/cancel:
    post:
      operationId: cancelOrder
`,
    );

    const capture = captureOutput();
    await translate(inputPath, {
      from: "openapi",
      service: "ECommerce",
      granularity: "operation",
    });
    capture.restore();

    const out = capture.stdout();
    expect(out).toContain('usecase PlaceOrder { label "POST /orders" }');
    expect(out).toContain('usecase CancelOrder { label "POST /orders/{id}/cancel" }');
    expect(out).not.toContain("ManageOrders");
    expect(out).not.toContain("description");
  });
});

describe("translate E2E — db", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-e2e-db-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("AT-0053-04: translates SQL schema to database block with aggregate grouping", async () => {
    const inputPath = join(tmpDir, "schema.sql");
    writeFileSync(
      inputPath,
      `CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  user_id BIGINT NOT NULL
);
CREATE TABLE order_items (
  id BIGINT PRIMARY KEY,
  order_id BIGINT NOT NULL
);
CREATE TABLE payments (
  id BIGINT PRIMARY KEY
);
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "db", database: "OrderDB" });
    capture.restore();

    const out = capture.stdout();
    expect(out).toContain("database OrderDB {");
    expect(out).toContain("  table OrdersTable {");
    expect(out).toContain("      - order_items — name suffix + inferred FK column to orders");
    expect(out).toContain('  table PaymentsTable { label "payments" }');
    expect(out).not.toContain("table OrderItemsTable");
  });

  it("AT-0053-05: derives database name from file name when --database is omitted", async () => {
    const inputPath = join(tmpDir, "order_db.sql");
    writeFileSync(inputPath, "CREATE TABLE orders ( id BIGINT PRIMARY KEY );\n");

    const capture = captureOutput();
    await translate(inputPath, { from: "db" });
    capture.restore();

    const out = capture.stdout();
    expect(out).toContain("database OrderDb {");
    expect(out).toContain('table OrdersTable { label "orders" }');
  });

  it("AT-0053-11: folds child tables into the aggregate root by default", async () => {
    const inputPath = join(tmpDir, "schema.sql");
    writeFileSync(
      inputPath,
      `CREATE TABLE contracts (
  id BIGINT PRIMARY KEY
);
CREATE TABLE contract_line_items (
  contract_id BIGINT NOT NULL REFERENCES contracts(id),
  line_no INT NOT NULL,
  amount DECIMAL,
  PRIMARY KEY (contract_id, line_no)
);
CREATE TABLE payments (
  id BIGINT PRIMARY KEY
);
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "db", database: "BizDB" });
    capture.restore();

    const out = capture.stdout();
    expect(out).toContain("database BizDB {");
    expect(out).toContain("  table ContractsTable {");
    expect(out).toContain('    label "contracts"');
    expect(out).toContain("      - contracts (root)");
    expect(out).toContain("      - contract_line_items — composite PK with FK to contracts");
    expect(out).toContain('  table PaymentsTable { label "payments" }');
    expect(out).not.toContain("table ContractLineItemsTable");
  });

  it("AT-0053-12: --granularity table emits one unit per SQL table", async () => {
    const inputPath = join(tmpDir, "schema.sql");
    writeFileSync(
      inputPath,
      `CREATE TABLE contracts (
  id BIGINT PRIMARY KEY
);
CREATE TABLE contract_line_items (
  contract_id BIGINT NOT NULL REFERENCES contracts(id),
  line_no INT NOT NULL,
  PRIMARY KEY (contract_id, line_no)
);
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "db", database: "BizDB", granularity: "table" });
    capture.restore();

    const out = capture.stdout();
    expect(out).toContain('  table ContractsTable { label "contracts" }');
    expect(out).toContain('  table ContractLineItemsTable { label "contract_line_items" }');
    expect(out).not.toContain("description");
  });

  it("AT-0053-13: junction tables are not folded into either parent", async () => {
    const inputPath = join(tmpDir, "schema.sql");
    writeFileSync(
      inputPath,
      `CREATE TABLE users (id BIGINT PRIMARY KEY);
CREATE TABLE roles (id BIGINT PRIMARY KEY);
CREATE TABLE user_roles (
  user_id BIGINT NOT NULL REFERENCES users(id),
  role_id BIGINT NOT NULL REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);
`,
    );

    const capture = captureOutput();
    await translate(inputPath, { from: "db", database: "AuthDB" });
    capture.restore();

    const out = capture.stdout();
    expect(out).toContain('table UsersTable { label "users" }');
    expect(out).toContain('table RolesTable { label "roles" }');
    expect(out).toContain('table UserRolesTable { label "user_roles" }');
    expect(out).not.toContain("description");
  });
});
