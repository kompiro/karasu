import { describe, it, expect, vi } from "vitest";
import {
  kebabToPascal,
  resolveRealizes,
  splitRealizes,
  realizesLines,
  parseMapFile,
} from "./realizes.js";

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
    const lines = realizesLines("app", {
      resolved: true,
      services: ["OrderService", "InventoryService"],
    });
    expect(lines).toEqual(["    realizes OrderService", "    realizes InventoryService"]);
  });

  it("emits TODO comment for unresolved result", () => {
    const lines = realizesLines("app", { resolved: false });
    expect(lines[0]).toContain("TODO: realizes ?");
  });

  it("calls onWarning with the unit name when unresolved", () => {
    const onWarning = vi.fn<(message: string) => void>();
    realizesLines("monolith", { resolved: false }, onWarning);
    expect(onWarning).toHaveBeenCalledOnce();
    expect(onWarning).toHaveBeenCalledWith('Could not resolve realizes for "monolith"');
  });

  it("does not call onWarning when resolved", () => {
    const onWarning = vi.fn<(message: string) => void>();
    realizesLines("order-service", { resolved: true, services: ["OrderService"] }, onWarning);
    expect(onWarning).not.toHaveBeenCalled();
  });

  it("does not throw when onWarning is undefined and unresolved", () => {
    expect(() => realizesLines("app", { resolved: false })).not.toThrow();
  });
});

describe("parseMapFile", () => {
  it("returns an empty map for undefined content", () => {
    expect(parseMapFile(undefined).size).toBe(0);
  });

  it("returns an empty map for empty string", () => {
    expect(parseMapFile("").size).toBe(0);
  });

  it("returns an empty map for non-object YAML (plain scalar)", () => {
    expect(parseMapFile("just a string").size).toBe(0);
  });

  it("treats YAML array-at-root items as string values (via Object.entries on array)", () => {
    // Arrays in JS are objects, so Object.entries iterates over index keys.
    // The parseMapFile implementation does not specifically guard against this —
    // it processes any object-like document. An array-root YAML produces numeric
    // string keys; this test documents the actual behavior.
    const map = parseMapFile("- item1\n- item2\n");
    // String items under numeric keys are treated as comma-separated realizes.
    expect(map.get("0")).toEqual(["item1"]);
    expect(map.get("1")).toEqual(["item2"]);
  });

  it("returns an empty map for null YAML document", () => {
    expect(parseMapFile("null").size).toBe(0);
  });

  it("parses a single string value as a single-element array", () => {
    const map = parseMapFile("app: ECommerce\n");
    expect(map.get("app")).toEqual(["ECommerce"]);
  });

  it("parses comma-separated string value into multiple services", () => {
    const map = parseMapFile("app: OrderService,InventoryService\n");
    expect(map.get("app")).toEqual(["OrderService", "InventoryService"]);
  });

  it("parses an array value", () => {
    const map = parseMapFile("app:\n  - OrderService\n  - InventoryService\n");
    expect(map.get("app")).toEqual(["OrderService", "InventoryService"]);
  });

  it("filters non-string items out of array values", () => {
    const map = parseMapFile("app:\n  - OrderService\n  - 42\n");
    expect(map.get("app")).toEqual(["OrderService"]);
  });

  it("parses multiple entries", () => {
    const map = parseMapFile("order-service: OrderService\napp: ECommerce\n");
    expect(map.get("order-service")).toEqual(["OrderService"]);
    expect(map.get("app")).toEqual(["ECommerce"]);
  });

  it("ignores keys whose value is neither string nor array", () => {
    // YAML object value — should be skipped (not string, not array)
    const map = parseMapFile("key:\n  nested: value\n");
    expect(map.has("key")).toBe(false);
  });
});
