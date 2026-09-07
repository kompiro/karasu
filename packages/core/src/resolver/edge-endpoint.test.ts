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

  it("refuses a path rooted at a top-level orphan — nothing could draw it", () => {
    // The checker's declared-path pool covers the orphan buckets, so
    // `Billing.Invoice` matches at full length; the ghost renderer walks
    // systems only. Requiring a `system` root is what keeps the two pools
    // answering the same question.
    const file = parse(`
domain Billing {
  entity Invoice {}
}

system Shop {
  service Checkout {}
}
`);
    const index = buildEdgeEndpointIndex(file);
    const resolution = resolveEdgeEndpoint(
      index,
      find(file, ["Shop", "Checkout"]),
      edgeEndpointRef("Billing.Invoice"),
    );
    expect(resolution.matches.map((m) => m.path.join("."))).toEqual(["Billing.Invoice"]);
    expect(resolution.inScope).toEqual([]);
    expect(
      buildGhostEndpointResolver(file.systems)(edgeEndpointRef("Billing.Invoice")),
    ).toBeUndefined();
  });

  it("decides by the node, not by the root id — a colliding orphan stays out", () => {
    const file = parse(`
domain Shop {
  entity Invoice {}
}

system Shop {
  service Checkout {}
}

system Portal {
  service Web {}
}
`);
    const index = buildEdgeEndpointIndex(file);
    const ref = edgeEndpointRef("Shop.Invoice");
    const resolution = resolveEdgeEndpoint(index, find(file, ["Portal", "Web"]), ref);
    // The suffix matches the orphan's entity, and a system named `Shop` does
    // exist — so an id test would pass it. The node is still not inside one.
    expect(resolution.matches.map((m) => m.path.join("."))).toEqual(["Shop.Invoice"]);
    expect(resolution.inScope).toEqual([]);
    expect(buildGhostEndpointResolver(file.systems)(ref)).toBeUndefined();
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

  // #2759: the resolver buckets its entries by last path segment and scans
  // only the reference's bucket. The cases below pin what that must not
  // change: the match at every depth, first-declared-wins, and the two ways a
  // lookup comes back empty.
  it("resolves a two- and a three-segment reference from the last-segment bucket", () => {
    const resolve = buildGhostEndpointResolver(parse(MODEL).systems);
    expect(resolve(edgeEndpointRef("Shop.Storefront"))?.path).toEqual(["Shop", "Storefront"]);
    const deep = resolve(edgeEndpointRef("Shop.Checkout.Payment"));
    expect(deep?.system.id).toBe("Shop");
    expect(deep?.path).toEqual(["Shop", "Checkout", "Payment"]);
    expect(deep?.ancestors.map((a) => a.id)).toEqual(["Checkout"]);
    expect(
      resolve(edgeEndpointRef("Shop.Checkout.Payment.Settle"))?.ancestors.map((a) => a.id),
    ).toEqual(["Checkout", "Payment"]);
  });

  it("keeps first-declared-wins when the last segment exists under two systems", () => {
    // Both `Web`s share the "Web" bucket. Rooted at different systems they
    // resolve apart; rooted at the same id (the same full path twice) the tie
    // goes to whichever system comes first, as it always did.
    const shop = parse('system Shop { service Web { label "shop" } }').systems;
    const portal = parse('system Portal { service Web { label "portal" } }').systems;
    const apart = buildGhostEndpointResolver([...shop, ...portal]);
    expect(apart(edgeEndpointRef("Shop.Web"))?.node.label).toBe("shop");
    expect(apart(edgeEndpointRef("Portal.Web"))?.node.label).toBe("portal");

    const shopAgain = parse('system Shop { service Web { label "shop again" } }').systems;
    const tied = buildGhostEndpointResolver([...shop, ...shopAgain]);
    expect(tied(edgeEndpointRef("Shop.Web"))?.node.label).toBe("shop");
    const reversed = buildGhostEndpointResolver([...shopAgain, ...shop]);
    expect(reversed(edgeEndpointRef("Shop.Web"))?.node.label).toBe("shop again");
  });

  it("returns nothing for a last segment no node carries", () => {
    const resolve = buildGhostEndpointResolver(parse(MODEL).systems);
    expect(resolve(edgeEndpointRef("Shop.Missing"))).toBeUndefined();
    expect(resolve(edgeEndpointRef("Missing"))).toBeUndefined();
  });

  it("returns nothing when the same-named entries all sit at another depth", () => {
    // `Payment` is declared at depth 3 only: a bare spelling is a suffix match
    // whose length differs, and a two-segment spelling under the wrong parent
    // is no suffix match at all. Neither becomes a match through the bucket.
    const resolve = buildGhostEndpointResolver(parse(MODEL).systems);
    expect(resolve(edgeEndpointRef("Payment"))).toBeUndefined();
    expect(resolve(edgeEndpointRef("Shop.Payment"))).toBeUndefined();
    expect(resolve(edgeEndpointRef("Shop.Checkout.Payment.Settle.Payment"))).toBeUndefined();
  });
});
