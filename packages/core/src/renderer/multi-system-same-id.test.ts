import { describe, expect, it } from "vitest";
import { Parser } from "../parser/parser.js";
import { extractView } from "../view/view-extract.js";
import { diffSystemViewSlices } from "../diff/view-diff.js";
import { compile } from "../compile/compile.js";
import { nodePathRefId, parseNodePathRefId } from "../parser/node-path.js";
import { layout } from "./layout.js";
import type { LayoutNode, LayoutResult, Rect } from "./layout-types.js";

// #2917: two systems may both declare the same service id. The multi-system
// root used to merge the per-system layouts under the bare id, so the later
// system's card overwrote the earlier one's and a frame went empty. The Map is
// now keyed by (system, id); the cards keep the bare `data-node-id` and gain
// `data-node-path`, which names the one node each card stands for.
// AT-2917 AC-1 / AC-2 / AC-4 / AC-5 / AC-6.

const SAME_ID = `
system Shop {
  service Api {}
  service Worker {}
  Api -> Worker "queues"
}

system Admin {
  service Api {}
}
`;

const rootSlice = (krs: string) => {
  const parsed = Parser.parse(krs);
  return extractView(parsed.value.systems, [], parsed.value.domains);
};

const cards = (r: LayoutResult, id: string): LayoutNode[] =>
  [...r.nodes.values()].filter((n) => n.id === id);

const inside = (n: Rect, c: Rect): boolean =>
  n.x >= c.x && n.y >= c.y && n.x + n.width <= c.x + c.width && n.y + n.height <= c.y + c.height;

const frameOf = (r: LayoutResult, id: string): Rect => r.containers.find((c) => c.id === id)!;

const rootSvg = (krs: string): string => {
  const result = compile(krs, { diagramType: "system", viewPath: [] });
  if (result.diagramType !== "system") throw new Error("expected the system view");
  return result.svg;
};

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe("multi-system root draws both same-id nodes (#2917)", () => {
  it("keeps one card per system for a shared bare id, each inside its own frame", () => {
    const r = layout(rootSlice(SAME_ID));
    const apis = cards(r, "Api");
    expect(apis).toHaveLength(2);
    const shop = frameOf(r, "Shop");
    const admin = frameOf(r, "Admin");
    expect(apis.filter((n) => inside(n, shop))).toHaveLength(1);
    expect(apis.filter((n) => inside(n, admin))).toHaveLength(1);
    expect(cards(r, "Worker")).toHaveLength(1);
    // The Shop frame holds as many cards as Shop's own view does.
    const shopAlone = layout(extractView(Parser.parse(SAME_ID).value.systems, ["Shop"]));
    const inShop = [...r.nodes.values()].filter((n) => inside(n, shop));
    expect(inShop).toHaveLength(shopAlone.nodes.size);
  });

  it("starts Shop's edge on Shop's Api, not on Admin's", () => {
    const r = layout(rootSlice(SAME_ID));
    const shop = frameOf(r, "Shop");
    const shopApi = cards(r, "Api").find((n) => inside(n, shop))!;
    const edge = r.edges.find((e) => e.from === "Api" && e.to === "Worker")!;
    expect(edge).toBeDefined();
    // The start point lies on Shop's Api rectangle (its border, within a pixel).
    const p = edge.fromPoint;
    const onRect =
      p.x >= shopApi.x - 1 &&
      p.x <= shopApi.x + shopApi.width + 1 &&
      p.y >= shopApi.y - 1 &&
      p.y <= shopApi.y + shopApi.height + 1;
    expect(onRect).toBe(true);
  });

  it("emits data-node-id twice and a distinct data-node-path per card", () => {
    const svg = rootSvg(SAME_ID);
    expect(count(svg, /data-node-id="Api"/g)).toBe(2);
    expect(count(svg, /data-node-id="Worker"/g)).toBe(1);
    expect(svg).toContain('data-node-path="Shop.Api"');
    expect(svg).toContain('data-node-path="Admin.Api"');
    expect(svg).toContain('data-node-path="Shop.Worker"');
  });

  it("does not key the emitted id by the scoped Map key", () => {
    const svg = rootSvg(SAME_ID);
    expect(svg).not.toContain('data-node-id="[');
    expect(svg).not.toContain("Shop::Api");
  });
});

describe("data-node-path carries the nodePathRefId form on every logical canvas (#2917)", () => {
  it("quotes a segment that would make the join ambiguous, and round-trips", () => {
    const svg = rootSvg(`
system Weird {
  service "www.example.com" {}
}
system Other {
  service Plain {}
}
`);
    const attr = /data-node-path="([^"]*)"/g;
    const values = [...svg.matchAll(attr)].map((m) => m[1].replace(/&quot;/g, '"'));
    expect(values).toContain(nodePathRefId(["Weird", "www.example.com"]));
    expect(values).toContain("Other.Plain");
    for (const v of values) {
      const path = parseNodePathRefId(v);
      expect(nodePathRefId(path)).toBe(v);
    }
    expect(parseNodePathRefId(nodePathRefId(["Weird", "www.example.com"]))).toEqual([
      "Weird",
      "www.example.com",
    ]);
  });

  it("is present on a single-system view and on a drilled level, scoped by the canvas", () => {
    const krs = `
system Shop {
  service Api {
    domain Orders {}
  }
}
`;
    const root = compile(krs, { diagramType: "system", viewPath: [] });
    const level = compile(krs, { diagramType: "system", viewPath: ["Shop", "Api"] });
    if (root.diagramType !== "system" || level.diagramType !== "system") throw new Error();
    expect(root.svg).toContain('data-node-path="Shop.Api"');
    expect(level.svg).toContain('data-node-path="Shop.Api.Orders"');
  });

  it("is keyed into nodeMetadataByPath with the exact viewPath of that node", () => {
    const result = compile(SAME_ID, { diagramType: "system", viewPath: [] });
    if (result.diagramType !== "system") throw new Error();
    expect(result.nodeMetadataByPath.get("Shop.Api")?.viewPath).toEqual(["Shop", "Api"]);
    expect(result.nodeMetadataByPath.get("Admin.Api")?.viewPath).toEqual(["Admin", "Api"]);
    // The bare-id map keeps holding one of the two (the later write), unchanged.
    expect(result.nodeMetadata.get("Api")).toBeDefined();
  });
});

describe("per-system lookups on the root (#2917)", () => {
  it("does not bundle two systems' same-named parallel edges together", () => {
    const r = layout(
      rootSlice(`
system Shop {
  service Api {}
  service Worker {}
  Api -> Worker "queues"
}
system Admin {
  service Api {}
  service Worker {}
  Api -> Worker "queues"
}
`),
    );
    const edges = r.edges.filter((e) => e.from === "Api" && e.to === "Worker");
    expect(edges).toHaveLength(2);
    for (const e of edges) expect(e.bundleSize).toBeUndefined();
  });

  it("still bundles parallel edges declared within one system", () => {
    const r = layout(
      rootSlice(`
system Shop {
  service Api {}
  service Worker {}
  Api -> Worker "queues"
  Api -> Worker "retries"
}
system Admin {
  service Api {}
}
`),
    );
    const edges = r.edges.filter((e) => e.from === "Api" && e.to === "Worker");
    expect(edges).toHaveLength(2);
    for (const e of edges) expect(e.bundleSize).toBe(2);
  });

  it("places each system's same-named external on its own frame's side", () => {
    const r = layout(
      rootSlice(`
system Shop {
  service Api {}
  service Stripe [external] {}
  Api -> Stripe
}
system Admin {
  service Api {}
  service Stripe [external] {}
  Api -> Stripe
}
`),
    );
    const shop = frameOf(r, "Shop");
    const admin = frameOf(r, "Admin");
    const stripes = cards(r, "Stripe");
    expect(stripes).toHaveLength(2);
    // Frames do not overlap, and each frame's horizontal span holds exactly one Stripe.
    const spanHolds = (c: Rect, n: LayoutNode) => n.x >= c.x && n.x + n.width <= c.x + c.width;
    expect(stripes.filter((n) => spanHolds(shop, n))).toHaveLength(1);
    expect(stripes.filter((n) => spanHolds(admin, n))).toHaveLength(1);
  });

  it("anchors a cross-system edge on the right two cards", () => {
    const r = layout(
      rootSlice(`
system Shop {
  service Api {}
  Api -> Admin.Api "syncs"
}
system Admin {
  service Api {}
}
`),
    );
    const shop = frameOf(r, "Shop");
    const admin = frameOf(r, "Admin");
    const shopApi = cards(r, "Api").find((n) => inside(n, shop))!;
    const adminApi = cards(r, "Api").find((n) => inside(n, admin))!;
    const edge = r.edges.find((e) => e.to === "Admin.Api")!;
    expect(edge).toBeDefined();
    expect(edge.fromPoint.x).toBeCloseTo(shopApi.x + shopApi.width);
    expect(edge.fromPoint.y).toBeCloseTo(shopApi.y + shopApi.height / 2);
    expect(edge.toPoint.x).toBeCloseTo(adminApi.x);
    expect(edge.toPoint.y).toBeCloseTo(adminApi.y + adminApi.height / 2);
  });

  it("keeps drawing a compare-mode removed cross-system edge whose bare source is unique", () => {
    const before = rootSlice(`
system Shop {
  service Worker {}
  Worker -> Admin.Api
}
system Admin {
  service Api {}
}
`);
    const after = rootSlice(`
system Shop {
  service Worker {}
}
system Admin {
  service Api {}
}
`);
    const merged = diffSystemViewSlices(before, after);
    const r = layout(merged.slice);
    expect(r.edges.map((e) => `${e.from}->${e.to}`)).toContain("Worker->Admin.Api");
  });
});

describe("review follow-ups (#2917)", () => {
  it("keeps both systems' retargeted edges to one collapsed stub", () => {
    const r = layout(
      rootSlice(`
system Shop {
  service Api {}
  Api -> Third.Db
}
system Admin {
  service Api {}
  Api -> Third.Db
}
system Third {
  database Db {}
}
`),
      { collapsedCategories: new Set<"external" | "infra">(["infra"]) },
    );
    const toStub = r.edges.filter((e) => e.to === "Third.__collapsed_Third_infra__");
    expect(toStub).toHaveLength(2);
    const shop = frameOf(r, "Shop");
    const admin = frameOf(r, "Admin");
    expect(toStub.filter((e) => e.fromPoint.x <= shop.x + shop.width + 1)).toHaveLength(1);
    expect(toStub.filter((e) => e.fromPoint.x >= admin.x - 1)).toHaveLength(1);
  });

  it("paths an in-place expanded domain under its service, in the card and in the metadata", () => {
    const krs = `
system Shop {
  service Api {
    domain Orders {}
  }
  service Worker {}
}
`;
    const result = compile(krs, {
      diagramType: "system",
      viewPath: [],
      expandedContainers: new Set(["Api"]),
    });
    if (result.diagramType !== "system") throw new Error();
    expect(result.svg).toContain('data-node-path="Shop.Api.Orders"');
    expect(result.svg).not.toContain('data-node-path="Shop.Orders"');
    expect(result.nodeMetadataByPath.get("Shop.Api.Orders")?.viewPath).toEqual([
      "Shop",
      "Api",
      "Orders",
    ]);
    expect(result.nodeMetadataByPath.has("Shop.Orders")).toBe(false);
  });

  it("omits data-node-path on ghost cards", () => {
    const result = compile(
      `
system Shop {
  service Api {
    domain Orders {}
  }
  Api -> Admin.Api
}
system Admin {
  service Api {}
}
`,
      { diagramType: "system", viewPath: ["Shop", "Api"] },
    );
    if (result.diagramType !== "system") throw new Error();
    // Admin.Api is drawn as a ghost on Shop.Api's view: qualified id, no path.
    const ghost = result.svg.match(/<g[^>]*data-node-id="Admin\.Api"[^>]*>/)?.[0] ?? "";
    expect(ghost).not.toBe("");
    expect(ghost).not.toContain("data-node-path");
    // The real domain card on the same canvas carries its full path.
    expect(result.svg).toContain('data-node-path="Shop.Api.Orders"');
  });
});
