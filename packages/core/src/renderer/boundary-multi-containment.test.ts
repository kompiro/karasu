import { describe, it, expect } from "vitest";
import {
  buildAllLayersSvg,
  buildDrillDownSvg,
  compile,
  compileSystemDiff,
  InMemoryFileSystemProvider,
} from "../index.js";
import { Parser } from "../parser/parser.js";
import { extractView } from "../view/view-extract.js";
import { layout } from "./layout.js";
import { rectUnionPath } from "./svg-renderer.js";
import { buildGroupLabelIndex, declaredGroupOrderOf } from "./group-labels.js";
import { darkPalette, lightPalette } from "./palette.js";
import type { LayoutResult } from "./layout-types.js";

// Slice B of the boundary-membership design (#2179): a node declared in more
// than one boundary is enclosed by *every* frame that can reach it, drawn once
// (TPL-1738). Where a frame cannot reach without covering a non-member, the
// membership degrades to a `◇` tab on the card.
//
// The two fixtures are the same pair the prototype measured, so a change here
// maps back to a picture: in SEATABLE the shared node sits on the seam between
// the two bands and the reach is clear; in PINNED its intra-band dependents hold
// it mid-band, so a non-member sits in the corridor and the reach must be
// refused.

/** `Ledger` is shared, and nothing inside `payments` depends on it — it seats on the seam. */
const SEATABLE = `
system Payments {
  service Checkout { label "Checkout" }
  service Wallet { label "Wallet" }
  service Ledger { label "Ledger" }
  service CardVault { label "Card vault" }

  Checkout -> Wallet "debit"
  Ledger -> CardVault "tokenize"
}

boundary payments {
  label "Payments"
  contains Checkout
  contains Wallet
  contains Ledger
}

boundary pci {
  label "PCI scope"
  contains Ledger
  contains CardVault
}
`;

/** `Ledger` is pinned mid-band by `Ledger -> Wallet`, so `Wallet` blocks the corridor. */
const PINNED = `
system Payments {
  service Checkout { label "Checkout" }
  service Ledger { label "Ledger" }
  service Wallet { label "Wallet" }
  service CardVault { label "Card vault" }

  Checkout -> Ledger "record"
  Ledger -> Wallet "debit"
  Ledger -> CardVault "tokenize"
}

boundary payments {
  label "Payments"
  contains Checkout
  contains Ledger
  contains Wallet
}

boundary pci {
  label "PCI scope"
  contains Ledger
  contains CardVault
}
`;

/** A model with no shared members at all — the "nothing changes" control. */
const DISJOINT = `
system Payments {
  service Checkout { label "Checkout" }
  service Ledger { label "Ledger" }

  Checkout -> Ledger "record"
}

boundary payments {
  contains Checkout
}

boundary books {
  contains Ledger
}
`;

function layoutOf(src: string): LayoutResult {
  const parsed = Parser.parse(src).value;
  const slice = extractView(parsed.systems, ["Payments"]);
  return layout(slice, {
    boundaryMembership: parsed.boundaryMembership,
    declaredGroupOrder: declaredGroupOrderOf(parsed, "boundary"),
    groupLabels: buildGroupLabelIndex(parsed, "boundary"),
    groupBy: "boundary",
  });
}

function frameOf(result: LayoutResult, groupId: string) {
  const frame = result.containers.find((c) => c.group === true && c.groupId === groupId);
  // Name the missing frame in the failure rather than reporting `undefined`.
  expect(result.containers.filter((c) => c.group === true).map((c) => c.groupId)).toContain(
    groupId,
  );
  return frame!;
}

/** Does `rects` fully cover `box`? (Only ever asked of a single covering rect here.) */
function covers(
  rects: readonly { x: number; y: number; width: number; height: number }[],
  box: { x: number; y: number; width: number; height: number },
): boolean {
  return rects.some(
    (r) =>
      box.x >= r.x &&
      box.y >= r.y &&
      box.x + box.width <= r.x + r.width &&
      box.y + box.height <= r.y + r.height,
  );
}

describe("multi-containment geometry (#2179)", () => {
  it("widens a frame to enclose a shared node placed in the adjacent band", () => {
    const result = layoutOf(SEATABLE);
    const ledger = result.nodes.get("Ledger")!;
    const pci = frameOf(result, "pci");
    const payments = frameOf(result, "payments");

    // Both frames enclose the one card, which is the whole point of the slice.
    expect(covers(pci.coverage!, ledger)).toBe(true);
    expect(covers([payments], ledger)).toBe(true);
    // …and the node is still placed exactly once (TPL-1738).
    expect([...result.nodes.keys()].filter((id) => id === "Ledger")).toHaveLength(1);
  });

  it("keeps the recorded rect on the band body when a frame is widened", () => {
    // The title is drawn from the recorded rect. Growing it to the widened
    // outline drops the title onto the very card the strip wraps (measured on
    // the prototype), so the reach lives in `coverage` only.
    const result = layoutOf(SEATABLE);
    const pci = frameOf(result, "pci");
    const cardVault = result.nodes.get("CardVault")!;
    const ledger = result.nodes.get("Ledger")!;

    expect(pci.coverage!.length).toBeGreaterThan(1);
    expect(pci.coverage![0]).toEqual({
      x: pci.x,
      y: pci.y,
      width: pci.width,
      height: pci.height,
    });
    expect(covers([pci], cardVault)).toBe(true);
    expect(covers([pci], ledger)).toBe(false);
  });

  it("refuses the reach when a non-member sits in the corridor, and tabs it instead", () => {
    const result = layoutOf(PINNED);
    const pci = frameOf(result, "pci");
    const ledger = result.nodes.get("Ledger")!;

    expect(pci.coverage).toBeUndefined();
    expect(ledger.degradedBoundaries).toEqual([{ id: "pci", label: "PCI scope", hueIndex: 1 }]);
    expect(result.degradedMemberships).toEqual([{ nodeId: "Ledger", boundaryId: "pci" }]);
  });

  it("refuses a strip that would float beside the body instead of joining it", () => {
    // Every row is centred independently against the widest row, so a shared
    // member can land in a different x-column from the boundary's own band. The
    // vertical checks pass and the corridor is empty, but the strip is a second
    // island: `rectUnionPath` refuses a coverage set with a gap along x, so
    // without this gate the outline silently fell back to the plain body rect —
    // no widened frame drawn AND no tab, because the reach had "succeeded".
    const src = `
system Payments {
  service Root { label "Root" }
  service Ledger { label "Ledger" }
  service B2 { label "B2" }
  service B3 { label "B3" }
  service B4 { label "B4" }
  service B5 { label "B5" }
  service CardVault { label "Card vault" }

  Root -> Ledger "a"
  Root -> B2 "b"
  Root -> B3 "c"
  Root -> B4 "d"
  Root -> B5 "e"
  Ledger -> CardVault "tokenize"
}

boundary payments {
  label "Payments"
  contains Root
  contains Ledger
  contains B2
  contains B3
  contains B4
  contains B5
}

boundary pci {
  label "PCI scope"
  contains Ledger
  contains CardVault
}
`;
    const result = layoutOf(src);
    const pci = frameOf(result, "pci");
    const ledger = result.nodes.get("Ledger")!;

    // The fixture must actually put the two in different x-columns, or this
    // case stops testing what it is named for.
    const bodyRight = pci.x + pci.width;
    const cardRight = ledger.x + ledger.width;
    const joint = Math.min(cardRight, bodyRight) - Math.max(ledger.x, pci.x);
    expect(joint).toBeLessThan(0);

    // Refused, so the membership takes the path the spec promises instead.
    expect(pci.coverage).toBeUndefined();
    expect(ledger.degradedBoundaries?.map((t) => t.id)).toEqual(["pci"]);
    expect(result.degradedMemberships).toContainEqual({
      nodeId: "Ledger",
      boundaryId: "pci",
    });
  });

  it("never records coverage that rectUnionPath would refuse to trace", () => {
    // The general form of the case above: whatever a frame records as covered
    // has to be drawable as one outline, or the drawing and the geometry the
    // routing and containment checks read would disagree.
    for (const src of [SEATABLE, PINNED]) {
      const result = layoutOf(src);
      for (const container of result.containers) {
        if (!container.coverage) continue;
        expect(rectUnionPath(container.coverage)).not.toBeNull();
      }
    }
  });

  it("leaves a model with no shared members exactly as it was", () => {
    const result = layoutOf(DISJOINT);
    for (const container of result.containers) {
      expect(container.coverage).toBeUndefined();
    }
    for (const node of result.nodes.values()) {
      expect(node.degradedBoundaries).toBeUndefined();
    }
    expect(result.degradedMemberships).toBeUndefined();
  });

  it("gives team frames no hue and no reach", () => {
    // ADR-1858's frames stay monochrome rects: the team axis is 1:1, so there is
    // no second frame for one to overlap with.
    const src = `
organization Org {
  team Platform { owns Checkout }
  team Money { owns Ledger }
}
system Payments {
  service Checkout { label "Checkout" }
  service Ledger { label "Ledger" }
  Checkout -> Ledger "record"
}
`;
    const parsed = Parser.parse(src).value;
    const slice = extractView(parsed.systems, ["Payments"]);
    const result = layout(slice, {
      ownerIndex: new Map([
        ["Checkout", "Platform"],
        ["Ledger", "Money"],
      ]),
      declaredGroupOrder: declaredGroupOrderOf(parsed, "team"),
      groupBy: "team",
    });
    const frames = result.containers.filter((c) => c.group === true);
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(frame.hueIndex).toBeUndefined();
      expect(frame.coverage).toBeUndefined();
    }
  });
});

describe("per-boundary hue (#2179)", () => {
  it("indexes the hue by declaration order, not band order", () => {
    // Band order is the min-feedback-arc-set stack and moves with the model; the
    // hue must not, or a boundary changes colour when an unrelated edge is added.
    const result = layoutOf(SEATABLE);
    expect(frameOf(result, "payments").hueIndex).toBe(0);
    expect(frameOf(result, "pci").hueIndex).toBe(1);
  });

  it("colours the frame stroke, its fill and its title from the same hue", () => {
    const compiled = compile(SEATABLE, { diagramType: "system", groupBy: "boundary" });
    if (compiled.diagramType !== "system") throw new Error("expected system view");
    const hue = darkPalette.boundaryHues[1];
    const frame = compiled.svg.slice(
      compiled.svg.indexOf('data-container-id="__group_pci__"'),
      compiled.svg.indexOf('data-container-id="__group_pci__"') + 900,
    );
    // Stroke, tint and title all carry it — without the title the colour ↔
    // boundary mapping cannot be recovered from the diagram.
    expect(frame).toContain(`stroke="${hue}"`);
    expect(frame).toContain(`fill="${hue}"`);
    expect(frame).toContain("fill-opacity=");
    expect(frame).toContain("PCI scope");
  });

  it("offers as many hues in light theme as in dark, so a model keeps its assignment", () => {
    expect(lightPalette.boundaryHues).toHaveLength(darkPalette.boundaryHues.length);
    expect(new Set(lightPalette.boundaryHues).size).toBe(lightPalette.boundaryHues.length);
    expect(new Set(darkPalette.boundaryHues).size).toBe(darkPalette.boundaryHues.length);
  });
});

describe("縮退 tab rendering (#2179)", () => {
  it("draws a ◇ tab naming the boundary that could not reach the card", () => {
    const compiled = compile(PINNED, { diagramType: "system", groupBy: "boundary" });
    if (compiled.diagramType !== "system") throw new Error("expected system view");
    expect(compiled.svg).toContain("◇ PCI scope");
  });

  it("reports the degraded membership as an info diagnostic", () => {
    const compiled = compile(PINNED, { diagramType: "system", groupBy: "boundary" });
    if (compiled.diagramType !== "system") throw new Error("expected system view");
    const found = compiled.diagnostics.filter((d) => d.code === "boundary-membership-not-drawn");
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe("info");
    expect(found[0].params).toEqual({ nodeId: "Ledger", boundaryId: "pci" });
  });

  it("keeps every tab inside the card it hangs off, however long the labels", () => {
    // Boundary labels are author-written, and `charDisplayWidth` counts CJK at
    // 1.5×, so an unmeasured pill overflows its own border and a stack of them
    // walks off the card's left edge.
    const src = `
system Payments {
  service Checkout { label "Checkout" }
  service Ledger { label "L" }
  service Wallet { label "Wallet" }
  service CardVault { label "Card vault" }
  service Fraud { label "Fraud" }

  Checkout -> Ledger "record"
  Ledger -> Wallet "debit"
  Ledger -> CardVault "tokenize"
  Ledger -> Fraud "score"
}

boundary payments {
  label "Payments"
  contains Checkout
  contains Ledger
  contains Wallet
}

boundary pci {
  label "PCI 決済カード情報保護スコープ（監査対象）"
  contains Ledger
  contains CardVault
}

boundary risk {
  label "Risk and fraud scoring perimeter, reviewed quarterly"
  contains Ledger
  contains Fraud
}
`;
    const result = layoutOf(src);
    const ledger = result.nodes.get("Ledger")!;
    expect(ledger.degradedBoundaries?.length).toBeGreaterThan(0);

    const compiled = compile(src, { diagramType: "system", groupBy: "boundary" });
    if (compiled.diagramType !== "system") throw new Error("expected system view");
    // Every dashed pill on the card's bottom edge stays within the card's span.
    const pills = [
      ...compiled.svg.matchAll(/<rect x="([-\d.]+)"[^>]*width="([\d.]+)"[^>]*rx="9"/g),
    ];
    expect(pills.length).toBeGreaterThan(0);
    for (const [, xs, ws] of pills) {
      const x = Number(xs);
      expect(x).toBeGreaterThanOrEqual(ledger.x);
      expect(x + Number(ws)).toBeLessThanOrEqual(ledger.x + ledger.width);
    }
  });

  it("reports it on every surface that draws boundary frames (TPL-1983)", () => {
    // The `◇` tab comes off the layout, so it is drawn on all of these. A
    // surface that draws the fallback but leaves its diagnostics list silent is
    // exactly the split TPL-1983 rules out — the picture and the panel would
    // disagree about what happened.
    const has = (ds: readonly { code: string }[]): boolean =>
      ds.some((d) => d.code === "boundary-membership-not-drawn");

    const drill = buildDrillDownSvg(
      PINNED,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "boundary",
    );
    expect(drill.svg).toContain("◇");
    expect(has(drill.diagnostics)).toBe(true);

    const all = buildAllLayersSvg(
      PINNED,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "boundary",
    );
    expect(all.svg).toContain("◇");
    expect(has(all.diagnostics)).toBe(true);
  });

  it("reports it in compare mode too (TPL-1983)", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/before.krs", PINNED);
    await fs.writeFile("/after.krs", PINNED);
    const diff = await compileSystemDiff({
      beforeEntryPath: "/before.krs",
      afterEntryPath: "/after.krs",
      fs,
      groupBy: "boundary",
    });
    expect(diff.svg).toContain("◇");
    expect(diff.diagnostics.some((d) => d.code === "boundary-membership-not-drawn")).toBe(true);
  });

  it("states one degraded membership once, however many levels show it", () => {
    // The drill-down bundle renders every level through the same `render` call,
    // and a membership can degrade on more than one of them. One fact, one entry.
    const drill = buildDrillDownSvg(
      PINNED,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "boundary",
    );
    const reported = drill.diagnostics.filter((d) => d.code === "boundary-membership-not-drawn");
    expect(reported).toHaveLength(1);
  });

  it("says nothing on an axis that draws no boundary frames", () => {
    // The diagnostic states what *this drawing* did, so it must not leak into a
    // view that never had a boundary frame to widen.
    const compiled = compile(PINNED, { diagramType: "system" });
    if (compiled.diagramType !== "system") throw new Error("expected system view");
    expect(compiled.diagnostics.some((d) => d.code === "boundary-membership-not-drawn")).toBe(
      false,
    );
    expect(compiled.svg).not.toContain("◇");
  });
});

describe("rectUnionPath (#2179)", () => {
  const body = { x: 0, y: 100, width: 100, height: 50 };

  it("returns null for a single rect, so a plain frame stays a <rect>", () => {
    expect(rectUnionPath([body])).toBeNull();
  });

  it("traces the outline of a body with a strip reaching up", () => {
    const strip = { x: 60, y: 0, width: 30, height: 100 };
    // Slabs: 0–60 is body only, 60–90 spans both, 90–100 is body only.
    expect(rectUnionPath([body, strip])).toBe(
      "M 0 100 L 60 100 L 60 0 L 90 0 L 90 100 L 100 100 L 100 150 L 0 150 Z",
    );
  });

  it("traces a strip reaching down", () => {
    const strip = { x: 10, y: 150, width: 20, height: 40 };
    expect(rectUnionPath([body, strip])).toBe(
      "M 0 100 L 100 100 L 100 150 L 30 150 L 30 190 L 10 190 L 10 150 L 0 150 Z",
    );
  });

  it("handles two strips on opposite sides of the same body", () => {
    const up = { x: 5, y: 60, width: 20, height: 40 };
    const down = { x: 70, y: 150, width: 20, height: 30 };
    const path = rectUnionPath([body, up, down]);
    expect(path).toContain("M 0 100");
    expect(path).toContain("5 60");
    expect(path).toContain("90 180");
  });

  it("refuses a coverage set that is not one contiguous shape", () => {
    // A detached rect would otherwise be drawn as a filled span across the gap,
    // claiming rows the frame does not cover.
    const detached = { x: 0, y: 300, width: 100, height: 50 };
    expect(rectUnionPath([body, detached])).toBeNull();
    const disjointX = { x: 200, y: 100, width: 50, height: 50 };
    expect(rectUnionPath([body, disjointX])).toBeNull();
  });
});
