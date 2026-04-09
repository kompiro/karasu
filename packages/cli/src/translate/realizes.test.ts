import { describe, it, expect } from "vitest";
import { kebabToPascal, resolveRealizes, splitRealizes, realizesLines } from "./realizes.js";

describe("kebabToPascal", () => {
  it("converts single segment", () => {
    expect(kebabToPascal("order")).toBe("Order");
  });

  it("converts kebab-case to PascalCase", () => {
    expect(kebabToPascal("order-service")).toBe("OrderService");
  });

  it("converts multi-segment names", () => {
    expect(kebabToPascal("my-api-server")).toBe("MyApiServer");
  });

  it("handles names with no hyphen", () => {
    expect(kebabToPascal("orderservice")).toBe("Orderservice");
  });
});

describe("splitRealizes", () => {
  it("splits single value", () => {
    expect(splitRealizes("OrderService")).toEqual(["OrderService"]);
  });

  it("splits comma-separated values", () => {
    expect(splitRealizes("OrderService,InventoryService")).toEqual([
      "OrderService",
      "InventoryService",
    ]);
  });

  it("trims whitespace", () => {
    expect(splitRealizes("OrderService, InventoryService")).toEqual([
      "OrderService",
      "InventoryService",
    ]);
  });
});

describe("resolveRealizes", () => {
  const emptyMap = new Map<string, string[]>();

  it("stage 1: uses label annotation when present", () => {
    const result = resolveRealizes("order-service", "OrderService", emptyMap);
    expect(result).toEqual({ resolved: true, services: ["OrderService"] });
  });

  it("stage 1: splits comma-separated annotation", () => {
    const result = resolveRealizes("app", "OrderService,InventoryService", emptyMap);
    expect(result).toEqual({ resolved: true, services: ["OrderService", "InventoryService"] });
  });

  it("stage 2: uses map file when no annotation", () => {
    const mapFile = new Map([["legacy-app", ["Settlement"]]]);
    const result = resolveRealizes("legacy-app", undefined, mapFile);
    expect(result).toEqual({ resolved: true, services: ["Settlement"] });
  });

  it("stage 3: heuristic for kebab-case names", () => {
    const result = resolveRealizes("order-service", undefined, emptyMap);
    expect(result).toEqual({ resolved: true, services: ["OrderService"] });
  });

  it("unresolved when no hyphen and no annotation and no map", () => {
    const result = resolveRealizes("app", undefined, emptyMap);
    expect(result).toEqual({ resolved: false });
  });

  it("stage 1 takes priority over map", () => {
    const mapFile = new Map([["order-service", ["WrongService"]]]);
    const result = resolveRealizes("order-service", "OrderService", mapFile);
    expect(result).toEqual({ resolved: true, services: ["OrderService"] });
  });

  it("stage 2 takes priority over heuristic", () => {
    const mapFile = new Map([["order-service", ["ActualService"]]]);
    const result = resolveRealizes("order-service", undefined, mapFile);
    expect(result).toEqual({ resolved: true, services: ["ActualService"] });
  });
});

describe("realizesLines", () => {
  it("emits realizes lines for resolved result", () => {
    const lines = realizesLines("app", { resolved: true, services: ["OrderService", "InventoryService"] });
    expect(lines).toEqual(["    realizes OrderService", "    realizes InventoryService"]);
  });

  it("emits TODO comment for unresolved result", () => {
    const lines = realizesLines("app", { resolved: false });
    expect(lines[0]).toContain("TODO: realizes ?");
  });
});
