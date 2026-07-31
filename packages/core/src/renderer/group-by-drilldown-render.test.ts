import { describe, it, expect } from "vitest";
import {
  compile,
  compileProject,
  InMemoryFileSystemProvider,
  renderEntityView as renderEntityViewFromSource,
} from "../index.js";
import { Parser } from "../parser/parser.js";
import type { LogicalNodeKind } from "../types/ast.js";
import { extractView } from "../view/view-extract.js";
import { layout } from "./layout.js";
import { buildAllLayersSvg } from "./all-layers-svg.js";
import { buildDrillDownSvg, buildAllViewsSvg, renderEntityView } from "./drill-down-svg.js";
import { countPolylinePenetrations, type Rect, type Point } from "./edge-geometry.js";
import type { LayoutNode, LayoutResult } from "./layout-types.js";

// Grouping resolves per view, against the nodes rendered at the level being
// drawn (#1983): each level frames the members present there, members living
// at other levels do not participate, and one boundary may produce disjoint
// frames on several levels. These fences pin that semantics across the
// interactive compile path AND the three static export builders (the #1879
// gate held exports to the root level; TPL-1983 requires the gate
// state to agree across every surface). Mirrors group-by-boundary-render.test.ts
// (the root-level P2b fences).

// Members live at *drill* levels only: a nested domain (service view), a
// usecase (domain view), an entity (entity view). The root tier has no
// members, so every frame asserted below is a drill-level frame.
const DRILL_BODY = `
system Shop {
  service Orders {
    domain OrderDomain {
      usecase PlaceOrder
      entity OrderEntity {}
      entity Invoice {}
      OrderDomain -> ShippingDomain "hand off"
    }
    domain ShippingDomain {}
  }
  service Billing {}
  Orders -> Billing "invoice"
}
`;
const DRILL_SRC = `${DRILL_BODY}
boundary cluster {
  label "Cluster"
  contains OrderDomain
  contains PlaceOrder
  contains OrderEntity
}
`;

const FRAME = 'data-container-id="__group_cluster__"';

function systemSvg(
  src: string,
  viewPath?: string[],
  groupBy?: "team" | "boundary",
  collapsedGroups?: ReadonlySet<string>,
): string {
  const result = compile(src, { diagramType: "system", viewPath, groupBy, collapsedGroups });
  if (result.diagramType !== "system") throw new Error("expected system view");
  return result.svg;
}

/**
 * Split a CSS :target bundle (drill-down / all-views) into per-level chunks
 * keyed by level id. A chunk runs from its `<g id="krs-...">` opener to the
 * next level's opener, so chunk-to-chunk comparison across two outputs of the
 * same model compares the same level.
 */
function levelsOf(svg: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const chunk of svg.split(/(?=<g id="krs-)/)) {
    const m = chunk.match(/^<g id="(krs-[^"]+)"/);
    if (m) map.set(m[1], chunk);
  }
  return map;
}

/**
 * The all-layers band inner contents, in band order (root first). Captures
 * only the content inside each band's `<svg x= y=...>` wrapper so the
 * comparison is immune to the y-offset shifts a taller (framed) band above
 * causes. Fixtures render in shape mode, so band content never nests `<svg>`.
 */
function bandsOf(svg: string): string[] {
  return [
    ...svg.matchAll(
      /<svg x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" viewBox="[^"]*">([\s\S]*?)<\/svg>/g,
    ),
  ].map((m) => m[1]);
}

describe("drill-down grouping (#1983) — interactive compile", () => {
  it("frames the member at the service drill level (nested domain; single member)", () => {
    const svg = systemSvg(DRILL_SRC, ["Shop", "Orders"], "boundary");
    expect(svg).toContain(FRAME);
    expect(svg).toContain('data-node-id="OrderDomain"');
    // The non-member sibling stays outside as a regular node.
    expect(svg).toContain('data-node-id="ShippingDomain"');
  });

  it("frames the member at the domain drill level (usecase)", () => {
    const svg = systemSvg(DRILL_SRC, ["Shop", "Orders", "OrderDomain"], "boundary");
    expect(svg).toContain(FRAME);
    expect(svg).toContain('data-node-id="PlaceOrder"');
  });

  it("draws no frame on a level without members — byte-identical to ungrouped (rule 3)", () => {
    // Every member lives on a drill level, so the grouped ROOT render must
    // fall back to the ungrouped layout exactly.
    const grouped = systemSvg(DRILL_SRC, undefined, "boundary");
    expect(grouped).not.toContain('data-container-id="__group_');
    expect(grouped).toBe(systemSvg(DRILL_SRC));
  });

  it("keeps ungrouped drill output byte-identical to a boundary-less model (opt-in)", () => {
    expect(systemSvg(DRILL_SRC, ["Shop", "Orders"])).toBe(
      systemSvg(DRILL_BODY, ["Shop", "Orders"]),
    );
    expect(systemSvg(DRILL_SRC, ["Shop", "Orders", "OrderDomain"])).toBe(
      systemSvg(DRILL_BODY, ["Shop", "Orders", "OrderDomain"]),
    );
  });

  it("frames every node when the whole drill level belongs to one boundary (degenerate)", () => {
    const allMembers = `${DRILL_BODY}
boundary cluster {
  label "Cluster"
  contains OrderDomain
  contains ShippingDomain
}
`;
    const svg = systemSvg(allMembers, ["Shop", "Orders"], "boundary");
    expect(svg.match(/data-group="true"/g)?.length).toBe(1);
    expect(svg).toContain('data-node-id="OrderDomain"');
    expect(svg).toContain('data-node-id="ShippingDomain"');
  });
});

describe("collapse round-trip on a drill slice (TPL-1738)", () => {
  it("folds members to the stub, keeps non-members, and expands back byte-identically", () => {
    const expanded = systemSvg(DRILL_SRC, ["Shop", "Orders"], "boundary");
    const collapsed = systemSvg(DRILL_SRC, ["Shop", "Orders"], "boundary", new Set(["cluster"]));

    // Fold: the member disappears into exactly one stub; the non-member stays.
    expect(collapsed).toContain('data-node-id="__group_collapsed_cluster__"');
    expect(collapsed.match(/data-node-id="__group_collapsed_cluster__"/g)?.length).toBe(1);
    expect(collapsed).not.toContain('data-node-id="OrderDomain"');
    expect(collapsed).toContain('data-node-id="ShippingDomain"');

    // Round trip: expanding again restores the exact grouped output.
    expect(systemSvg(DRILL_SRC, ["Shop", "Orders"], "boundary", new Set())).toBe(expanded);
  });

  it("re-targets the folded member's edges onto the stub (endpoint preservation)", () => {
    const parsed = Parser.parse(DRILL_SRC).value;
    const slice = extractView(parsed.systems, ["Shop", "Orders"]);
    const res = layout(slice, {
      boundaryMembership: parsed.boundaryMembership,
      groupBy: "boundary",
      collapsedGroups: new Set(["cluster"]),
    });
    // OrderDomain -> ShippingDomain survives as stub -> ShippingDomain.
    expect(
      res.edges.some((e) => e.from === "__group_collapsed_cluster__" && e.to === "ShippingDomain"),
    ).toBe(true);
    // Exactly-once placement: the member is gone, the stub and the non-member
    // are laid out once each.
    expect(res.nodes.has("OrderDomain")).toBe(false);
    expect(res.nodes.has("__group_collapsed_cluster__")).toBe(true);
    expect(res.nodes.has("ShippingDomain")).toBe(true);
  });
});

// A member that appears as a *ghost* on the drilled level: BillingDomain lives
// in service Billing but is edge-connected from OrderDomain, so the Orders
// view draws it as a ghost. Ghosts are context, not content — they never
// bucket, frame, or fold (rule 4; TPL-1223).
const GHOST_BODY = `
system Shop {
  service Orders {
    domain OrderDomain {
      OrderDomain -> BillingDomain "bill"
    }
    domain ShippingDomain {}
  }
  service Billing {
    domain BillingDomain {}
  }
}
`;

describe("ghosts stay out of drill grouping (rule 4)", () => {
  it("draws no frame when the only member at this level is a ghost", () => {
    const ghostOnly = `${GHOST_BODY}
boundary cluster {
  label "Cluster"
  contains BillingDomain
}
`;
    const svg = systemSvg(ghostOnly, ["Shop", "Orders"], "boundary");
    // The ghost renders (context preserved) but triggers no frame.
    expect(svg).toContain('data-node-id="BillingDomain"');
    expect(svg).not.toContain('data-container-id="__group_');
  });

  it("keeps a member ghost out of the collapse fold", () => {
    const both = `${GHOST_BODY}
boundary cluster {
  label "Cluster"
  contains OrderDomain
  contains BillingDomain
}
`;
    const svg = systemSvg(both, ["Shop", "Orders"], "boundary", new Set(["cluster"]));
    expect(svg).toContain('data-node-id="__group_collapsed_cluster__"');
    // Real member folds; the ghost member survives as a node.
    expect(svg).not.toContain('data-node-id="OrderDomain"');
    expect(svg).toContain('data-node-id="BillingDomain"');
  });

  it("buckets only viewSlice.childNodes — ghost-list nodes never reach the group index (structural)", () => {
    // Fences the structural reason for rule 4: the bucket input is the
    // childNodes list, and the ghost lists are separate ViewSlice fields, so
    // a member ghost must not produce a group band even though its id IS in
    // the boundary index. Guards against a future retrofit accidentally
    // feeding ghost nodes into groupIdOf.
    const ghostOnly = `${GHOST_BODY}
boundary cluster {
  label "Cluster"
  contains BillingDomain
}
`;
    const parsed = Parser.parse(ghostOnly).value;
    expect(parsed.boundaryMembership.get("BillingDomain")).toEqual(["cluster"]);
    const slice = extractView(parsed.systems, ["Shop", "Orders"]);
    expect(slice.ghostDomains.some((g) => g.node.id === "BillingDomain")).toBe(true);
    expect(slice.childNodes.some((n) => n.id === "BillingDomain")).toBe(false);
    const res = layout(slice, {
      boundaryMembership: parsed.boundaryMembership,
      groupBy: "boundary",
    });
    expect(res.containers.filter((c) => c.group)).toHaveLength(0);
    expect(res.nodes.get("BillingDomain")?.ghost).toBe(true);
  });
});

describe("export surfaces draw frames on drill levels (#1983)", () => {
  it("buildAllLayersSvg: each drill band frames its own members; the root band stays clean", () => {
    const krsFile = Parser.parse(DRILL_SRC).value;
    const { svg } = buildAllLayersSvg(
      krsFile,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "boundary",
    );
    const bands = bandsOf(svg);
    // Bands: Shop (root) / Orders / OrderDomain.
    expect(bands).toHaveLength(3);
    expect(bands[0]).not.toContain(FRAME);
    expect(bands[1]).toContain(FRAME); // OrderDomain framed on the Orders band
    expect(bands[2]).toContain(FRAME); // PlaceOrder framed on the OrderDomain band
    // Exports never fold: no collapse stub anywhere.
    expect(svg).not.toContain("__group_collapsed_");
  });

  it("buildDrillDownSvg: drill pages and the entity page frame their members", () => {
    const krsFile = Parser.parse(DRILL_SRC).value;
    const { svg } = buildDrillDownSvg(
      krsFile,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "boundary",
    );
    const levels = levelsOf(svg);
    expect(levels.get("krs-system-root")).not.toContain(FRAME);
    expect(levels.get("krs-system-Orders")).toContain(FRAME);
    expect(levels.get("krs-system-OrderDomain")).toContain(FRAME);
    // The per-domain entity level frames its entity member too.
    expect(levels.get("krs-entity-OrderDomain")).toContain(FRAME);
    expect(svg).not.toContain("__group_collapsed_");
  });

  it("buildAllViewsSvg: the bundled system pane frames the same levels", () => {
    const krsFile = Parser.parse(DRILL_SRC).value;
    const { svg } = buildAllViewsSvg(
      krsFile,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "boundary",
    );
    const levels = levelsOf(svg);
    expect(levels.get("krs-system-root")).not.toContain(FRAME);
    expect(levels.get("krs-system-Orders")).toContain(FRAME);
    expect(levels.get("krs-system-OrderDomain")).toContain(FRAME);
    expect(levels.get("krs-entity-OrderDomain")).toContain(FRAME);
    expect(svg).not.toContain("__group_collapsed_");
  });

  it("renderEntityView frames entity members — no interactive collapse control", () => {
    const krsFile = Parser.parse(DRILL_SRC).value;
    const result = renderEntityView(
      krsFile,
      ["Shop", "Orders", "OrderDomain"],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "boundary",
    );
    expect(result.hasContent).toBe(true);
    expect(result.svg).toContain(FRAME);
    expect(result.svg).toContain('data-node-id="OrderEntity"');
    // Non-member entity stays outside the frame's membership.
    expect(result.svg).toContain('data-node-id="Invoice"');
    // Frames only: the ⊖ collapse control is gated on `interactive`, which the
    // entity view does not pass (ADR-1821).
    expect(result.svg).not.toContain("krs-group-controls");
  });

  it("renderEntityView without groupBy stays byte-identical to a boundary-less model", () => {
    const withBoundary = Parser.parse(DRILL_SRC).value;
    const without = Parser.parse(DRILL_BODY).value;
    expect(renderEntityView(withBoundary, ["Shop", "Orders", "OrderDomain"]).svg).toBe(
      renderEntityView(without, ["Shop", "Orders", "OrderDomain"]).svg,
    );
  });

  it("public renderEntityView (source-string API) frames entity members like the internal path", () => {
    // Companion to "renderEntityView frames entity members" above, but
    // through the public wrapper (packages/core/src/index.ts), which parses
    // krsSource and forwards `groupBy` to `_renderEntityView` — a second call
    // site TPL-219 (parallel-function parity) requires covering on
    // its own. The byte-identical fence below this test (and the ROOT_ONLY_SRC
    // one further down) only exercises `groupBy` with no entity member on the
    // view, so a dropped/misforwarded argument would pass it trivially (an
    // absent member frames nothing either way, forwarded or not). Only a
    // positive case — a member present — can catch that class of bug.
    const result = renderEntityViewFromSource(
      DRILL_SRC,
      ["Shop", "Orders", "OrderDomain"],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "boundary",
    );
    expect(result.hasContent).toBe(true);
    expect(result.svg).toContain(FRAME);
    expect(result.svg).toContain('data-node-id="OrderEntity"');
    expect(result.svg).toContain('data-node-id="Invoice"');
  });
});

// Members on the ROOT tier only: with the export gate removed, a drill level
// with no members must still fall back to the exact ungrouped layout — the
// direct fence for #1879's "grouped export must not disturb the full
// structure" on every level below the root.
const ROOT_ONLY_SRC = `${DRILL_BODY}
boundary rootline {
  label "Rootline"
  contains Orders
  contains Billing
}
`;

describe("levels without members match the ungrouped export byte-for-byte (#1879 fence)", () => {
  it("buildDrillDownSvg: root page differs (framed), every drill page is byte-identical", () => {
    const krsFile = Parser.parse(ROOT_ONLY_SRC).value;
    const grouped = levelsOf(
      buildDrillDownSvg(krsFile, undefined, undefined, undefined, undefined, undefined, "boundary")
        .svg,
    );
    const ungrouped = levelsOf(buildDrillDownSvg(krsFile).svg);
    expect(grouped.get("krs-system-root")).toContain('data-container-id="__group_rootline__"');
    expect(grouped.get("krs-system-root")).not.toBe(ungrouped.get("krs-system-root"));
    for (const id of ["krs-system-Orders", "krs-system-OrderDomain", "krs-entity-OrderDomain"]) {
      expect(grouped.get(id)).toBeDefined();
      expect(grouped.get(id)).toBe(ungrouped.get(id));
    }
  });

  it("buildAllViewsSvg: root level differs (framed), every drill level is byte-identical", () => {
    const krsFile = Parser.parse(ROOT_ONLY_SRC).value;
    const grouped = levelsOf(
      buildAllViewsSvg(krsFile, undefined, undefined, undefined, undefined, undefined, "boundary")
        .svg,
    );
    const ungrouped = levelsOf(buildAllViewsSvg(krsFile).svg);
    expect(grouped.get("krs-system-root")).toContain('data-container-id="__group_rootline__"');
    expect(grouped.get("krs-system-root")).not.toBe(ungrouped.get("krs-system-root"));
    for (const id of ["krs-system-Orders", "krs-system-OrderDomain", "krs-entity-OrderDomain"]) {
      expect(grouped.get(id)).toBeDefined();
      expect(grouped.get(id)).toBe(ungrouped.get(id));
    }
  });

  it("buildAllLayersSvg: root band differs (framed), every drill band is byte-identical", () => {
    const krsFile = Parser.parse(ROOT_ONLY_SRC).value;
    const grouped = bandsOf(
      buildAllLayersSvg(krsFile, undefined, undefined, undefined, undefined, undefined, "boundary")
        .svg,
    );
    const ungrouped = bandsOf(buildAllLayersSvg(krsFile).svg);
    expect(grouped).toHaveLength(3);
    expect(ungrouped).toHaveLength(3);
    expect(grouped[0]).toContain('data-container-id="__group_rootline__"');
    expect(grouped[0]).not.toBe(ungrouped[0]);
    expect(grouped[1]).toBe(ungrouped[1]);
    expect(grouped[2]).toBe(ungrouped[2]);
  });

  it("exports without groupBy are byte-identical to a boundary-less model (opt-in)", () => {
    const withBoundary = Parser.parse(DRILL_SRC).value;
    const without = Parser.parse(DRILL_BODY).value;
    expect(buildAllLayersSvg(withBoundary).svg).toBe(buildAllLayersSvg(without).svg);
    expect(buildDrillDownSvg(withBoundary).svg).toBe(buildDrillDownSvg(without).svg);
    expect(buildAllViewsSvg(withBoundary).svg).toBe(buildAllViewsSvg(without).svg);
  });

  it("public renderEntityView: grouped with no entity members is byte-identical to ungrouped", () => {
    // The public source-string API (packages/core/src/index.ts) is its own
    // call path: with the axis set but no member on this entity view, it must
    // fall back to the exact ungrouped output, like the export builders above.
    const grouped = renderEntityViewFromSource(
      ROOT_ONLY_SRC,
      ["Shop", "Orders", "OrderDomain"],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "boundary",
    );
    const plain = renderEntityViewFromSource(ROOT_ONLY_SRC, ["Shop", "Orders", "OrderDomain"]);
    expect(grouped.hasContent).toBe(true);
    expect(grouped.svg).not.toContain('data-container-id="__group_');
    expect(grouped.svg).toBe(plain.svg);
  });
});

describe("P2c routing on a grouped drill view (TPL-1927)", () => {
  // Two boundaries of domains inside ONE service, with edges that cross the
  // band stack (A→C into the next band, A→E down to the trailing un-grouped
  // band), so the gutter router must engage on the drill slice.
  const P2C_SRC = `
system Shop {
  service Orders {
    domain A {
      A -> C "x"
      A -> E "z"
    }
    domain B {
      B -> D "y"
    }
    domain C {}
    domain D {}
    domain E {}
  }
}
boundary g1 {
  label "G1"
  contains A
  contains B
}
boundary g2 {
  label "G2"
  contains C
  contains D
}
`;

  function drillLayout(): LayoutResult {
    const parsed = Parser.parse(P2C_SRC).value;
    const slice = extractView(parsed.systems, ["Shop", "Orders"]);
    return layout(slice, { boundaryMembership: parsed.boundaryMembership, groupBy: "boundary" });
  }

  function framesOf(res: LayoutResult): (Rect & { id: string })[] {
    return res.containers
      .filter((c) => c.group)
      .map((c) => ({ id: c.id, x: c.x, y: c.y, width: c.width, height: c.height }));
  }

  function frameOfNode(n: LayoutNode, frames: (Rect & { id: string })[]): string | null {
    for (const f of frames) {
      if (
        n.x >= f.x &&
        n.x + n.width <= f.x + f.width &&
        n.y >= f.y &&
        n.y + n.height <= f.y + f.height
      )
        return f.id;
    }
    return null;
  }

  /** Obstacles an edge must not pierce: non-endpoint nodes + non-endpoint frames. */
  function obstaclesFor(
    res: LayoutResult,
    frames: (Rect & { id: string })[],
    from: LayoutNode,
    to: LayoutNode,
  ): Rect[] {
    const fFrom = frameOfNode(from, frames);
    const fTo = frameOfNode(to, frames);
    return [
      ...[...res.nodes.values()].filter((n) => n.id !== from.id && n.id !== to.id),
      ...frames.filter((f) => f.id !== fFrom && f.id !== fTo),
    ];
  }

  it("routes with zero penetrations where straight lines would pierce (dual metric)", () => {
    const res = drillLayout();
    const frames = framesOf(res);
    expect(frames.map((f) => f.id).sort()).toEqual(["__group_g1__", "__group_g2__"]);

    let penetrations = 0;
    let straightBaseline = 0;
    let crossings = 0;
    const segments: [Point, Point][] = [];
    for (const e of res.edges) {
      if (e.ghost || e.cyclic) continue;
      const from = res.nodes.get(e.from)!;
      const to = res.nodes.get(e.to)!;
      const obstacles = obstaclesFor(res, frames, from, to);
      const pts: Point[] = [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
      penetrations += countPolylinePenetrations(pts, obstacles);
      const center = (n: LayoutNode): Point => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 });
      straightBaseline += countPolylinePenetrations([center(from), center(to)], obstacles);
      for (let i = 0; i < pts.length - 1; i++) segments.push([pts[i], pts[i + 1]]);
    }
    // The fixture is hard enough to exercise the router (straight lines pierce)…
    expect(straightBaseline).toBeGreaterThan(0);
    // …and the routed drill layout pierces nothing.
    expect(penetrations).toBe(0);
    // Dual metric (TPL-1927): crossings are measured alongside, not
    // judged alone — pin the observed value so a routing change that raises
    // crossings on this drill fixture surfaces for re-evaluation (raise the
    // pin deliberately if a future router trades crossings for readability).
    const cross = (a: Point, b: Point, c: Point, d: Point): boolean => {
      const o = (p: Point, q: Point, r: Point) =>
        Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
      const o1 = o(a, b, c),
        o2 = o(a, b, d),
        o3 = o(c, d, a),
        o4 = o(c, d, b);
      return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
    };
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        if (cross(segments[i][0], segments[i][1], segments[j][0], segments[j][1])) crossings++;
      }
    }
    expect(crossings).toBeLessThanOrEqual(0); // observed 0 on this fixture
  });
});

describe("cross-file members group on drill levels (multi-file merge)", () => {
  it("frames a member declared in an imported file at its drill level", async () => {
    // The merged boundaryMembership (unioned across files) must reach the drill
    // render exactly like the single-file path. Reference existence is
    // re-validated against the merged id-space (#2032), so a cross-file
    // `contains` member no longer draws a false `contains-target-not-found` —
    // this fence pins both that the *grouping* resolves on the merged model and
    // that the diagnostic stays silent for a resolvable cross-file member.
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(
      "/p/index.krs",
      `import "./billing.krs"
system Shop {
  service Orders {}
}
boundary cluster {
  label "Cluster"
  contains BillingDomain
}
`,
    );
    await fs.writeFile(
      "/p/billing.krs",
      `system Shop {
  service Billing {
    domain BillingDomain {}
    domain LedgerDomain {}
  }
}
`,
    );
    const result = await compileProject("/p/index.krs", fs, {
      diagramType: "system",
      groupBy: "boundary",
      viewPath: ["Shop", "Billing"],
    });
    if (result.diagramType !== "system") throw new Error("expected system view");
    expect(result.svg).toContain(FRAME);
    expect(result.svg).toContain('data-node-id="BillingDomain"');
    expect(result.svg).toContain('data-node-id="LedgerDomain"');
    // #2032: the cross-file member resolves in the merged model, so no false
    // `contains-target-not-found` (fixed code + severity — TPL-1608).
    expect(
      result.diagnostics.filter(
        (d) => d.code === "contains-target-not-found" && d.severity === "warning",
      ),
    ).toHaveLength(0);
  });
});

// ─── contains-target-not-groupable determination (#1983 Phase 2) ────────────
//
// The design doc proposed warning about `contains` members whose kind "never
// renders at a groupable level", with the target kind set to be DETERMINED by
// enumerating the view-extract surfaces (TPL-1720: a valid-target set
// must enumerate every kind the construct accepts). This suite IS that
// enumeration, machine-checked: for every kind `contains` can reference, the
// member renders — and is framed / foldable — at some drill level. The
// determined set is therefore EMPTY and no diagnostic is emitted (a warning
// claiming "no effect" would be false for every kind). Each member gets its
// OWN one-member boundary, so a kind silently falling out of the bucket
// cannot hide behind a frame raised by a co-resident member of another kind.
// If a future view change makes one of these cases fail — or extending
// `LogicalNodeKind` fails the `satisfies` guard below at typecheck — a kind
// has (or may have) lost its rendering level and the diagnostic decision must
// be revisited (docs/adr/1983-boundary-drilldown-grouping.md).
const EVERY_KIND_SRC = `
system Shop {
  service Orders {
    domain OrderDomain {
      usecase PlaceOrder {
        resource OrderRes
      }
      entity OrderEntity {
        table ShopDB.orders
      }
      resource DirectRes
    }
    domain ShippingDomain {}
  }
  service Billing {}
  domain TopDomain {}
  user Buyer
  client WebApp
  database ShopDB {
    table orders
  }
  queue Jobs {
    queue emailJob
  }
  storage Files {
    bucket images
  }
}

boundary fence_service { contains Orders }
boundary fence_top_domain { contains TopDomain }
boundary fence_user { contains Buyer }
boundary fence_client { contains WebApp }
boundary fence_database { contains ShopDB }
boundary fence_queue { contains Jobs }
boundary fence_storage { contains Files }
boundary fence_nested_domain { contains OrderDomain }
boundary fence_usecase { contains PlaceOrder }
boundary fence_entity { contains OrderEntity }
boundary fence_resource_domain { contains DirectRes }
boundary fence_resource_usecase { contains OrderRes }
boundary fence_table { contains orders }
boundary fence_queue_item { contains emailJob }
boundary fence_bucket { contains images }
`;

describe("every containable kind renders (framed) at some groupable level — the not-groupable set is empty", () => {
  const CASES: {
    kind: string;
    memberId: string;
    fence: string;
    viewPath: string[] | undefined;
  }[] = [
    { kind: "service", memberId: "Orders", fence: "fence_service", viewPath: undefined },
    {
      kind: "domain (top-level)",
      memberId: "TopDomain",
      fence: "fence_top_domain",
      viewPath: undefined,
    },
    { kind: "user", memberId: "Buyer", fence: "fence_user", viewPath: undefined },
    { kind: "client", memberId: "WebApp", fence: "fence_client", viewPath: undefined },
    { kind: "database", memberId: "ShopDB", fence: "fence_database", viewPath: undefined },
    { kind: "queue", memberId: "Jobs", fence: "fence_queue", viewPath: undefined },
    { kind: "storage", memberId: "Files", fence: "fence_storage", viewPath: undefined },
    {
      kind: "domain (nested)",
      memberId: "OrderDomain",
      fence: "fence_nested_domain",
      viewPath: ["Shop", "Orders"],
    },
    {
      kind: "usecase",
      memberId: "PlaceOrder",
      fence: "fence_usecase",
      viewPath: ["Shop", "Orders", "OrderDomain"],
    },
    {
      kind: "resource (domain child)",
      memberId: "DirectRes",
      fence: "fence_resource_domain",
      viewPath: ["Shop", "Orders", "OrderDomain"],
    },
    {
      kind: "resource (usecase child)",
      memberId: "OrderRes",
      fence: "fence_resource_usecase",
      viewPath: ["Shop", "Orders", "OrderDomain", "PlaceOrder"],
    },
    { kind: "table", memberId: "orders", fence: "fence_table", viewPath: ["Shop", "ShopDB"] },
    {
      kind: "queue-item",
      memberId: "emailJob",
      fence: "fence_queue_item",
      viewPath: ["Shop", "Jobs"],
    },
    { kind: "bucket", memberId: "images", fence: "fence_bucket", viewPath: ["Shop", "Files"] },
  ];

  for (const { kind, memberId, fence, viewPath } of CASES) {
    it(`${kind}: "${memberId}" renders, raises its own frame, and folds at ${viewPath ? viewPath.join("/") : "the root view"}`, () => {
      // The member's DEDICATED one-member boundary raises the frame — a
      // co-resident member of another boundary cannot fake this green.
      const svg = systemSvg(EVERY_KIND_SRC, viewPath, "boundary");
      expect(svg).toContain(`data-node-id="${memberId}"`);
      expect(svg).toContain(`data-container-id="__group_${fence}__"`);
      // Membership proof by fold: collapsing the dedicated boundary makes
      // exactly this member disappear into its stub.
      const collapsed = systemSvg(EVERY_KIND_SRC, viewPath, "boundary", new Set([fence]));
      expect(collapsed).not.toContain(`data-node-id="${memberId}"`);
      expect(collapsed).toContain(`data-node-id="__group_collapsed_${fence}__"`);
    });
  }

  it('entity: "OrderEntity" renders and raises its own frame in the entity view', () => {
    const krsFile = Parser.parse(EVERY_KIND_SRC).value;
    const result = renderEntityView(
      krsFile,
      ["Shop", "Orders", "OrderDomain"],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "boundary",
    );
    expect(result.hasContent).toBe(true);
    expect(result.svg).toContain('data-node-id="OrderEntity"');
    // The entity view draws frames only (no collapse surface — ADR-1821),
    // so the dedicated-boundary frame is the membership proof here.
    expect(result.svg).toContain('data-container-id="__group_fence_entity__"');
  });

  it("the enumeration covers every containable kind (sync guard, TPL-1720)", () => {
    // Type-level exhaustiveness: extending `LogicalNodeKind` fails typecheck
    // on this `satisfies`, forcing the enumeration above (and the ∅
    // determination) to be revisited. The runtime walk below is the second
    // half of the guard: it fails if the fixture stops DECLARING one of the
    // expected kinds (e.g. a syntax change reinterprets a declaration).
    const EXPECTED_CONTAINABLE = {
      service: 0,
      domain: 0,
      usecase: 0,
      entity: 0,
      resource: 0,
      user: 0,
      client: 0,
      database: 0,
      queue: 0,
      storage: 0,
      table: 0,
      "queue-item": 0,
      bucket: 0,
    } satisfies Record<Exclude<LogicalNodeKind, "system">, unknown>;

    const parsed = Parser.parse(EVERY_KIND_SRC).value;
    const kinds = new Set<string>();
    const walk = (nodes: readonly { kind: string; children: readonly unknown[] }[]): void => {
      for (const n of nodes) {
        kinds.add(n.kind);
        walk(n.children as { kind: string; children: readonly unknown[] }[]);
      }
    };
    for (const system of parsed.systems) walk(system.children as never[]);
    expect([...kinds].sort()).toEqual(Object.keys(EXPECTED_CONTAINABLE).sort());
  });
});
