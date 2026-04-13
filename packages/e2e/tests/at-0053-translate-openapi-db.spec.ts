import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * AT-0053: CLI `translate --from openapi|db`.
 *
 * Covers spec parsing, ID inference, and output generation by invoking the
 * built CLI binary directly. Runs inside the Playwright suite so #558-style
 * gating (the `e2e` label) applies, but does not use the browser `page`
 * fixture.
 *
 * Cases:
 *  - AT-0053-01: OpenAPI with operationId → PascalCase usecases.
 *  - AT-0053-02: OpenAPI without operationId → method+path fallback IDs.
 *  - AT-0053-03: Service name derived from info.title when --service omitted.
 *  - AT-0053-04: SQL schema → `database` block with `table` entries.
 *  - AT-0053-05: `--database` omitted → derived from file name.
 *  - AT-0053-07: Missing --from → commander error, exit 1.
 *  - AT-0053-08: Missing file → "File not found" stderr, exit 1.
 */

const CLI_ENTRY = resolve(__dirname, "../../cli/dist/index.js");

function runCli(
  args: string[],
  opts: { expectFailure?: boolean } = {},
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, [CLI_ENTRY, ...args], {
    encoding: "utf-8",
  });
  if (!opts.expectFailure && result.status !== 0) {
    throw new Error(
      `CLI exited with ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

let tmpDir: string;

test.beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "karasu-at0053-"));
});

test.afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

test.describe("AT-0053 CLI translate — OpenAPI / DB", () => {
  test("openapi operationId → PascalCase usecases (AT-0053-01)", () => {
    const input = join(tmpDir, "api.yaml");
    writeFileSync(
      input,
      `openapi: "3.0.0"
info:
  title: ECommerce API
paths:
  /orders:
    post:
      operationId: placeOrder
      tags: [Order]
  /orders/{id}/cancel:
    post:
      operationId: cancelOrder
      tags: [Order]
`,
    );

    const { stdout } = runCli(["translate", "--from", "openapi", input, "--service", "ECommerce"]);

    expect(stdout).toContain("service ECommerce {");
    expect(stdout).toContain('usecase PlaceOrder { label "POST /orders" }');
    expect(stdout).toContain('usecase CancelOrder { label "POST /orders/{id}/cancel" }');
  });

  test("openapi missing operationId → method+path fallback (AT-0053-02)", () => {
    const input = join(tmpDir, "api.yaml");
    writeFileSync(
      input,
      `openapi: "3.0.0"
info:
  title: Simple API
paths:
  /items:
    get: {}
    post: {}
`,
    );

    const { stdout } = runCli([
      "translate",
      "--from",
      "openapi",
      input,
      "--service",
      "ItemService",
    ]);

    expect(stdout).toContain("service ItemService {");
    expect(stdout).toContain('usecase GetItems { label "GET /items" }');
    expect(stdout).toContain('usecase PostItems { label "POST /items" }');
  });

  test("openapi without --service → service derived from info.title (AT-0053-03)", () => {
    const input = join(tmpDir, "api.yaml");
    writeFileSync(
      input,
      `openapi: "3.0.0"
info:
  title: Order Service
paths:
  /orders:
    get:
      operationId: listOrders
`,
    );

    const { stdout } = runCli(["translate", "--from", "openapi", input]);

    expect(stdout).toContain("service OrderService {");
    expect(stdout).toContain('usecase ListOrders { label "GET /orders" }');
  });

  test("db schema → database block with tables (AT-0053-04)", () => {
    const input = join(tmpDir, "schema.sql");
    writeFileSync(
      input,
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

    const { stdout } = runCli(["translate", "--from", "db", input, "--database", "OrderDB"]);

    expect(stdout).toContain("database OrderDB {");
    expect(stdout).toContain('table OrdersTable { label "orders" }');
    expect(stdout).toContain('table OrderItemsTable { label "order_items" }');
    expect(stdout).toContain('table PaymentsTable { label "payments" }');
  });

  test("db schema without --database → name derived from file name (AT-0053-05)", () => {
    const input = join(tmpDir, "order_db.sql");
    writeFileSync(input, `CREATE TABLE orders ( id BIGINT PRIMARY KEY );\n`);

    const { stdout } = runCli(["translate", "--from", "db", input]);

    expect(stdout).toContain("database OrderDb {");
    expect(stdout).toContain('table OrdersTable { label "orders" }');
  });

  test("missing --from flag → commander error, exit 1 (AT-0053-07)", () => {
    const input = join(tmpDir, "api.yaml");
    writeFileSync(input, `openapi: "3.0.0"\ninfo:\n  title: X\npaths: {}\n`);

    const { stderr, status } = runCli(["translate", input], { expectFailure: true });

    expect(status).toBe(1);
    expect(stderr).toMatch(/required option.*--from/i);
  });

  test("missing input file → File not found stderr, exit 1 (AT-0053-08)", () => {
    const { stderr, status } = runCli(
      ["translate", "--from", "openapi", join(tmpDir, "nonexistent.yaml"), "--service", "Foo"],
      { expectFailure: true },
    );

    expect(status).toBe(1);
    expect(stderr).toContain("File not found");
  });
});
