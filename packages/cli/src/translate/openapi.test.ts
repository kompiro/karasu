import { describe, it, expect } from "vitest";
import { OpenApiTranslator } from "./openapi.js";
import type { TranslatorContext } from "./translator.js";

const ctx: TranslatorContext = {
  inputPath: "/project/api.yaml",
};

describe("OpenApiTranslator", () => {
  const translator = new OpenApiTranslator();

  it("generates a service block with usecases using operationId", async () => {
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
    const result = await translator.translate(input, { ...ctx, service: "ECommerce" });
    expect(result).toContain("service ECommerce {");
    expect(result).toContain('  usecase PlaceOrder { label "POST /orders" }');
    expect(result).toContain('  usecase CancelOrder { label "POST /orders/{id}/cancel" }');
    expect(result).toContain("}");
  });

  it("falls back to method+path when operationId is absent", async () => {
    const input = `
openapi: "3.0.0"
info:
  title: Simple API
paths:
  /items:
    get: {}
    post: {}
`;
    const result = await translator.translate(input, { ...ctx, service: "ItemService" });
    expect(result).toContain("service ItemService {");
    expect(result).toContain('  usecase GetItems { label "GET /items" }');
    expect(result).toContain('  usecase PostItems { label "POST /items" }');
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
    expect(result).toContain('  usecase ListOrders { label "GET /orders" }');
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
