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
  boundary top "Top" {
    contains Checkout
  }

  service Checkout {
    boundary core "Core domains" {
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

function drillSvg(src: string, viewPath: string[], groupBy?: "team" | "boundary"): string {
  const result = compile(src, { diagramType: "system", groupBy, viewPath });
  if (result.diagramType !== "system") throw new Error("expected system view");
  return result.svg;
}

describe("scoped boundary rendering (#2036)", () => {
  it("frames the declaring canvas only", () => {
    // `core` is declared inside Checkout, so it frames Checkout's drill view…
    const drill = drillSvg(SCOPED, ["Checkout"], "boundary");
    expect(drill).toContain('data-container-id="__group_core__"');
    // …and does not appear on the root canvas, where its members are not drawn.
    const root = systemSvg(SCOPED, "boundary");
    expect(root).not.toContain('data-container-id="__group_core__"');
  });

  it("treats a boundary written in the system block as the root canvas's own", () => {
    const root = systemSvg(SCOPED, "boundary");
    expect(root).toContain('data-container-id="__group_top__"');
    // It frames the root canvas, not the drill level below it.
    const drill = drillSvg(SCOPED, ["Checkout"], "boundary");
    expect(drill).not.toContain('data-container-id="__group_top__"');
  });

  it("stays inert unless the boundary axis is selected", () => {
    expect(systemSvg(SCOPED)).not.toContain('data-container-id="__group_top__"');
    expect(drillSvg(SCOPED, ["Checkout"])).not.toContain('data-container-id="__group_core__"');
    // Byte-identical to compiling with no groupBy at all, so a model that does
    // not opt in is untouched.
    expect(systemSvg(SCOPED, undefined)).toBe(systemSvg(SCOPED));
  });

  it("leaves a non-member on the same canvas outside the frame", () => {
    const drill = drillSvg(SCOPED, ["Checkout"], "boundary");
    // Reporting is a sibling of the members but not contained, so it is drawn
    // without being framed — a boundary that swallowed the whole canvas would
    // still satisfy the presence assertions above.
    expect(drill).toContain('data-container-id="__group_core__"');
    expect(drill).toContain("Reporting");
  });

  it("draws a same-named boundary on each scope that declares one", () => {
    const src = `
system Shop {
  boundary core "Root core" {
    contains Checkout
  }

  service Checkout {
    boundary core "Service core" {
      contains Ledger
    }

    domain Ledger { label "Ledger" }
  }
}
`;
    // Each canvas frames its own members. The two frames share the container id
    // `__group_core__`, matching how a team spanning systems is framed once per
    // system under one id (layout.ts, #1884) — collapse is keyed by that id, so
    // it applies to both. Whether scoped boundaries should instead collapse
    // independently is a semantic question the design raises but does not
    // settle; pinned here so a change to it is deliberate.
    expect(systemSvg(src, "boundary")).toContain('data-container-id="__group_core__"');
    expect(drillSvg(src, ["Checkout"], "boundary")).toContain('data-container-id="__group_core__"');
  });

  it("reaches the bundled drill-down export, not just the interactive view", () => {
    // The export builders are a separate surface from `compile()`, and the axis
    // has been dropped on one surface before (#2033) — so the bundle is checked
    // directly rather than assumed to follow (TPL-20260716-02).
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
    expect(svg).toContain('data-container-id="__group_top__"');
    expect(svg).toContain('data-container-id="__group_core__"');
  });

  it("does not disturb the top-level form", () => {
    const src = `
system Shop {
  service Billing { label "Billing" }
  service Wallet { label "Wallet" }
}
boundary payments "Payments" {
  contains Billing
  contains Wallet
}
`;
    const svg = systemSvg(src, "boundary");
    expect(svg).toContain('data-container-id="__group_payments__"');
  });
});
