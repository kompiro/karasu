import { describe, it, expect } from "vitest";
import { Parser } from "../parser/parser.js";
import type { KrsFile, KrsNode, NodeIdPath } from "../types/ast.js";
import {
  buildEdgeEndpointIndex,
  buildGhostEndpointResolver,
  edgeEndpointRef,
  resolveEdgeEndpoint,
} from "./edge-endpoint.js";

/**
 * Slice E of #2088 (#2577): the endpoint scope rule itself, exercised directly
 * rather than through a diagnostic. The reconciliation with ADR-2075 is a
 * statement about two *sets* — `peers(C)` for a bare reference, `visible(C)`
 * for a qualified one — so the tests name the sets.
 */

const MODEL = `
system Shop {
  service Storefront {}
  service Checkout {
    domain Payment {
      usecase Settle {}
    }
  }
}
system Portal {
  service Web {}
}
`;

function parse(src: string): KrsFile {
  const result = Parser.parse(src);
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return result.value;
}

function find(file: KrsFile, path: NodeIdPath): KrsNode {
  let nodes: KrsNode[] = file.systems;
  let node: KrsNode | undefined;
  for (const segment of path) {
    node = nodes.find((n) => n.id === segment);
    if (!node) throw new Error(`no node at ${path.join(".")}`);
    nodes = node.children;
  }
  return node!;
}

function resolvedPaths(file: KrsFile, container: NodeIdPath, ref: string): string[] {
  const index = buildEdgeEndpointIndex(file);
  const resolution = resolveEdgeEndpoint(index, find(file, container), edgeEndpointRef(ref));
  return resolution.inScope.map((m) => m.path.join("."));
}

describe("edge endpoint scope rule (#2577)", () => {
  it("a bare reference is bound to peers(C), not to the folded visible set", () => {
    const file = parse(MODEL);
    // `Payment` is a domain two levels below the system; `Storefront` is a peer.
    expect(resolvedPaths(file, ["Shop"], "Storefront")).toEqual(["Shop.Storefront"]);
    expect(resolvedPaths(file, ["Shop"], "Payment")).toEqual([]);
  });

  it("a qualified reference resolves at any depth when its head is visible", () => {
    const file = parse(MODEL);
    // Declared at Portal.Web: `Shop` is a top-level root, visible from anywhere.
    expect(resolvedPaths(file, ["Portal", "Web"], "Shop.Checkout.Payment")).toEqual([
      "Shop.Checkout.Payment",
    ]);
    // And from the system scope of the model it belongs to.
    expect(resolvedPaths(file, ["Shop"], "Checkout.Payment")).toEqual(["Shop.Checkout.Payment"]);
  });

  it("a qualified reference whose head is invisible resolves to nothing in scope", () => {
    const file = parse(MODEL);
    // `Checkout` is a peer inside Shop, not a top-level root, so it is not
    // visible from another system — the suffix matches, the scope filter does
    // not. This is the whole reconciliation: reach follows structure.
    const index = buildEdgeEndpointIndex(file);
    const resolution = resolveEdgeEndpoint(
      index,
      find(file, ["Portal", "Web"]),
      edgeEndpointRef("Checkout.Payment"),
    );
    expect(resolution.matches.map((m) => m.path.join("."))).toEqual(["Shop.Checkout.Payment"]);
    expect(resolution.inScope).toEqual([]);
  });

  it("top-level roots stay visible from any depth — the term that keeps Sys.Child working", () => {
    const file = parse(MODEL);
    // From a usecase three levels down, the other system is still nameable.
    expect(resolvedPaths(file, ["Shop", "Checkout", "Payment", "Settle"], "Portal.Web")).toEqual([
      "Portal.Web",
    ]);
  });

  it("ambiguity is drawn for qualified references only", () => {
    // `Shop.Payment` suffixes a top-level system's service (depth 2) and a
    // service named `Shop` nested in another system (depth 3).
    const file = parse(`
system Shop {
  service Payment {}
}
system Portal {
  service Shop {
    domain Payment {}
  }
  service Web {}
}
`);
    const index = buildEdgeEndpointIndex(file);
    const qualified = resolveEdgeEndpoint(
      index,
      find(file, ["Portal"]),
      edgeEndpointRef("Shop.Payment"),
    );
    expect(qualified.inScope.map((m) => m.path.join("."))).toEqual([
      "Shop.Payment",
      "Portal.Shop.Payment",
    ]);
    expect(qualified.ambiguous?.map((m) => m.path.join("."))).toEqual([
      "Shop.Payment",
      "Portal.Shop.Payment",
    ]);

    // The bare counterpart keeps ADR-2075's verdict and draws no ambiguity.
    const bare = resolveEdgeEndpoint(index, find(file, ["Portal"]), edgeEndpointRef("Payment"));
    expect(bare.ambiguous).toBeUndefined();
  });

  it("the verdict does not depend on declaration order", () => {
    const shopFirst = parse(`
system Shop { service Payment {} }
system Portal { service Shop { domain Payment {} } }
`);
    const portalFirst = parse(`
system Portal { service Shop { domain Payment {} } }
system Shop { service Payment {} }
`);
    const verdict = (file: KrsFile): string[] | undefined =>
      resolveEdgeEndpoint(
        buildEdgeEndpointIndex(file),
        find(file, ["Portal"]),
        edgeEndpointRef("Shop.Payment"),
      ).ambiguous?.map((m) => m.path.join("."));
    expect(verdict(shopFirst)?.slice().sort()).toEqual(verdict(portalFirst)?.slice().sort());
    expect(verdict(shopFirst)).toBeDefined();
  });
});

describe("ghost endpoint resolution (#2577)", () => {
  it("frames a deep target in its top-level system and names the ancestors between", () => {
    const file = parse(MODEL);
    const match = buildGhostEndpointResolver(file.systems)(
      edgeEndpointRef("Shop.Checkout.Payment"),
    );
    expect(match?.system.id).toBe("Shop");
    expect(match?.node.id).toBe("Payment");
    expect(match?.path).toEqual(["Shop", "Checkout", "Payment"]);
    expect(match?.ancestors.map((a) => a.id)).toEqual(["Checkout"]);
  });

  it("lands a two-segment reference on the same node the first-dot split used to find", () => {
    const file = parse(MODEL);
    const match = buildGhostEndpointResolver(file.systems)(edgeEndpointRef("Shop.Checkout"));
    expect(match?.path).toEqual(["Shop", "Checkout"]);
    // No ancestors between the frame and a direct child, so no sub-label and
    // no geometry change for ghosts that already existed.
    expect(match?.ancestors).toEqual([]);
  });
});
