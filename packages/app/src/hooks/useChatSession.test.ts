// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { detectDrillDownLevel } from "./useChatSession.js";
import type { SystemNode } from "@karasu-tools/core";

// Minimal SystemNode/KrsNode factory helpers
function makeUsecase(id: string): import("@karasu-tools/core").KrsNode {
  return {
    id,
    kind: "usecase",
    label: id,
    children: [],
    edges: [],
    properties: { links: [] },
    _start: 0,
    _end: 0,
  };
}

function makeDomain(id: string, children: import("@karasu-tools/core").KrsNode[] = []): import("@karasu-tools/core").KrsNode {
  return {
    id,
    kind: "domain",
    label: id,
    children,
    edges: [],
    properties: { links: [], team: undefined },
    _start: 0,
    _end: 0,
  };
}

function makeService(id: string, children: import("@karasu-tools/core").KrsNode[] = []): import("@karasu-tools/core").KrsNode {
  return {
    id,
    kind: "service",
    label: id,
    children,
    edges: [],
    properties: { links: [], team: undefined },
    _start: 0,
    _end: 0,
  };
}

function makeSystem(id: string, children: import("@karasu-tools/core").KrsNode[] = []): SystemNode {
  return {
    id,
    kind: "system",
    label: id,
    children,
    edges: [],
    properties: { links: [] },
    _start: 0,
    _end: 0,
  };
}

describe("detectDrillDownLevel", () => {
  const usecase = makeUsecase("PlaceOrder");
  const domain = makeDomain("Order", [usecase]);
  const service = makeService("ECommerce", [domain]);
  const system = makeSystem("ECPlatform", [service]);
  const systems = [system];

  it("returns 'system' when viewPath is empty", () => {
    expect(detectDrillDownLevel([], systems)).toBe("system");
  });

  it("returns 'system' when viewPath points to the system root", () => {
    expect(detectDrillDownLevel(["ECPlatform"], systems)).toBe("system");
  });

  it("returns 'service' when viewPath points to a service", () => {
    expect(detectDrillDownLevel(["ECPlatform", "ECommerce"], systems)).toBe("service");
  });

  it("returns 'domain' when viewPath points to a domain", () => {
    expect(detectDrillDownLevel(["ECPlatform", "ECommerce", "Order"], systems)).toBe("domain");
  });

  it("returns 'usecase' when viewPath points to a usecase", () => {
    expect(detectDrillDownLevel(["ECPlatform", "ECommerce", "Order", "PlaceOrder"], systems)).toBe(
      "usecase",
    );
  });

  it("returns 'system' when resolvedSystems is empty", () => {
    expect(detectDrillDownLevel(["ECPlatform"], [])).toBe("system");
  });

  it("returns 'system' when a path segment is not found", () => {
    expect(detectDrillDownLevel(["ECPlatform", "NonExistent"], systems)).toBe("system");
  });
});
