import { describe, it, expect } from "vitest";
import { DbTranslator } from "./db.js";
import { OpenApiTranslator } from "./openapi.js";
import type { TranslatorContext } from "./translator.js";

const openapiCtx: TranslatorContext = { inputPath: "/project/api.yaml" };
const dbCtx: TranslatorContext = { inputPath: "/project/schema.sql" };

describe("OpenApiTranslator — usecase → resource bindings", () => {
  const translator = new OpenApiTranslator();

  const ecommerceSpec = `
openapi: "3.0.0"
info:
  title: ECommerce API
paths:
  /orders:
    get: {}
    post: {}
  /orders/{id}:
    get: {}
    put: {}
    delete: {}
`;

  it("AT-1: emits a resource block per group with bare verbs when --emit-bindings is set", async () => {
    const result = await translator.translate(ecommerceSpec, {
      ...openapiCtx,
      service: "ECommerce",
      emitBindings: true,
    });
    expect(result).toContain("  usecase ManageOrders {");
    expect(result).toContain("    resource OrdersResource {");
    // GET /orders → list (no path param), GET /orders/{id} → get.
    // Order follows path-iteration order: /orders {get,post}, /orders/{id} {get,put,delete}.
    expect(result).toContain("      operations list, post, get, put, delete");
  });

  it("AT-2: decorates verbs with CRUD when --emit-crud-decoration is set", async () => {
    const result = await translator.translate(ecommerceSpec, {
      ...openapiCtx,
      service: "ECommerce",
      emitCrudDecoration: true,
    });
    expect(result).toContain("    resource OrdersResource {");
    expect(result).toContain(
      "      operations list:read, post:create, get:read, put:update, delete",
    );
  });

  it("AT-3: GET on parameter-less path becomes list, GET on /{id} stays get", async () => {
    const collectionOnly = `
openapi: "3.0.0"
info:
  title: ECommerce API
paths:
  /orders:
    get: {}
`;
    const itemOnly = `
openapi: "3.0.0"
info:
  title: ECommerce API
paths:
  /orders/{id}:
    get: {}
`;
    const collectionResult = await translator.translate(collectionOnly, {
      ...openapiCtx,
      service: "ECommerce",
      emitCrudDecoration: true,
    });
    expect(collectionResult).toContain("      operations list:read");
    expect(collectionResult).not.toContain("get:read");

    const itemResult = await translator.translate(itemOnly, {
      ...openapiCtx,
      service: "ECommerce",
      emitCrudDecoration: true,
    });
    expect(itemResult).toContain("      operations get:read");
    expect(itemResult).not.toContain("list:read");
  });

  it("AT-4: --emit-bindings is ignored when granularity=operation (translator-level)", async () => {
    const result = await translator.translate(ecommerceSpec, {
      ...openapiCtx,
      service: "ECommerce",
      granularity: "operation",
      emitBindings: true,
    });
    expect(result).not.toContain("resource OrdersResource");
    expect(result).toContain('  usecase GetOrders { label "GET /orders" }');
  });

  it("does not emit bindings when neither flag is set (existing output unchanged)", async () => {
    const result = await translator.translate(ecommerceSpec, {
      ...openapiCtx,
      service: "ECommerce",
    });
    expect(result).not.toContain("resource OrdersResource");
    expect(result).not.toContain("operations ");
  });

  it("emitCrudDecoration implies emitBindings even if not explicitly set", async () => {
    // Only emitCrudDecoration is passed; resource block should still appear.
    const result = await translator.translate(ecommerceSpec, {
      ...openapiCtx,
      service: "ECommerce",
      emitCrudDecoration: true,
    });
    expect(result).toContain("    resource OrdersResource {");
  });
});

describe("DbTranslator — service bindings", () => {
  const translator = new DbTranslator();

  const ordersSchema = `
CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  user_id BIGINT NOT NULL
);
CREATE TABLE order_items (
  order_id BIGINT NOT NULL,
  line_no INT NOT NULL,
  PRIMARY KEY (order_id, line_no),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
CREATE TABLE payments (
  id BIGINT PRIMARY KEY
);
`;

  it("AT-5: emits service bindings alongside the database block in aggregate mode", async () => {
    const result = await translator.translate(ordersSchema, {
      ...dbCtx,
      database: "OrderDB",
      emitBindings: true,
    });
    expect(result).toContain("database OrderDB {");
    // service block follows the database block
    expect(result).toContain("service OrderDBService {");
    expect(result).toContain("  usecase ManageOrders {");
    expect(result).toContain("    resource OrderDB.OrdersTable {");
    expect(result).toContain("      operations select, insert, update, delete");
  });

  it("AT-6: decorates SQL verbs when --emit-crud-decoration is set", async () => {
    const result = await translator.translate(ordersSchema, {
      ...dbCtx,
      database: "OrderDB",
      emitCrudDecoration: true,
    });
    expect(result).toContain("      operations select:read, insert:create, update, delete");
  });

  it("AT-7: aggregate children do not get their own usecase", async () => {
    const result = await translator.translate(ordersSchema, {
      ...dbCtx,
      database: "OrderDB",
      emitBindings: true,
    });
    // order_items is folded into orders → no ManageOrderItems
    expect(result).not.toContain("ManageOrderItems");
    expect(result).not.toContain("OrderItemsTable {");
    // payments is a stand-alone root → its own usecase
    expect(result).toContain("  usecase ManagePayments {");
    expect(result).toContain("    resource OrderDB.PaymentsTable {");
  });

  it("does not emit service block when neither flag is set (existing output unchanged)", async () => {
    const result = await translator.translate(ordersSchema, {
      ...dbCtx,
      database: "OrderDB",
    });
    expect(result).not.toContain("service OrderDBService");
    expect(result).not.toContain("usecase Manage");
  });

  it("does not emit bindings when granularity=table (translator-level)", async () => {
    const result = await translator.translate(ordersSchema, {
      ...dbCtx,
      database: "OrderDB",
      granularity: "table",
      emitBindings: true,
    });
    expect(result).not.toContain("service OrderDBService");
  });

  it("emits service block even when no aggregates are inferred", async () => {
    const flatSchema = `
CREATE TABLE users (id BIGINT PRIMARY KEY);
CREATE TABLE products (id BIGINT PRIMARY KEY);
`;
    const result = await translator.translate(flatSchema, {
      ...dbCtx,
      database: "AppDB",
      emitBindings: true,
    });
    expect(result).toContain("service AppDBService {");
    expect(result).toContain("  usecase ManageUsers {");
    expect(result).toContain("  usecase ManageProducts {");
  });
});

describe("Bindings output is parser-clean", () => {
  it("AT-8: emitted output parses without errors", async () => {
    const { Parser } = await import("@karasu-tools/core");

    const openapi = await new OpenApiTranslator().translate(
      `
openapi: "3.0.0"
info:
  title: ECommerce API
paths:
  /orders:
    get: {}
    post: {}
  /orders/{id}:
    delete: {}
`,
      { inputPath: "/project/api.yaml", service: "ECommerce", emitCrudDecoration: true },
    );
    const openapiParsed = Parser.parse(openapi);
    const openapiErrors = openapiParsed.diagnostics.filter((d) => d.severity === "error");
    expect(openapiErrors).toEqual([]);

    const db = await new DbTranslator().translate(`CREATE TABLE orders (id BIGINT PRIMARY KEY);`, {
      inputPath: "/project/schema.sql",
      database: "OrderDB",
      emitCrudDecoration: true,
    });
    const dbParsed = Parser.parse(db);
    const dbErrors = dbParsed.diagnostics.filter((d) => d.severity === "error");
    expect(dbErrors).toEqual([]);
  });
});
