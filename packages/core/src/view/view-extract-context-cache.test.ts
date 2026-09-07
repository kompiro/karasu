import { describe, it, expect, vi } from "vitest";
import { Parser } from "../parser/parser.js";
import { withUnassignedSystem } from "./unassigned-system.js";
import { extractView, type ViewPath } from "./view-extract.js";
import { buildGhostEndpointResolver } from "../resolver/edge-endpoint.js";
import { buildEntityResolver } from "../resolver/resource-entity.js";
import type { KrsNode } from "../types/ast.js";

// The whole-model context of `extractView` is built once per `systems` array
// (#2759). That is asserted by counting its builders, not by timing: the two
// builders that live in other modules are wrapped in spies here, and the two
// private resource maps are built in the same block, so one count covers all
// four whole-model walks.
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
 * The same ids as {@link MODEL} (every system, service, domain, infra node and
 * sub-resource), with content the whole-model context derives from changed:
 * the sub-resource's label (`buildResourceLabelMap`) and its store kind
 * (`buildResourceInferredTagsMap`: a `bucket` infers `storage`, a `table`
 * infers `table`).
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
  ["Portal"],
  // An unresolvable path answers with the shared empty slice, from the cache too.
  ["Shop", "Missing"],
];

function parseSystems(source: string): KrsNode[] {
  const result = Parser.parse(source);
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return withUnassignedSystem(result.value);
}

describe("extractView whole-model context cache (#2759)", () => {
  it("builds the whole-model context once for every path of one systems array", () => {
    const systems = parseSystems(MODEL);
    resetCounts();
    for (const path of PATHS) extractView(systems, path);
    expect(ghostBuilds).toHaveBeenCalledTimes(1);
    expect(entityBuilds).toHaveBeenCalledTimes(1);

    // A fresh parse is a new array and gets its own context; the first array
    // stays served from the cache.
    const reparsed = parseSystems(MODEL);
    extractView(reparsed, []);
    extractView(systems, ["Shop"]);
    expect(ghostBuilds).toHaveBeenCalledTimes(2);
    expect(entityBuilds).toHaveBeenCalledTimes(2);
  });

  it("rebuilds for every call that passes orphans, and for the no-system file", () => {
    const file = Parser.parse(`
system Shop {
  service Sales {}
}
service Support {}
domain Billing {
  usecase Invoice
}
`).value;
    resetCounts();
    // Orphans are inputs the array key does not see, so they are never cached.
    extractView(file.systems, [], file.domains, file.services);
    extractView(file.systems, [], file.domains, file.services);
    expect(ghostBuilds).toHaveBeenCalledTimes(2);
    expect(entityBuilds).toHaveBeenCalledTimes(2);
    // Neither is an empty systems array a key: the no-system file is built per call.
    extractView([], [], file.domains, file.services);
    extractView([], [], file.domains, file.services);
    expect(ghostBuilds).toHaveBeenCalledTimes(4);
    expect(entityBuilds).toHaveBeenCalledTimes(4);
  });

  it("serves the same slice from the cache as from a fresh build", () => {
    const cached = parseSystems(MODEL);
    extractView(cached, []); // warm the cache
    for (const path of PATHS) {
      const fresh = parseSystems(MODEL);
      expect(extractView(cached, path)).toEqual(extractView(fresh, path));
    }
  });

  it("cannot serve a stale context: arrays with the same ids but different content stay independent", () => {
    const path: ViewPath = ["Shop", "Sales", "Order"];
    const labelOf = (systems: KrsNode[]): string | undefined =>
      extractView(systems, path).resourceLabelMap.get("OrderDB.OrderTable");
    const tagOf = (systems: KrsNode[]): string | undefined =>
      extractView(systems, path).resourceInferredTagsMap.get("OrderDB.OrderTable");

    // Either call order, on fresh arrays each time, and every array asked
    // again after the other one was built and cached.
    for (const variantFirst of [false, true]) {
      const model = parseSystems(MODEL);
      const variant = parseSystems(VARIANT);
      const ordered = variantFirst ? [variant, model] : [model, variant];
      for (const systems of [...ordered, ...ordered]) {
        const expected =
          systems === model
            ? { label: "Orders", tag: "table" }
            : { label: "Orders (variant)", tag: "storage" };
        expect(labelOf(systems)).toBe(expected.label);
        expect(tagOf(systems)).toBe(expected.tag);
      }
    }
  });
});
