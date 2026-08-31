import { describe, it, expect } from "vitest";
import { compile } from "../index.js";
import { computeSpecificity, StyleParser } from "../parser/style-parser.js";
import { formatSelector } from "../style/serialize.js";

// #2269: a team is one entity with two renderings — the card the org tree view
// draws and the frame the system view draws under *Group by: team* — so the
// selector that paints one paints the other. `#<id>` already addressed the card;
// this is the half that reaches the frame, plus the `team#<id>` compound that
// narrows the bare id to the team kind.
const MODEL = `
system Shop {
  service Billing { label "Billing" }
  service Wallet { label "Wallet" }
  service Search { label "Search" }

  Billing -> Wallet "debit"
  Billing -> Search "lookup"
}

organization Org {
  team "payments" {
    label "Payments"
    owns Billing
    owns Wallet
  }
  team "catalog" {
    label "Catalog"
    owns Search
  }
}
`;

function systemSvg(styleSource?: string): string {
  const result = compile(MODEL, { diagramType: "system", groupBy: "team", styleSource });
  if (result.diagramType !== "system") throw new Error("expected system view");
  return result.svg;
}

function orgSvg(styleSource?: string): string {
  const result = compile(MODEL, { diagramType: "org", styleSource });
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

/** The `<g data-node-id="<id>">` team card in the org view, up to its closing tag. */
function cardOf(svg: string, teamId: string): string {
  const marker = `data-node-id="${teamId}"`;
  expect(svg).toContain(marker);
  const at = svg.indexOf(marker);
  return svg.slice(at, svg.indexOf("</g>", at));
}

describe("team#<id> selector (#2269)", () => {
  it("parses as a compound of the kind and the node id, scoring 101", () => {
    const parsed = StyleParser.parse("team#payments { border-color: #c0392b; }", "t");
    expect(parsed.diagnostics).toEqual([]);
    const selector = parsed.value.rules[0].selector;
    // The id lands in `id`, not in a space of its own: `team` is a node kind and
    // `#<id>` already addresses a node there, so this narrows the existing match
    // rather than naming a second id space the way `boundary#<id>` does.
    expect(selector.nodeType).toBe("team");
    expect(selector.id).toBe("payments");
    expect(selector.boundaryId).toBeUndefined();
    expect(computeSpecificity(selector)).toBe(101);
    expect(computeSpecificity(StyleParser.parse("#payments {}", "t").value.rules[0].selector)).toBe(
      100,
    );
  });

  it("round-trips through the formatter instead of widening to the bare id", () => {
    // Re-emitting `team#payments` as `#payments` would silently widen the rule
    // to every entity answering to that id (TPL-1101).
    const sheet = StyleParser.parse("team#payments {}", "t").value;
    expect(formatSelector(sheet.rules[0].selector)).toBe("team#payments");
  });

  it("narrows to the team kind — it does not reach a service of the same id", () => {
    // `Billing` is a service here and no team is called that, so the compound
    // matches nothing while the bare id still matches the service.
    const compound = systemSvg("team#Billing { border-color: #c0392b; }");
    expect(compound).not.toContain("#c0392b");

    const bare = systemSvg("#Billing { border-color: #c0392b; }");
    expect(bare).toContain("#c0392b");
  });

  it("holds when a team and a service really do share an id", () => {
    // `resolveStyles` keys one `nodes` map by bare id across the system, deploy
    // and org passes, so a team and a service called the same thing write to the
    // same entry and the last pass wins. What keeps that from mattering is that
    // no caller resolves org nodes for a view that draws services: the system
    // and deploy paths pass `organizations: undefined`, and the org path draws
    // org nodes only. Pinned end to end here, so a caller that starts threading
    // organizations into the system view has to come back to this.
    const COLLIDING = `
system Sys {
  service Shared { label "Shared service" }
  service Other { label "Other" }
  Shared -> Other "x"
}

organization Org {
  team Shared {
    label "Shared team"
    owns Other
  }
}
`;
    const svgOf = (styleSource: string): string => {
      const result = compile(COLLIDING, { diagramType: "system", styleSource });
      if (result.diagramType !== "system") throw new Error("expected system view");
      return result.svg;
    };
    expect(svgOf("team#Shared { background-color: #FF0000; }")).not.toContain("#FF0000");
    // The bare form still reaches the service, which is what `#<id>` has always meant.
    expect(svgOf("#Shared { background-color: #FF0000; }")).toContain("#FF0000");
  });
});

describe("team frame colour from a style sheet (#2269)", () => {
  it("paints the frame of the team a rule names, and leaves the others alone", () => {
    const svg = systemSvg("#payments { border-color: #C0392B; }");
    expect(frameOf(svg, "payments")).toContain('stroke="#C0392B"');
    expect(frameOf(svg, "catalog")).not.toContain("#C0392B");
  });

  it("paints the card and the frame from one declaration (one entity, one appearance)", () => {
    const sheet = "#payments { border-color: #C0392B; }";
    // TPL-2234: a team is drawn on two surfaces and must not split across two
    // colours the moment an override arrives.
    expect(frameOf(systemSvg(sheet), "payments")).toContain('stroke="#C0392B"');
    expect(cardOf(orgSvg(sheet), "payments")).toContain('stroke="#C0392B"');
  });

  it("accepts the `team#<id>` compound as another spelling of the same thing", () => {
    const bare = systemSvg("#payments { border-color: #C0392B; }");
    const compound = systemSvg("team#payments { border-color: #C0392B; }");
    expect(frameOf(compound, "payments")).toBe(frameOf(bare, "payments"));
  });

  it("lets a bare `team` rule reach every frame", () => {
    const svg = systemSvg("team { border-style: solid; }");
    for (const id of ["payments", "catalog"]) {
      expect(frameOf(svg, id)).not.toContain("stroke-dasharray");
    }
  });

  it("cascades `team#<id>` over `team` at 101 vs 1", () => {
    const svg = systemSvg(`
      team { border-color: #111111; border-style: solid; }
      team#payments { border-color: #C0392B; }
    `);
    const payments = frameOf(svg, "payments");
    // The named rule wins on colour and inherits the bare rule's line style.
    expect(payments).toContain('stroke="#C0392B"');
    expect(payments).not.toContain("stroke-dasharray");
    expect(frameOf(svg, "catalog")).toContain('stroke="#111111"');
  });
});

describe("the frame's default is the renderer's, not the built-in sheet's (#2269)", () => {
  // The load-bearing constraint. The built-in sheet styles the team *card*
  // (`team { background-color: #D1FAE5; border-color: #6EE7B7; … }`); reading it
  // for the frame would repaint every frame green by default, against the
  // monochrome team frames #2179 decided on.
  const BUILTIN_TEAM_COLOURS = ["#065F46", "#D1FAE5", "#047857", "#6EE7B7"];

  it("leaves an unnamed team's frame in the muted dashed default", () => {
    const svg = systemSvg();
    for (const id of ["payments", "catalog"]) {
      const frame = frameOf(svg, id);
      expect(frame).toContain("stroke-dasharray");
      expect(frame).toContain('fill="transparent"');
      for (const colour of BUILTIN_TEAM_COLOURS) {
        expect(frame).not.toContain(colour);
      }
    }
  });

  it("keeps the built-in card colours out of the frame in both themes", () => {
    for (const theme of ["dark", "light"] as const) {
      const result = compile(MODEL, { diagramType: "system", groupBy: "team", theme });
      if (result.diagramType !== "system") throw new Error("expected system view");
      for (const colour of BUILTIN_TEAM_COLOURS) {
        expect(frameOf(result.svg, "payments")).not.toContain(colour);
      }
    }
  });

  it("still styles the card from the built-in sheet", () => {
    // The other half of the same statement: the card keeps its defaults, so
    // "author sheets only" is a rule about the frame, not a regression to the card.
    expect(cardOf(orgSvg(), "payments")).toContain('stroke="#047857"');
  });
});

describe("each property lands on the part of the frame it paints on the card (#2269)", () => {
  it("`background-color` tints the frame rather than filling it", () => {
    const frame = frameOf(systemSvg("#payments { background-color: #C0392B; }"), "payments");
    expect(frame).toContain('fill="#C0392B"');
    expect(frame).toContain('fill-opacity="0.1"');
  });

  it("`border-color` leaves the frame unfilled, unlike a boundary frame", () => {
    // Team frames never overlap (the axis is 1:1), so nothing forces the tint to
    // follow the outline the way #2179 requires on the boundary axis. Following
    // the card is the reading the one declaration predicts.
    const frame = frameOf(systemSvg("#payments { border-color: #C0392B; }"), "payments");
    expect(frame).toContain('stroke="#C0392B"');
    expect(frame).toContain('fill="transparent"');
  });

  it("`color` sets the title and lifts it out of the muted default", () => {
    const frame = frameOf(systemSvg("#payments { color: #C0392B; }"), "payments");
    expect(frame).toContain('fill="#C0392B"');
    expect(frame).not.toContain('opacity="0.7"');
  });

  it("keeps the title muted when the sheet named no colour for it", () => {
    const frame = frameOf(systemSvg("#payments { border-width: 4; }"), "payments");
    expect(frame).toContain('stroke-width="4"');
    expect(frame).toContain('opacity="0.7"');
  });
});

describe("the two group axes do not paint each other's frames (#2269)", () => {
  // `groupId` names a boundary on one axis and an org team on the other, so a
  // rule written for one must not be looked up against the other's ids.
  const BOTH = `
system Shop {
  service Billing { label "Billing" }
  service Search { label "Search" }

  Billing -> Search "lookup"
}

boundary payments {
  label "PCI scope"
  contains Billing
}

organization Org {
  team "payments" {
    label "Payments"
    owns Billing
  }
  team "catalog" {
    label "Catalog"
    owns Search
  }
}
`;

  function svgOf(groupBy: "team" | "boundary", styleSource: string): string {
    const result = compile(BOTH, { diagramType: "system", groupBy, styleSource });
    if (result.diagramType !== "system") throw new Error("expected system view");
    return result.svg;
  }

  it("leaves a boundary frame alone when only `team` rules are present", () => {
    // Both are called `payments` here, which is exactly the collision the axis
    // discriminator exists for.
    const frame = frameOf(
      svgOf("boundary", "team#payments { border-color: #C0392B; }"),
      "payments",
    );
    expect(frame).not.toContain("#C0392B");
  });

  it("leaves a team frame alone when only `boundary` rules are present", () => {
    const frame = frameOf(
      svgOf("team", "boundary#payments { border-color: #C0392B; }"),
      "payments",
    );
    expect(frame).not.toContain("#C0392B");
  });
});

describe("selectors a team frame cannot answer (#2269)", () => {
  // Each of these parses, so the filter has to reject it rather than let it
  // through with the narrowing part discarded — that would silently *widen* the
  // rule to every frame, which is worse than not matching (TPL-1503).
  it("drops an endpoint predicate instead of widening it to every frame", () => {
    const svg = systemSvg("team[from=Billing] { border-color: #C0392B; }");
    for (const id of ["payments", "catalog"]) {
      expect(frameOf(svg, id)).not.toContain("#C0392B");
    }
  });

  it("drops a boundary id, which names another id space entirely", () => {
    const svg = systemSvg("boundary#payments { border-color: #C0392B; }");
    expect(frameOf(svg, "payments")).not.toContain("#C0392B");
  });

  it("refuses a non-numeric border-width rather than emitting NaN", () => {
    const frame = frameOf(systemSvg("#payments { border-width: thick; }"), "payments");
    expect(frame).not.toContain("NaN");
    expect(frame).toContain('stroke-width="2"');
  });
});

describe("border-style keywords are all distinguishable (#2269)", () => {
  it("draws `dotted` differently from `dashed`", () => {
    const dotted = frameOf(systemSvg("#payments { border-style: dotted; }"), "payments");
    const dashed = frameOf(systemSvg("#payments { border-style: dashed; }"), "payments");
    expect(dotted).toContain("stroke-dasharray");
    expect(dashed).toContain("stroke-dasharray");
    expect(dotted).not.toBe(dashed);
  });

  it("draws `solid` with no dash pattern at all", () => {
    expect(frameOf(systemSvg("#payments { border-style: solid; }"), "payments")).not.toContain(
      "stroke-dasharray",
    );
  });
});
