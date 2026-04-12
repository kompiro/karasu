// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { detectDrillDownLevel } from "./useChatSession.js";
import type { SystemNode, KrsNode } from "@karasu-tools/core";

const EMPTY_LOC = {
  start: { line: 0, column: 0, offset: 0 },
  end: { line: 0, column: 0, offset: 0 },
};

function makeUsecase(id: string): KrsNode {
  return {
    id,
    kind: "usecase",
    label: id,
    tags: [],
    annotations: [],
    children: [],
    edges: [],
    loc: EMPTY_LOC,
    properties: { links: [] },
  } as unknown as KrsNode;
}

function makeDomain(id: string, children: KrsNode[] = []): KrsNode {
  return {
    id,
    kind: "domain",
    label: id,
    tags: [],
    annotations: [],
    children,
    edges: [],
    loc: EMPTY_LOC,
    properties: { links: [], team: undefined },
  } as unknown as KrsNode;
}

function makeService(id: string, children: KrsNode[] = []): KrsNode {
  return {
    id,
    kind: "service",
    label: id,
    tags: [],
    annotations: [],
    children,
    edges: [],
    loc: EMPTY_LOC,
    properties: { links: [], team: undefined },
  } as unknown as KrsNode;
}

function makeSystem(id: string, children: KrsNode[] = []): SystemNode {
  return {
    id,
    kind: "system",
    label: id,
    tags: [],
    annotations: [],
    children,
    edges: [],
    loc: EMPTY_LOC,
    properties: { links: [] },
  } as unknown as SystemNode;
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
