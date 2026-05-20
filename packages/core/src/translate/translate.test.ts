import { describe, it, expect } from "vitest";
import { translateInfraConfig, wrapInSystem, SYSTEM_NAME_PATTERN } from "./translate.js";

// ---------------------------------------------------------------------------
// wrapInSystem
// ---------------------------------------------------------------------------

describe("wrapInSystem", () => {
  it("indents non-empty lines by 2 spaces and adds system wrapper", () => {
    const body = `service Foo {\n  usecase Bar {}\n}\n`;
    expect(wrapInSystem(body, "Orders")).toBe(
      `system Orders {\n  service Foo {\n    usecase Bar {}\n  }\n}\n`,
    );
  });

  it("preserves blank lines inside body as truly blank (no trailing spaces)", () => {
    const body = `service A {}\n\nservice B {}\n`;
    expect(wrapInSystem(body, "Acme")).toBe(`system Acme {\n  service A {}\n\n  service B {}\n}\n`);
  });

  it("handles empty body", () => {
    expect(wrapInSystem("", "Empty")).toBe(`system Empty {\n}\n`);
  });

  it("handles body that is only newlines", () => {
    expect(wrapInSystem("\n\n", "Empty")).toBe(`system Empty {\n}\n`);
  });

  it("throws on invalid identifier — space in name", () => {
    expect(() => wrapInSystem("service Foo {}\n", "bad name")).toThrow(/not a valid identifier/);
  });

  it("throws on invalid identifier — empty string", () => {
    expect(() => wrapInSystem("service Foo {}\n", "")).toThrow(/not a valid identifier/);
  });

  it("throws on invalid identifier — leading digit", () => {
    expect(() => wrapInSystem("service Foo {}\n", "1Leading")).toThrow(/not a valid identifier/);
  });

  it("accepts underscore-leading identifiers", () => {
    const out = wrapInSystem("service Foo {}\n", "_Root");
    expect(out).toContain("system _Root {");
  });

  it("accepts identifiers with digits after the first character", () => {
    const out = wrapInSystem("service Foo {}\n", "System2");
    expect(out).toContain("system System2 {");
  });
});

// ---------------------------------------------------------------------------
// SYSTEM_NAME_PATTERN
// ---------------------------------------------------------------------------

describe("SYSTEM_NAME_PATTERN", () => {
  it("accepts simple alpha identifiers", () => {
    expect(SYSTEM_NAME_PATTERN.test("Orders")).toBe(true);
  });

  it("accepts identifiers with underscores and digits", () => {
    expect(SYSTEM_NAME_PATTERN.test("my_system_2")).toBe(true);
  });

  it("rejects names with spaces", () => {
    expect(SYSTEM_NAME_PATTERN.test("my system")).toBe(false);
  });

  it("rejects names starting with a digit", () => {
    expect(SYSTEM_NAME_PATTERN.test("2system")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(SYSTEM_NAME_PATTERN.test("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// translateInfraConfig — format dispatch
// ---------------------------------------------------------------------------

describe("translateInfraConfig — format dispatch", () => {
  const COMPOSE_INPUT = `
name: production
services:
  order-service:
    image: order-service:1.0.0
`;

  const K8S_INPUT = `
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
`;

  const OPENAPI_INPUT = `
openapi: "3.0.0"
info:
  title: Orders API
paths:
  /orders:
    get:
      operationId: listOrders
`;

  const DB_INPUT = `CREATE TABLE orders (id BIGINT PRIMARY KEY);`;

  it("dispatches compose format to ComposeTranslator", async () => {
    const result = await translateInfraConfig(COMPOSE_INPUT, { from: "compose" });
    expect(result.krs).toContain('deploy "production" {');
    expect(result.krs).toContain('oci "order-service" {');
  });

  it("dispatches k8s format to K8sTranslator", async () => {
    const result = await translateInfraConfig(K8S_INPUT, { from: "k8s" });
    expect(result.krs).toContain('deploy "production" {');
    expect(result.krs).toContain('oci "order-service" {');
  });

  it("dispatches openapi format to OpenApiTranslator", async () => {
    const result = await translateInfraConfig(OPENAPI_INPUT, { from: "openapi" });
    expect(result.krs).toContain("service Orders");
  });

  it("dispatches db format to DbTranslator", async () => {
    const result = await translateInfraConfig(DB_INPUT, { from: "db" });
    expect(result.krs).toContain("database");
    expect(result.krs).toContain("table OrdersTable");
  });
});

// ---------------------------------------------------------------------------
// translateInfraConfig — system wrapping
// ---------------------------------------------------------------------------

describe("translateInfraConfig — system wrapping", () => {
  const OPENAPI_INPUT = `
openapi: "3.0.0"
info:
  title: Orders
paths:
  /orders:
    get: {}
`;

  const DB_INPUT = `CREATE TABLE orders (id BIGINT PRIMARY KEY);`;

  const COMPOSE_INPUT = `
services:
  order-service:
    image: order-service:1.0.0
`;

  const K8S_INPUT = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: prod
spec:
  template:
    spec:
      containers:
        - name: order-service
          image: order-service:1.0.0
`;

  it("wraps openapi output in system block when system is provided", async () => {
    const result = await translateInfraConfig(OPENAPI_INPUT, {
      from: "openapi",
      system: "OrderSystem",
    });
    expect(result.krs.startsWith("system OrderSystem {")).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("wraps db output in system block when system is provided", async () => {
    const result = await translateInfraConfig(DB_INPUT, {
      from: "db",
      database: "OrderDB",
      system: "OrderSystem",
    });
    expect(result.krs.startsWith("system OrderSystem {")).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("ignores system for compose and emits a warning", async () => {
    const result = await translateInfraConfig(COMPOSE_INPUT, {
      from: "compose",
      system: "Orders",
    });
    expect(result.krs).not.toContain("system Orders {");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain(
      "--system is only supported with --from openapi or --from db",
    );
  });

  it("ignores system for k8s and emits a warning", async () => {
    const result = await translateInfraConfig(K8S_INPUT, {
      from: "k8s",
      system: "Orders",
    });
    expect(result.krs).not.toContain("system Orders {");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain(
      "--system is only supported with --from openapi or --from db",
    );
  });

  it("does not wrap when system is undefined", async () => {
    const result = await translateInfraConfig(OPENAPI_INPUT, { from: "openapi" });
    expect(result.krs.startsWith("service")).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// translateInfraConfig — warnings propagated from realizes
// ---------------------------------------------------------------------------

describe("translateInfraConfig — warnings propagated from realizes", () => {
  it("includes warnings from compose translator when realizes is unresolvable", async () => {
    // 'app' has no hyphen and no map entry → realizes is unresolvable → warning
    const input = `
services:
  app:
    image: app:1.0.0
`;
    const result = await translateInfraConfig(input, { from: "compose" });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Could not resolve realizes for "app"');
  });

  it("propagates warning from realizes when mapFile is provided but unit is absent", async () => {
    // Use a non-hyphen service name: 'monolith' won't resolve via heuristic
    // (needs a hyphen) and is not in the map → warning expected.
    const noHyphenInput = `
services:
  monolith:
    image: monolith:1.0.0
`;
    const mapFile = "other-service: OtherService\n";
    const result = await translateInfraConfig(noHyphenInput, { from: "compose", mapFile });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Could not resolve realizes for "monolith"');
  });

  it("returns empty warnings array when all realizes are resolved", async () => {
    const input = `
services:
  order-service:
    image: order-service:1.0.0
`;
    const result = await translateInfraConfig(input, { from: "compose" });
    expect(result.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// translateInfraConfig — options passthrough
// ---------------------------------------------------------------------------

describe("translateInfraConfig — options passthrough", () => {
  it("passes inputName to the translator context (used as deploy name fallback)", async () => {
    // When compose YAML has no `name:` key, inputName is used as the deploy name.
    const input = `
services:
  api:
    image: api:1.0.0
`;
    const result = await translateInfraConfig(input, {
      from: "compose",
      inputName: "my-deployment",
    });
    expect(result.krs).toContain('deploy "my-deployment" {');
  });

  it("passes mapFile content to resolve realizes via map lookup", async () => {
    const input = `
services:
  app:
    image: app:1.0.0
`;
    const result = await translateInfraConfig(input, {
      from: "compose",
      mapFile: "app: ECommerce\n",
    });
    expect(result.krs).toContain("realizes ECommerce");
    expect(result.warnings).toHaveLength(0);
  });

  it("passes service option to openapi translator", async () => {
    const input = `
openapi: "3.0.0"
info:
  title: Generic
paths:
  /items:
    get: {}
`;
    const result = await translateInfraConfig(input, {
      from: "openapi",
      service: "MyService",
    });
    expect(result.krs).toContain("service MyService {");
  });

  it("passes database option to db translator", async () => {
    const input = `CREATE TABLE users (id BIGINT PRIMARY KEY);`;
    const result = await translateInfraConfig(input, {
      from: "db",
      database: "MyDB",
    });
    expect(result.krs).toContain("database MyDB {");
  });
});
