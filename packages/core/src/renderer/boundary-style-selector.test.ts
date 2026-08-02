import { describe, it, expect } from "vitest";
import { compile } from "../index.js";
import { StyleParser } from "../parser/style-parser.js";
import { computeSpecificity } from "../parser/style-parser.js";
import { darkPalette } from "./palette.js";

// #2234: a `.krs.style` sheet can repaint a boundary frame. The selector is
// `boundary` / `boundary#<id>`, mirroring `edge` / `edge#<id>` — a boundary is
// not a node, so a bare `#<id>` would address the node id space instead.
//
// `Ledger` is shared and pinned mid-band by `Ledger -> Wallet`, so the model
// puts a frame AND a `◇` tab on screen. Both are surfaces of one boundary, so
// both have to follow the same override; before #2234 they were resolved
// separately and only agreed because nothing could override them.
const MODEL = `
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

function svgOf(styleSource?: string): string {
  const result = compile(MODEL, { diagramType: "system", groupBy: "boundary", styleSource });
  if (result.diagramType !== "system") throw new Error("expected system view");
  return result.svg;
}

/** The `<g data-container-id="__group_<id>__">` element, up to its closing tag. */
function frameOf(svg: string, groupId: string): string {
  const marker = `data-container-id="__group_${groupId}__"`;
  // Assert on the marker rather than its index, so a failure prints what was missing.
  expect(svg).toContain(marker);
  const at = svg.indexOf(marker);
  return svg.slice(at, svg.indexOf("</g>", at));
}

describe("boundary#<id> selector (#2234)", () => {
  it("parses like edge#<id> and scores the same", () => {
    const parsed = StyleParser.parse("boundary#pci { border-color: #c0392b; }", "t");
    expect(parsed.diagnostics).toEqual([]);
    const selector = parsed.value.rules[0].selector;
    expect(selector.nodeType).toBe("boundary");
    expect(selector.boundaryId).toBe("pci");
    // 100 for the id + 1 for the kind, exactly how edge#<id> reaches 101.
    expect(parsed.value.rules[0].specificity).toBe(101);
    expect(computeSpecificity({ nodeType: "edge", edgeId: "x", tags: [], annotations: [] })).toBe(
      101,
    );
  });

  it("does not collide with the node id space", () => {
    // `#pci` addresses a node; there is no node called `pci`, so it must not
    // reach the boundary. The keyword is what selects the id space.
    const svg = svgOf("#pci { border-color: #c0392b; }");
    expect(frameOf(svg, "pci")).not.toContain("#c0392b");
  });

  it("repaints the named boundary and leaves the others cycled", () => {
    const svg = svgOf("boundary#pci { border-color: #c0392b; }");
    expect(frameOf(svg, "pci")).toContain('stroke="#c0392b"');
    // payments was not named, so it keeps hue index 0 from the declared order.
    expect(frameOf(svg, "payments")).toContain(`stroke="${darkPalette.boundaryHues[0]}"`);
  });

  it("paints the frame, its fill and its title from one declaration", () => {
    // #2179 made one colour per boundary a legibility condition, so
    // `border-color` alone must not split a boundary across two colours.
    const frame = frameOf(svgOf("boundary#pci { border-color: #c0392b; }"), "pci");
    expect(frame).toContain('stroke="#c0392b"');
    expect(frame).toContain('fill="#c0392b"');
    expect(frame).toContain("PCI scope");
    expect(frame.match(/#c0392b/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("lets background-color and color break them apart on purpose", () => {
    const frame = frameOf(
      svgOf("boundary#pci { border-color: #c0392b; background-color: #123456; color: #abcdef; }"),
      "pci",
    );
    expect(frame).toContain('stroke="#c0392b"');
    expect(frame).toContain('fill="#123456"');
    expect(frame).toContain('fill="#abcdef"');
  });

  it("paints the ◇ tab with the same colour as its frame", () => {
    // The tab and the frame are two surfaces of one boundary. They are drawn by
    // different functions, so this is the case that regresses if the colour is
    // ever resolved twice (TPL-2179 / TPL-219).
    const svg = svgOf("boundary#pci { border-color: #c0392b; }");
    expect(svg).toContain("◇ PCI scope");
    const at = svg.indexOf("◇ PCI scope");
    const tab = svg.slice(Math.max(0, at - 500), at);
    expect(tab).toContain("#c0392b");
    expect(tab).not.toContain(darkPalette.boundaryHues[1]);
  });

  it("applies a bare `boundary` rule to every frame", () => {
    // Today this parses and matches nothing, which TPL-1503 rules out. It now
    // means "every boundary frame".
    const svg = svgOf("boundary { border-style: solid; }");
    for (const id of ["payments", "pci"]) {
      expect(frameOf(svg, id)).not.toContain("stroke-dasharray");
    }
  });

  it("lets boundary#<id> win over bare boundary, later-wins at equal score", () => {
    const svg = svgOf(
      "boundary { border-color: #111111; } boundary#pci { border-color: #222222; }",
    );
    expect(frameOf(svg, "pci")).toContain('stroke="#222222"');
    expect(frameOf(svg, "payments")).toContain('stroke="#111111"');

    const later = svgOf(
      "boundary#pci { border-color: #222222; } boundary#pci { border-color: #333333; }",
    );
    expect(frameOf(later, "pci")).toContain('stroke="#333333"');
  });

  it("is inert for a boundary that does not exist", () => {
    // Same as `#NoSuchNode`: no match, no warning, no effect.
    const before = svgOf();
    const after = svgOf("boundary#nosuch { border-color: #c0392b; }");
    expect(after).toBe(before);
  });

  it("leaves a model with no boundary rule byte-identical", () => {
    expect(svgOf("service { border-radius: 8px; }")).toBe(svgOf("service { border-radius: 8px; }"));
    expect(svgOf()).toBe(svgOf(""));
  });

  it("does not touch team frames", () => {
    // The team axis is out of scope (#2269); a boundary rule must not leak onto it.
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
    const withRule = compile(src, {
      diagramType: "system",
      groupBy: "team",
      styleSource: "boundary { border-color: #c0392b; }",
    });
    const without = compile(src, { diagramType: "system", groupBy: "team" });
    if (withRule.diagramType !== "system" || without.diagramType !== "system") {
      throw new Error("expected system view");
    }
    expect(withRule.svg).toBe(without.svg);
  });
});
