import { describe, it, expect, vi } from "vitest";
import { Parser } from "../parser/parser.js";
import { withUnassignedSystem } from "./unassigned-system.js";
import { createViewExtractor, extractView, type ViewPath } from "./view-extract.js";
import { buildGhostEndpointResolver } from "../resolver/edge-endpoint.js";
import { buildEntityResolver } from "../resolver/resource-entity.js";
import type { KrsNode } from "../types/ast.js";

// An extractor shares the whole-model context across its calls (#2759). That
// is asserted by counting the builders, not by timing: the two that live in
// other modules are wrapped in spies here, and the two private resource maps
// are built in the same block, so one count covers all four whole-model walks.
vi.mock("../resolver/edge-endpoint.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../resolver/edge-endpoint.js")>();
  return {
    ...actual,
    buildGhostEndpointResolver: vi.fn<typeof actual.buildGhostEndpointResolver>(
      actual.buildGhostEndpointResolver,
    ),
  };
});
vi.mock("../resolver/resource-entity.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../resolver/resource-entity.js")>();
  return {
    ...actual,
    buildEntityResolver: vi.fn<typeof actual.buildEntityResolver>(actual.buildEntityResolver),
  };
});

const ghostBuilds = vi.mocked(buildGhostEndpointResolver);
const entityBuilds = vi.mocked(buildEntityResolver);

function resetCounts(): void {
  ghostBuilds.mockClear();
  entityBuilds.mockClear();
}

const MODEL = `
system Shop {
  database OrderDB {
    table OrderTable { label "Orders" }
  }
  service Sales {
    domain Order {
      usecase PlaceOrder {
        resource OrderDB.OrderTable
      }
    }
  }
  service Catalog {
    domain Product {
      usecase ListProducts
    }
  }
}
system Portal {
  service Web {}
  Web -> Shop.Sales
}
`;

/**
 * The same ids as {@link MODEL}, with the content the whole-model context
 * derives from changed: the sub-resource's label (`buildResourceLabelMap`) and
 * its store kind (`buildResourceInferredTagsMap`: a `bucket` infers `storage`).
 */
const VARIANT = MODEL.replace(
  'database OrderDB {\n    table OrderTable { label "Orders" }',
  'storage OrderDB {\n    bucket OrderTable { label "Orders (variant)" }',
);

const PATHS: ViewPath[] = [
  [],
  ["Shop"],
  ["Shop", "Sales"],
  ["Shop", "Sales", "Order"],
  ["Shop", "Catalog"],
  ["Shop", "Catalog", "Product"],
  ["Portal", "Web"],
];

function systemsOf(source: string): KrsNode[] {
  return withUnassignedSystem(Parser.parse(source).value);
}

describe("createViewExtractor (#2759)", () => {
  it("builds the whole-model context once across every path of a snapshot", () => {
    const extract = createViewExtractor(systemsOf(MODEL));
    resetCounts();
    for (const path of PATHS) extract(path);
    expect(ghostBuilds).toHaveBeenCalledTimes(0);
    expect(entityBuilds).toHaveBeenCalledTimes(0);
  });

  it("returns, path by path, the slice extractView returns", () => {
    const systems = systemsOf(MODEL);
    const extract = createViewExtractor(systems);
    for (const path of PATHS) {
      expect(extract(path)).toEqual(extractView(systems, path));
    }
  });

  it("hands an unresolved path a fresh empty slice each time, not a shared one", () => {
    const extract = createViewExtractor(systemsOf(MODEL));
    const first = extract(["Shop", "Nope"]);
    const second = extract(["Shop", "Nope"]);
    expect(first.childNodes).toEqual([]);
    expect(second.childNodes).toEqual([]);
    expect(first).not.toBe(second);
    expect(first.childNodes).not.toBe(second.childNodes);
  });

  it("keeps two snapshots with the same ids but different content apart", () => {
    const model = createViewExtractor(systemsOf(MODEL));
    const variant = createViewExtractor(systemsOf(VARIANT));
    const path: ViewPath = ["Shop", "Sales", "Order"];
    // Interleave the calls in both orders: neither extractor may see the other's context.
    expect(model(path).resourceLabelMap.get("OrderDB.OrderTable")).toBe("Orders");
    expect(variant(path).resourceLabelMap.get("OrderDB.OrderTable")).toBe("Orders (variant)");
    expect(model(path).resourceInferredTagsMap.get("OrderDB.OrderTable")).toBe("table");
    expect(variant(path).resourceInferredTagsMap.get("OrderDB.OrderTable")).toBe("storage");
  });

  it("passes the orphans of a no-system file through to every call", () => {
    const parsed = Parser.parse("service Solo {\n  domain D {\n    usecase U\n  }\n}").value;
    const extract = createViewExtractor([], parsed.domains, parsed.services);
    expect(extract([]).childNodes.map((n) => n.id)).toEqual(
      extractView([], [], parsed.domains, parsed.services).childNodes.map((n) => n.id),
    );
    expect(extract(["Solo"]).childNodes.map((n) => n.id)).toEqual(["D"]);
  });
});

describe("extractView stays a pure function of its arguments (#2759)", () => {
  it("builds the context on every call: nothing is remembered across calls", () => {
    const systems = systemsOf(MODEL);
    resetCounts();
    for (const path of PATHS) extractView(systems, path);
    expect(ghostBuilds).toHaveBeenCalledTimes(PATHS.length);
    expect(entityBuilds).toHaveBeenCalledTimes(PATHS.length);
  });

  it("reflects a model edited in place between two calls on the same array", () => {
    const systems = systemsOf(MODEL);
    const path: ViewPath = ["Shop", "Sales", "Order"];
    expect(extractView(systems, path).resourceLabelMap.get("OrderDB.OrderTable")).toBe("Orders");
    const table = systems[0].children.find((c) => c.id === "OrderDB")!.children[0];
    table.label = "Orders (edited)";
    expect(extractView(systems, path).resourceLabelMap.get("OrderDB.OrderTable")).toBe(
      "Orders (edited)",
    );
  });
});
