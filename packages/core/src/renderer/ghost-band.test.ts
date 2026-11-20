/**
 * The ghost band (#2823 slice A, #3880).
 *
 * Fixtures reach the limit the old single ghost row failed at (TPL-2598): an
 * entity view with 40+ ghosts from 8+ foreign domains, on both sides of the
 * focus frame, with every two-way case; and a service view with 40 ghost
 * domains from 8 foreign services. On the single row these canvases were a
 * long strip outside the ADR-2593 aspect band.
 */
import { describe, it, expect } from "vitest";
import { layout } from "./layout.js";
import "./shapes.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import { extractEntityView } from "../view/entity-relations.js";
import { extractView } from "../view/view-extract.js";
import { Parser } from "../parser/parser.js";
import { compile, renderEntityView } from "../compile/compile.js";
import type { ContainerRect, LayoutNode, LayoutResult } from "./layout-types.js";
import { placeGhostBand } from "./ghost-band.js";
import { measureNode, type MeasureContext } from "./layout-measure.js";
import { CONTAINER_PADDING, getLayoutConstants } from "./layout-constants.js";
import type { ViewSlice } from "../view/view-slice.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const HUB = ["E0", "E1", "E2", "E3", "E4"];
/** Foreign domains that only reference the hub (incoming: band above). */
const INCOMING = ["Billing", "Audit", "Marketing", "Support", "Search"];
/** Foreign domains the hub only references (outgoing: band below). */
const OUTGOING = ["Catalog", "Customers", "Shipping", "Pricing", "Storage"];
const PER_DOMAIN = 4;

/**
 * `Shop.Core.Hub` is the focus. Besides the ten one-way domains:
 * - `TwoWay.In` has 2 incoming / 1 outgoing (above), `TwoWay.Out` 1 / 2
 *   (below), `TwoWay.Tie` 1 / 1, a mutual pair (below on the tie).
 * - `Lone.Up` / `Lone.Down`: one ghost per side, so no frame on either side.
 * - `Both` has two ghosts per side: a frame above and a frame below.
 */
function entityFixture(): string {
  const hubEntities = HUB.map((e, i) => {
    const local = i + 1 < HUB.length ? [`${e} -> ${HUB[i + 1]} "next"`] : [];
    const out = OUTGOING.flatMap((d, di) =>
      Array.from({ length: PER_DOMAIN }, (_, k) => k)
        .filter((k) => (di * PER_DOMAIN + k) % HUB.length === i)
        .map((k) => `${e} -> ${d}.${d}${k} "uses"`),
    );
    const extra: Record<string, string[]> = {
      E0: [`E0 -> TwoWay.Out "a"`],
      E1: [`E1 -> TwoWay.Out "b"`],
      E2: [`E2 -> TwoWay.In "c"`],
      E3: [`E3 -> TwoWay.Tie "d"`],
      E4: [`E4 -> Lone.Down "e"`, `E4 -> Both.Down0 "f"`, `E4 -> Both.Down1 "g"`],
    };
    return `      entity ${e} {\n${[...local, ...out, ...(extra[e] ?? [])].map((l) => `        ${l}`).join("\n")}\n      }`;
  });
  const foreign = (d: string, body: (k: number) => string) =>
    `    domain ${d} {\n${Array.from({ length: PER_DOMAIN }, (_, k) => `      entity ${d}${k} {${body(k)}}`).join("\n")}\n    }`;
  const incoming = INCOMING.map((d, di) =>
    foreign(d, (k) => ` ${d}${k} -> Hub.${HUB[(di * PER_DOMAIN + k) % HUB.length]} "refs" `),
  );
  const outgoing = OUTGOING.map((d) => foreign(d, () => ""));
  return `system Shop {
  service Core {
    domain Hub {
${hubEntities.join("\n")}
    }
  }
  service Others {
${[...incoming, ...outgoing].join("\n")}
    domain TwoWay {
      entity In {
        In -> Hub.E0 "x"
        In -> Hub.E1 "y"
      }
      entity Out {
        Out -> Hub.E2 "z"
      }
      entity Tie {
        Tie -> Hub.E3 "w"
      }
    }
    domain Lone {
      entity Up {
        Up -> Hub.E4 "u"
      }
      entity Down {}
    }
    domain Both {
      entity Up0 {
        Up0 -> Hub.E0 "p"
      }
      entity Up1 {
        Up1 -> Hub.E1 "q"
      }
      entity Down0 {}
      entity Down1 {}
    }
  }
}`;
}

const SERVICES = [
  "Billing",
  "Audit",
  "Marketing",
  "Support",
  "Catalog",
  "Customers",
  "Shipping",
  "Pricing",
];
const DOMAINS_PER_SERVICE = 5;

/** `Shop.Core` is the focus; the first four services reference it, it references the last four. */
function serviceFixture(): string {
  const services = SERVICES.map((s, si) => {
    const domains = Array.from({ length: DOMAINS_PER_SERVICE }, (_, k) =>
      si < 4
        ? `    domain ${s}${k} {\n      -> ${k % 2 === 0 ? "Hub" : "Aux"}\n    }`
        : `    domain ${s}${k} {}`,
    );
    return `  service ${s} {\n${domains.join("\n")}\n  }`;
  });
  const outgoing = SERVICES.slice(4).flatMap((s) =>
    Array.from({ length: DOMAINS_PER_SERVICE }, (_, k) => `      -> ${s}${k}`),
  );
  return `system Shop {
  service Core {
    domain Hub {
${outgoing.join("\n")}
    }
    domain Aux {
      -> Hub
    }
  }
${services.join("\n")}
}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function layoutOf(
  src: string,
  extract: (systems: ReturnType<typeof parse>["systems"]) => ViewSlice,
) {
  const krsFile = parse(src);
  const styles = resolveStyles(krsFile.systems, [getBuiltinStyleSheet()]);
  const slice = extract(krsFile.systems);
  const result = layout(slice, {
    ownerIndex: krsFile.ownerIndex,
    shapeForNode: (id) => {
      const style = styles.nodes.get(id) ?? styles.defaultNodeStyle;
      return typeof style.shape === "string" ? style.shape : style.shape.url;
    },
  });
  return { slice, result };
}

function parse(src: string) {
  const parsed = Parser.parse(src);
  expect(parsed.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return parsed.value;
}

/** Width / height of the drawn SVG — what the reader sees, chrome included. */
function aspectOf(svg: string): number {
  const m = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg);
  expect(m).not.toBeNull();
  return Number(m![1]) / Number(m![2]);
}

type Rect = { x: number; y: number; width: number; height: number };
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (r: Rect, outer: Rect) =>
  r.x >= outer.x &&
  r.y >= outer.y &&
  r.x + r.width <= outer.x + outer.width &&
  r.y + r.height <= outer.y + outer.height;

const bandFrames = (res: LayoutResult) => res.containers.filter((c) => c.ghostBand !== undefined);
const ghostCards = (res: LayoutResult, keys: Iterable<string>) =>
  [...keys].map((k) => res.nodes.get(k)).filter((n): n is LayoutNode => n !== undefined);
const focusOf = (res: LayoutResult) => res.containers.find((c) => !c.ghost)!;
const sideOf = (res: LayoutResult, n: Rect): "above" | "below" =>
  n.y + n.height <= focusOf(res).y ? "above" : "below";

/**
 * The band's boxes (frames and lone cards) per side, in placement order: the
 * row facing the focus first, each row left to right.
 */
function boxesInOrder(res: LayoutResult, ghostKeys: readonly string[]) {
  const frames = bandFrames(res);
  const cards = ghostCards(res, ghostKeys);
  const lone = cards.filter((n) => !frames.some((f) => inside(n, f)));
  const boxes: { rect: Rect; members: LayoutNode[] }[] = [
    ...frames.map((f) => ({ rect: f as Rect, members: cards.filter((n) => inside(n, f)) })),
    ...lone.map((n) => ({ rect: n as Rect, members: [n] })),
  ];
  const result: Record<"above" | "below", typeof boxes> = { above: [], below: [] };
  for (const side of ["above", "below"] as const) {
    // A row shares its facing edge: tops below the focus, bottoms above it.
    const edge = (r: Rect) => (side === "below" ? r.y : -(r.y + r.height));
    result[side] = boxes
      .filter((b) => sideOf(res, b.rect) === side)
      .sort((a, b) => edge(a.rect) - edge(b.rect) || a.rect.x - b.rect.x);
  }
  return result;
}

/** Mean centre x of the local cards a set of ghosts is related to. */
function partnerX(res: LayoutResult, slice: ViewSlice, members: readonly LayoutNode[]): number {
  const ids = new Set(members.map((m) => m.id));
  const xs: number[] = [];
  for (const e of res.edges) {
    const partner = ids.has(e.from) ? e.to : ids.has(e.to) ? e.from : undefined;
    const node = partner !== undefined ? res.nodes.get(partner) : undefined;
    if (node && !node.ghost) xs.push(node.x + node.width / 2);
  }
  expect(
    xs.length,
    `relations of ${[...ids].join(",")} in ${slice.containerNode?.id}`,
  ).toBeGreaterThan(0);
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// ─── Entity view ─────────────────────────────────────────────────────────────

describe("ghost band on the entity view (#2823)", () => {
  const src = entityFixture();
  const path = ["Shop", "Core", "Hub"];
  const { slice, result: res } = layoutOf(src, (systems) => extractEntityView(systems, path));
  const ghostKeys = slice.ghostEntities.map((g) => g.key);
  const node = (key: string) => res.nodes.get(key)!;
  const frameHolding = (key: string) => bandFrames(res).find((f) => inside(node(key), f));

  it("reaches the limit: 40+ ghosts from 8+ foreign domains", () => {
    expect(slice.ghostEntities.length).toBeGreaterThanOrEqual(40);
    expect(new Set(slice.ghostEntities.map((g) => g.parentDomainId)).size).toBeGreaterThanOrEqual(
      8,
    );
  });

  it("keeps the canvas inside the 16:9 to 9:16 aspect band", () => {
    const aspect = aspectOf(renderEntityView(src, path).svg);
    expect(aspect).toBeLessThanOrEqual(16 / 9);
    expect(aspect).toBeGreaterThanOrEqual(9 / 16);
  });

  it("puts what references the focus above it and what it references below", () => {
    for (const d of INCOMING)
      for (let k = 0; k < PER_DOMAIN; k++) expect(sideOf(res, node(`${d}.${d}${k}`))).toBe("above");
    for (const d of OUTGOING)
      for (let k = 0; k < PER_DOMAIN; k++) expect(sideOf(res, node(`${d}.${d}${k}`))).toBe("below");
  });

  it("places a two-way ghost by its majority direction, a tie below", () => {
    expect(sideOf(res, node("TwoWay.In"))).toBe("above");
    expect(sideOf(res, node("TwoWay.Out"))).toBe("below");
    expect(sideOf(res, node("TwoWay.Tie"))).toBe("below");
  });

  it("frames each foreign domain's ghosts on a side, titled with the domain, cards without a sub-label", () => {
    for (const d of [...INCOMING, ...OUTGOING]) {
      const frame = frameHolding(`${d}.${d}0`);
      expect(frame?.label).toBe(d);
      for (let k = 0; k < PER_DOMAIN; k++) {
        expect(frameHolding(`${d}.${d}${k}`)).toBe(frame);
        expect(node(`${d}.${d}${k}`).subLabel).toBeUndefined();
      }
    }
    expect(frameHolding("TwoWay.Out")).toBe(frameHolding("TwoWay.Tie"));
  });

  it("leaves a ghost alone on its (domain × side) as a sub-labelled card", () => {
    for (const key of ["TwoWay.In", "Lone.Up", "Lone.Down"]) {
      expect(frameHolding(key)).toBeUndefined();
      expect(node(key).subLabel).toBe(key.split(".")[0]);
    }
    expect(sideOf(res, node("Lone.Up"))).toBe("above");
    expect(sideOf(res, node("Lone.Down"))).toBe("below");
  });

  it("gives a domain framed on both sides two frames with distinct ids", () => {
    const up = frameHolding("Both.Up0");
    const down = frameHolding("Both.Down0");
    expect(up?.ghostBand).toBe("above");
    expect(down?.ghostBand).toBe("below");
    expect(up?.id).not.toBe(down?.id);
    expect(new Set(bandFrames(res).map((f) => f.id)).size).toBe(bandFrames(res).length);
  });

  it("draws band frames as ghost frames that are no node", () => {
    // 5 incoming + 5 outgoing domains, TwoWay below, Both above and below.
    expect(bandFrames(res)).toHaveLength(13);
    for (const f of bandFrames(res)) {
      expect(f.ghost).toBe(true);
      expect(f.path).toBeUndefined();
    }
  });

  it("marks each band frame in the SVG with its side, and no ghost ancestor frame", () => {
    const svg = renderEntityView(src, path).svg;
    const marked = [
      ...svg.matchAll(/data-container-id="([^"]+)"[^>]*data-ghost-band="(above|below)"/g),
    ];
    expect(marked.map((m) => [m[1], m[2]]).sort()).toEqual(
      bandFrames(res)
        .map((f) => [f.id, f.ghostBand])
        .sort(),
    );
  });

  it("overlaps no frame or card it does not hold", () => {
    const frames = bandFrames(res);
    expect(frames.length).toBeGreaterThan(0);
    const others: ContainerRect[] = res.containers.filter(
      (c) => c.ghostBand === undefined && c !== res.containers[0],
    );
    const clashes = frames.flatMap((f) => [
      ...frames.filter((g) => g !== f && overlaps(f, g)).map((g) => `${f.id} / ${g.id}`),
      ...others.filter((c) => overlaps(f, c)).map((c) => `${f.id} / ${c.id}`),
      ...[...res.nodes.values()]
        .filter((n) => !inside(n, f) && overlaps(f, n))
        .map((n) => `${f.id} / ${n.id}`),
      ...(inside(f, res.containers[0]) ? [] : [`${f.id} outside the outermost frame`]),
    ]);
    expect(clashes).toEqual([]);
  });

  it("orders frames and lone cards by their partners' x, row by row from the focus", () => {
    const boxes = boxesInOrder(res, ghostKeys);
    // Frames: 5 incoming + Both above; 5 outgoing + TwoWay + Both below. Lone
    // cards: TwoWay.In and Lone.Up above, Lone.Down below.
    expect(boxes.above.filter((b) => b.members.length > 1)).toHaveLength(6);
    expect(boxes.below.filter((b) => b.members.length > 1)).toHaveLength(7);
    const xsOf = (side: "above" | "below") =>
      boxes[side].map((b) => partnerX(res, slice, b.members));
    const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
    expect({ above: xsOf("above"), below: xsOf("below") }).toEqual({
      above: sorted(xsOf("above")),
      below: sorted(xsOf("below")),
    });
  });

  it("orders the cards inside a frame by their partners' x", () => {
    expect(bandFrames(res).length).toBeGreaterThan(0);
    const xsIn = (f: ContainerRect) =>
      ghostCards(res, ghostKeys)
        .filter((n) => inside(n, f))
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((n) => partnerX(res, slice, [n]));
    const frames = bandFrames(res);
    expect(frames.map((f) => [f.id, xsIn(f)])).toEqual(
      frames.map((f) => [f.id, [...xsIn(f)].sort((a, b) => a - b)]),
    );
  });
});

// ─── Service view ────────────────────────────────────────────────────────────

describe("ghost band on the service view (#2823)", () => {
  const src = serviceFixture();
  const path = ["Shop", "Core"];
  const { slice, result: res } = layoutOf(src, (systems) => extractView(systems, path));

  it("reaches the limit: 40 ghost domains from 8 foreign services", () => {
    expect(slice.ghostDomains).toHaveLength(SERVICES.length * DOMAINS_PER_SERVICE);
  });

  it("keeps the canvas inside the 16:9 to 9:16 aspect band", () => {
    const aspect = aspectOf(compile(src, { viewPath: path }).svg);
    expect(aspect).toBeLessThanOrEqual(16 / 9);
    expect(aspect).toBeGreaterThanOrEqual(9 / 16);
  });

  it("frames ghost domains per foreign service, callers above and callees below", () => {
    const seen = SERVICES.map((s) => {
      const frame = bandFrames(res).find((f) => f.label === s);
      const cards = Array.from({ length: DOMAINS_PER_SERVICE }, (_, k) =>
        res.nodes.get(`${s}${k}`)!,
      );
      return {
        s,
        side: frame?.ghostBand,
        inFrame: cards.every((c) => frame !== undefined && inside(c, frame)),
        subLabels: cards.filter((c) => c.subLabel !== undefined).length,
      };
    });
    expect(seen).toEqual(
      SERVICES.map((s, si) => ({
        s,
        side: si < 4 ? "above" : "below",
        inFrame: true,
        subLabels: 0,
      })),
    );
  });
});

// ─── Ghost systems beside a band ─────────────────────────────────────────────

describe("ghost systems stay level with the focus when the upper band grows the frame (#2823)", () => {
  // `Shop.Core` has an upper band (`In1` references it), a lower band (it
  // references `Out1`), an outgoing ghost system (`Ext.Api`) and a caller ghost
  // system (`Ext.Caller`). The ghost systems are placed after the band; anchored
  // at the outermost frame's top, they would follow it above the upper band.
  const domains = (prefix: string, body: string) =>
    Array.from({ length: 12 }, (_, i) => `    domain ${prefix}${i} {${body}}`).join("\n");
  const src = `system Shop {
  service Core {
    -> Ext.Api
    domain Hub {
${Array.from({ length: 12 }, (_, i) => `      -> O${i}`).join("\n")}
    }
  }
  service In1 {
${domains("I", " -> Hub ")}
  }
  service Out1 {
${domains("O", "")}
  }
}
system Ext {
  service Api {}
  service Caller {
    -> Shop.Core
  }
}`;
  const { slice, result: res } = layoutOf(src, (systems) => extractView(systems, ["Shop", "Core"]));
  const systemFrames = res.containers.filter((c) => c.id === "Ext");
  const above = bandFrames(res).filter((f) => f.ghostBand === "above");

  it("has an upper band and both kinds of ghost system", () => {
    expect(slice.ghostSystems).toHaveLength(1);
    expect(slice.callerGhostSystems).toHaveLength(1);
    expect(systemFrames).toHaveLength(2);
    expect(above.length).toBeGreaterThan(0);
  });

  it("starts each ghost system frame below the upper band, clear of every band frame", () => {
    const bandBottom = Math.max(...above.map((f) => f.y + f.height));
    const clashes = systemFrames.flatMap((s) => [
      ...(s.y > bandBottom ? [] : [`${s.id}@${s.x} starts at ${s.y}, band ends at ${bandBottom}`]),
      ...bandFrames(res)
        .filter((f) => overlaps(s, f))
        .map((f) => `${s.id}@${s.x} / ${f.id}`),
    ]);
    expect(clashes).toEqual([]);
  });
});

// ─── A frame inside the band's width ─────────────────────────────────────────

describe("a band frame takes no more columns than the band's width holds (#2823)", () => {
  const krsFile = parse(`system S {
  service A {
    domain D {
      entity E0 {}
      entity E1 {}
    }
  }
}`);
  const domain = krsFile.systems[0].children[0].children[0];
  const [e0, e1] = domain.children;
  const ctx: MeasureContext = {
    displayMode: undefined,
    shapeForNode: undefined,
    effectiveAnnotations: (n) => n.annotations,
    drawnLabel: (n) => n.label ?? n.id,
  };
  const { NODE_GAP } = getLayoutConstants(undefined);
  const card = Math.max(
    measureNode(e0, undefined, ctx).width,
    measureNode(e1, undefined, ctx).width,
  );
  // One pixel short of the two-column frame the grid would pick for two cards.
  const limit = 2 * card + NODE_GAP + CONTAINER_PADDING * 2 - 1;
  const nodes = new Map<string, LayoutNode>();
  const containers: ContainerRect[] = [
    { id: "S", label: "S", x: -40, y: -40, width: limit + 80, height: 180, ghost: true },
    { id: "F", label: "F", x: 0, y: 0, width: limit, height: 100, ghost: false },
  ];
  const cut = placeGhostBand(
    {
      items: [e0, e1].map((node) => ({ node, key: `D.${node.id}`, groupId: "D", groupLabel: "D" })),
      edges: [],
      remap: (id) => id,
      widthBudget: 0,
    },
    nodes,
    containers,
    ctx,
  );
  const frame = containers.find((c) => c.ghostBand !== undefined)!;

  it("stacks the cards in one column and stays within the limit", () => {
    expect(frame.width).toBeLessThanOrEqual(limit);
    expect(nodes.get("D.E0")!.x).toBe(nodes.get("D.E1")!.x);
  });

  it("reports the cut, so the width-budget search tries a wider budget", () => {
    expect(cut).toBe(true);
  });
});
