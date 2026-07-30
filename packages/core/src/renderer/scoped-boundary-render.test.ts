import { describe, it, expect } from "vitest";
import { compile } from "../index.js";
import { Parser } from "../parser/parser.js";
import { buildDrillDownSvg } from "./drill-down-svg.js";

// Rendering for `boundary` blocks declared inside a node block (#2036).
//
// The parser slice indexed them; this pins the half that users can see. What
// distinguishes a scoped boundary from the top-level form is *where* its frame
// appears: it belongs to the canvas it was written on, and must not leak onto
// any other level. Both directions are asserted — frame present where it
// belongs, absent where it does not — since a model-wide axis would satisfy
// only the first.

const SCOPED = `
system Shop {
  boundary top {
    label "Top"
    contains Checkout
  }

  service Checkout {
    boundary core {
      label "Core domains"
      contains Ledger
      contains Cart
    }

    domain Ledger { label "Ledger" }
    domain Cart { label "Cart" }
    domain Reporting { label "Reporting" }
  }

  service Billing { label "Billing" }
}
`;

function systemSvg(src: string, groupBy?: "team" | "boundary"): string {
  const result = compile(src, { diagramType: "system", groupBy });
  if (result.diagramType !== "system") throw new Error("expected system view");
  return result.svg;
}

// A scoped boundary's group id is its declaring scope path plus its id in the
// JSON encoding of `scopedBoundaryGroupId` (#2036 — identity = scope + id).
// In raw SVG text the JSON quotes appear XML-escaped.
function scopedFrameAttr(scopePath: string[], id: string): string {
  const groupId = JSON.stringify([...scopePath, id]).replaceAll('"', "&quot;");
  return `data-container-id="__group_${groupId}__"`;
}

function drillSvg(src: string, viewPath: string[], groupBy?: "team" | "boundary"): string {
  const result = compile(src, { diagramType: "system", groupBy, viewPath });
  if (result.diagramType !== "system") throw new Error("expected system view");
  return result.svg;
}

describe("scoped boundary rendering (#2036)", () => {
  it("frames the declaring canvas only", () => {
    // `core` is declared inside Checkout, so it frames Checkout's drill view…
    const drill = drillSvg(SCOPED, ["Checkout"], "boundary");
    expect(drill).toContain(scopedFrameAttr(["Shop", "Checkout"], "core"));
    // …and does not appear on the root canvas, where its members are not drawn.
    const root = systemSvg(SCOPED, "boundary");
    expect(root).not.toContain(scopedFrameAttr(["Shop", "Checkout"], "core"));
  });

  it("treats a boundary written in the system block as the root canvas's own", () => {
    const root = systemSvg(SCOPED, "boundary");
    expect(root).toContain(scopedFrameAttr(["Shop"], "top"));
    // It frames the root canvas, not the drill level below it.
    const drill = drillSvg(SCOPED, ["Checkout"], "boundary");
    expect(drill).not.toContain(scopedFrameAttr(["Shop"], "top"));
  });

  it("stays inert unless the boundary axis is selected", () => {
    expect(systemSvg(SCOPED)).not.toContain("__group_");
    expect(drillSvg(SCOPED, ["Checkout"])).not.toContain("__group_");
    // Byte-identical to compiling with no groupBy at all, so a model that does
    // not opt in is untouched.
    expect(systemSvg(SCOPED, undefined)).toBe(systemSvg(SCOPED));
  });

  it("leaves a non-member on the same canvas outside the frame", () => {
    const drill = drillSvg(SCOPED, ["Checkout"], "boundary");
    // Reporting is a sibling of the members but not contained, so it is drawn
    // without being framed — a boundary that swallowed the whole canvas would
    // still satisfy the presence assertions above.
    expect(drill).toContain(scopedFrameAttr(["Shop", "Checkout"], "core"));
    expect(drill).toContain("Reporting");
  });

  it("gives a same-named boundary in each scope its own group identity", () => {
    const src = `
system Shop {
  boundary core {
    label "Root core"
    contains Checkout
  }

  service Checkout {
    boundary core {
      label "Service core"
      contains Ledger
    }

    domain Ledger { label "Ledger" }
  }
}
`;
    // Identity = declaring scope + id (#2036), so each canvas frames its own
    // `core` under a scope-qualified container id — unlike a team spanning
    // systems (#1884), which is ONE declaration and deliberately shares one id.
    // Each frame is titled with its own declared label.
    const root = systemSvg(src, "boundary");
    expect(root).toContain(scopedFrameAttr(["Shop"], "core"));
    expect(root).toContain(">Root core</text>");
    const drill = drillSvg(src, ["Checkout"], "boundary");
    expect(drill).toContain(scopedFrameAttr(["Shop", "Checkout"], "core"));
    expect(drill).toContain(">Service core</text>");
    expect(drill).not.toContain(">Root core</text>");
  });

  it("collapses a same-named boundary independently per scope", () => {
    const src = `
system Shop {
  boundary core {
    label "Root core"
    contains Checkout
  }

  service Checkout {
    boundary core {
      label "Service core"
      contains Ledger
    }

    domain Ledger { label "Ledger" }
  }
}
`;
    // Collapse state is keyed by the group id; scope-qualified ids keep the two
    // `core` boundaries independent (the design's acceptance expectation).
    const rootGroupId = JSON.stringify(["Shop", "core"]);
    const collapsed = new Set([rootGroupId]);
    const root = compile(src, {
      diagramType: "system",
      groupBy: "boundary",
      collapsedGroups: collapsed,
    });
    if (root.diagramType !== "system") throw new Error("expected system view");
    // Root canvas: its `core` folded to a stub, titled with the bare id.
    expect(root.svg).toContain("__group_collapsed_");
    expect(root.svg).toContain("core (1)");
    // Drill canvas: the service-scoped `core` is untouched by that state.
    const drill = compile(src, {
      diagramType: "system",
      groupBy: "boundary",
      viewPath: ["Checkout"],
      collapsedGroups: collapsed,
    });
    if (drill.diagramType !== "system") throw new Error("expected system view");
    expect(drill.svg).toContain(scopedFrameAttr(["Shop", "Checkout"], "core"));
    expect(drill.svg).not.toContain("__group_collapsed_");
  });

  it("reaches the bundled drill-down export, not just the interactive view", () => {
    // The export builders are a separate surface from `compile()`, and the axis
    // has been dropped on one surface before (#2033) — so the bundle is checked
    // directly rather than assumed to follow (TPL-1983).
    const krsFile = Parser.parse(SCOPED).value;
    const { svg } = buildDrillDownSvg(
      krsFile,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "boundary",
    );
    // Both levels' frames are present in the one bundled document.
    expect(svg).toContain(scopedFrameAttr(["Shop"], "top"));
    expect(svg).toContain(scopedFrameAttr(["Shop", "Checkout"], "core"));
  });

  it("reports hasBoundaries so the app offers the Group-by menu for a scoped-only model", () => {
    // The menu's visibility gate is `hasBoundaries`. A model whose only
    // boundaries are scoped has an empty top-level `boundaries` array, so
    // checking that alone would hide the menu and leave the axis unreachable.
    const result = compile(SCOPED, { diagramType: "system" });
    if (result.diagramType !== "system") throw new Error("expected system view");
    expect(result.hasBoundaries).toBe(true);

    const noBoundaries = compile(`system Shop { service Billing { label "Billing" } }`, {
      diagramType: "system",
    });
    if (noBoundaries.diagramType !== "system") throw new Error("expected system view");
    expect(noBoundaries.hasBoundaries).toBe(false);
  });

  it("does not disturb the top-level form", () => {
    const src = `
system Shop {
  service Billing { label "Billing" }
  service Wallet { label "Wallet" }
}
boundary payments {
  label "Payments"
  contains Billing
  contains Wallet
}
`;
    const svg = systemSvg(src, "boundary");
    expect(svg).toContain('data-container-id="__group_payments__"');
  });
});
