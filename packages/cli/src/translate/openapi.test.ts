import { describe, it, expect } from "vitest";
import { OpenApiTranslator } from "./openapi.js";
import type { TranslatorContext } from "./translator.js";

const ctx: TranslatorContext = {
  inputPath: "/project/api.yaml",
};

describe("OpenApiTranslator — resource granularity (default)", () => {
  const translator = new OpenApiTranslator();

  it("groups CRUD operations on the same resource into one usecase", async () => {
    const input = `
openapi: "3.0.0"
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
    put:
      operationId: updateOrder
    delete:
      operationId: deleteOrder
  /orders/{id}/cancel:
    post:
      operationId: cancelOrder
`;
    const result = await translator.translate(input, { ...ctx, service: "ECommerce" });
    expect(result).toContain("service ECommerce {");
    expect(result).toContain('  usecase ManageOrders { label "manage orders" }');
    expect(result).not.toContain("ManageCancel");
    expect(result).toContain("  // Operations: ");
    expect(result).toContain("GET /orders");
    expect(result).toContain("POST /orders/{id}/cancel");
  });

  it("emits one usecase per resource when multiple resources are present", async () => {
    const input = `
openapi: "3.0.0"
info:
  title: Shop API
paths:
  /orders:
    get: {}
  /orders/{id}:
    get: {}
  /products:
    get: {}
  /products/{id}:
    delete: {}
`;
    const result = await translator.translate(input, { ...ctx, service: "Shop" });
    expect(result).toContain('  usecase ManageOrders { label "manage orders" }');
    expect(result).toContain('  usecase ManageProducts { label "manage products" }');
  });

  it("skips api/version prefixes when inferring the resource", async () => {
    const input = `
openapi: "3.0.0"
info:
  title: Versioned API
paths:
  /api/v1/orders:
    get: {}
  /v2/orders/{id}:
    get: {}
`;
    const result = await translator.translate(input, { ...ctx, service: "Versioned" });
    expect(result).toContain('  usecase ManageOrders { label "manage orders" }');
    expect(result).not.toContain("ManageApi");
    expect(result).not.toContain("ManageV1");
    expect(result).not.toContain("ManageV2");
  });

  it("falls back to operation-level emission when path has no inferable resource", async () => {
    const input = `
openapi: "3.0.0"
info:
  title: Edge API
paths:
  /{id}:
    get:
      operationId: getRoot
`;
    const result = await translator.translate(input, { ...ctx, service: "Edge" });
    expect(result).toContain('  usecase GetRoot { label "GET /{id}" }');
    expect(result).not.toContain("Manage");
  });

  it("derives service name from info.title when --service is not provided", async () => {
    const input = `
openapi: "3.0.0"
info:
  title: Order Service
paths:
  /orders:
    get:
      operationId: listOrders
`;
    const result = await translator.translate(input, ctx);
    expect(result).toContain("service OrderService {");
    expect(result).toContain('  usecase ManageOrders { label "manage orders" }');
  });

  it("derives service name from file path when info.title is also absent", async () => {
    const input = `
openapi: "3.0.0"
paths:
  /ping:
    get:
      operationId: ping
`;
    const result = await translator.translate(input, { inputPath: "/project/my_api.yaml" });
    expect(result).toContain("service MyApi {");
  });

  it("--service flag overrides info.title", async () => {
    const input = `
openapi: "3.0.0"
info:
  title: Generic API
paths:
  /orders:
    post:
      operationId: createOrder
`;
    const result = await translator.translate(input, { ...ctx, service: "OrderSystem" });
    expect(result).toContain("service OrderSystem {");
    expect(result).not.toContain("service GenericApi");
  });

  it("handles paths with no operations gracefully", async () => {
    const input = `
openapi: "3.0.0"
info:
  title: Empty API
paths: {}
`;
    const result = await translator.translate(input, { ...ctx, service: "EmptyService" });
    expect(result).toBe("service EmptyService {\n}\n");
  });

  it("throws on invalid YAML", async () => {
    const input = "not: valid: yaml: [";
    await expect(translator.translate(input, ctx)).rejects.toThrow("Failed to parse OpenAPI file");
  });
});

describe("OpenApiTranslator — operation granularity (opt-in)", () => {
  const translator = new OpenApiTranslator();

  it("emits one usecase per HTTP operation when granularity is operation", async () => {
    const input = `
openapi: "3.0.0"
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
`;
    const result = await translator.translate(input, {
      ...ctx,
      service: "ECommerce",
      granularity: "operation",
    });
    expect(result).toContain("service ECommerce {");
    expect(result).toContain('  usecase PlaceOrder { label "POST /orders" }');
    expect(result).toContain('  usecase CancelOrder { label "POST /orders/{id}/cancel" }');
    expect(result).not.toContain("ManageOrders");
    expect(result).not.toContain("// Operations:");
  });

  it("falls back to method+path when operationId is absent (operation mode)", async () => {
    const input = `
openapi: "3.0.0"
info:
  title: Simple API
paths:
  /items:
    get: {}
    post: {}
`;
    const result = await translator.translate(input, {
      ...ctx,
      service: "ItemService",
      granularity: "operation",
    });
    expect(result).toContain('  usecase GetItems { label "GET /items" }');
    expect(result).toContain('  usecase PostItems { label "POST /items" }');
  });
});
