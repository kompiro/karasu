import { describe, it, expect } from "vitest";
import { ComposeTranslator } from "./compose.js";
import type { TranslatorContext } from "./translator.js";

const ctx: TranslatorContext = {
  inputName: "docker-compose",
};

describe("ComposeTranslator", () => {
  const translator = new ComposeTranslator();

  it("generates a deploy block with oci units", async () => {
    const input = `
name: production
services:
  order-service:
    image: order-service:1.0.0
  payment-svc:
    image: payment-svc:latest
`;
    const result = await translator.translate(input, ctx);
    expect(result).toContain('deploy "production" {');
    expect(result).toContain('  oci "order-service" {');
    expect(result).toContain('    image "order-service:1.0.0"');
    expect(result).toContain("    realizes OrderService");
    expect(result).toContain('  oci "payment-svc" {');
  });

  it("uses file name as env name when compose name is absent", async () => {
    const input = `
services:
  app:
    image: app:latest
`;
    const result = await translator.translate(input, ctx);
    expect(result).toContain('deploy "docker-compose" {');
  });

  it("uses karasu/realizes label (stage 1)", async () => {
    const input = `
name: prod
services:
  monolith:
    image: monolith:1.0.0
    labels:
      karasu/realizes: "OrderService,InventoryService"
`;
    const result = await translator.translate(input, ctx);
    expect(result).toContain("    realizes OrderService");
    expect(result).toContain("    realizes InventoryService");
  });

  it("uses karasu/realizes label in array format", async () => {
    const input = `
name: prod
services:
  monolith:
    image: monolith:1.0.0
    labels:
      - karasu/realizes=OrderService,InventoryService
`;
    const result = await translator.translate(input, ctx);
    expect(result).toContain("    realizes OrderService");
    expect(result).toContain("    realizes InventoryService");
  });

  it("emits TODO comment for unresolvable names (no hyphen, no label)", async () => {
    const input = `
name: prod
services:
  app:
    image: app:latest
`;
    const result = await translator.translate(input, ctx);
    expect(result).toContain("// TODO: realizes ?");
  });

  it("handles services with no image", async () => {
    const input = `
name: prod
services:
  order-service:
    build: .
`;
    const result = await translator.translate(input, ctx);
    expect(result).toContain('  oci "order-service" {');
    expect(result).not.toContain("image");
  });

  it("throws on invalid YAML", async () => {
    await expect(translator.translate("{ invalid yaml: [", ctx)).rejects.toThrow(
      "Failed to parse docker-compose file",
    );
  });
});
