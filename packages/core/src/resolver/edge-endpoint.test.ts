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
 * statement about two conditions — `peers(C)` for a bare reference,
 * root-anchoring for a qualified one — so the tests name both.
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
  it("a bare reference is bound to peers(C)", () => {
    const file = parse(MODEL);
    // `Payment` is a domain two levels below the system; `Storefront` is a peer.
    expect(resolvedPaths(file, ["Shop"], "Storefront")).toEqual(["Shop.Storefront"]);
    expect(resolvedPaths(file, ["Shop"], "Payment")).toEqual([]);
  });

  it("a qualified reference resolves at any depth when it is anchored at a root", () => {
    const file = parse(MODEL);
    // Naming the system and descending from it — ADR-104's two-segment form
    // generalised along depth.
    expect(resolvedPaths(file, ["Portal", "Web"], "Shop.Checkout.Payment")).toEqual([
      "Shop.Checkout.Payment",
    ]);
  });

  it("a qualified reference that is not root-anchored resolves to nothing in scope", () => {
    const file = parse(MODEL);
    // The suffix matches, the anchoring does not. Left in scope, this would
    // name a node the cross-system ghost machinery cannot frame — it is not in
    // another system — so the edge would land on no view (TPL-2075).
    const index = buildEdgeEndpointIndex(file);
    for (const container of [["Portal", "Web"], ["Shop"]]) {
      const resolution = resolveEdgeEndpoint(
        index,
        find(file, container),
        edgeEndpointRef("Checkout.Payment"),
      );
      expect(resolution.matches.map((m) => m.path.join("."))).toEqual(["Shop.Checkout.Payment"]);
      expect(resolution.inScope).toEqual([]);
    }
  });

  it("a root anchor is reachable from any depth — what keeps Sys.Child working", () => {
    const file = parse(MODEL);
    // From a usecase three levels down, the other system is still nameable.
    expect(resolvedPaths(file, ["Shop", "Checkout", "Payment", "Settle"], "Portal.Web")).toEqual([
      "Portal.Web",
    ]);
  });

  // Root-anchoring narrows what a qualified reference can match, so the
  // ambiguity it can still hit is worth naming: two `system` blocks sharing an
  // id in ONE file are deliberately not merged (ADR-2075), so one anchored
  // path really does name two different nodes.
  const COLLIDING_SYSTEMS = `
system Shop {
  service Payment {}
}
system Shop {
  domain Payment {}
}
system Portal {
  service Web {}
}
`;

  it("ambiguity is drawn for qualified references only", () => {
    const file = parse(COLLIDING_SYSTEMS);
    const index = buildEdgeEndpointIndex(file);
    const qualified = resolveEdgeEndpoint(
      index,
      find(file, ["Portal", "Web"]),
      edgeEndpointRef("Shop.Payment"),
    );
    expect(qualified.inScope.map((m) => `${m.kind}:${m.path.join(".")}`)).toEqual([
      "service:Shop.Payment",
      "domain:Shop.Payment",
    ]);
    expect(qualified.ambiguous).toHaveLength(2);

    // The bare counterpart keeps ADR-2075's verdict and draws no ambiguity.
    const bare = resolveEdgeEndpoint(
      index,
      find(file, ["Portal", "Web"]),
      edgeEndpointRef("Payment"),
    );
    expect(bare.ambiguous).toBeUndefined();
  });

  it("the verdict does not depend on declaration order", () => {
    const serviceFirst = parse(COLLIDING_SYSTEMS);
    const domainFirst = parse(`
system Shop {
  domain Payment {}
}
system Shop {
  service Payment {}
}
system Portal {
  service Web {}
}
`);
    const verdict = (file: KrsFile): string[] | undefined =>
      resolveEdgeEndpoint(
        buildEdgeEndpointIndex(file),
        find(file, ["Portal", "Web"]),
        edgeEndpointRef("Shop.Payment"),
      )
        .ambiguous?.map((m) => m.kind)
        .sort();
    expect(verdict(serviceFirst)).toEqual(verdict(domainFirst));
    expect(verdict(serviceFirst)).toEqual(["domain", "service"]);
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

  it("refuses a reference that is not root-anchored, so no self-ghost is framed", () => {
    // The view and the checker must agree on which references are
    // cross-system. When they did not, `Cart -> Checkout.Payment` framed the
    // declaring system as its own ghost and left the edge unmatched.
    const file = parse(MODEL);
    expect(
      buildGhostEndpointResolver(file.systems)(edgeEndpointRef("Checkout.Payment")),
    ).toBeUndefined();
  });
});
