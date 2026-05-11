// Family-wide parity test for the SVG builder function family.
//
// Closes the TPL-20260510-11 / GB11-1 gap (#1273) — TPL-11 checklist item 5
// calls for a family-wide test that invokes every member with the same
// input + options and asserts consistent parameter handling. The bugs that
// motivated TPL-11 (#219 — styleSource silently ignored in drill-down;
// #160 — systemSheetCount missing in OrgView) were both family-drift
// failures. Per-builder tests already cover each in isolation; this file
// is the structural fence against the next drift.
//
// **When you add a new public `build*Svg(krsSource, styleSource?,
// displayMode?, ...)` builder to `packages/core/src/index.ts`, register
// it in `SVG_BUILDER_FAMILY` below.** The header comment is the only
// enforcement — adding a builder without updating the table is a code-
// review catch, not a compile error, because the family is identified by
// a public API surface rather than a closed type.

import { describe, it, expect } from "vitest";
import {
  buildAllLayersSvg,
  buildAllLayersSvgOrg,
  buildAllViewsSvg,
  buildDrillDownSvg,
  buildDrillDownSvgOrg,
  type DisplayMode,
  type SvgResult,
} from "./index.js";

interface FamilyMember {
  name: string;
  invoke: (krs: string, styleSource?: string, displayMode?: DisplayMode) => SvgResult;
}

const SVG_BUILDER_FAMILY: readonly FamilyMember[] = [
  { name: "buildDrillDownSvg", invoke: buildDrillDownSvg },
  { name: "buildDrillDownSvgOrg", invoke: buildDrillDownSvgOrg },
  { name: "buildAllLayersSvg", invoke: buildAllLayersSvg },
  { name: "buildAllLayersSvgOrg", invoke: buildAllLayersSvgOrg },
  { name: "buildAllViewsSvg", invoke: buildAllViewsSvg },
];

// Fixture exercising all view types so org-only builders have content
// (teams / members) and system-only builders have services. The shared
// style source styles a node from each view so every builder has at least
// one node whose resolved style should carry the threaded color.
const FIXTURE_KRS = `
system S {
  service SvcA {
    domain D {
      usecase U { resource R }
    }
  }
}

organization Org {
  team TeamA {
    member MemberA {}
  }
}
`;

// Color chosen for visibility in failure messages — three repeating digits
// each so a wrong-case bug (e.g. #abcdef vs #ABCDEF) still leaves a trail.
const PROBE_COLOR = "#abcdef";

const FIXTURE_STYLE = `
#SvcA { background-color: ${PROBE_COLOR}; }
#TeamA { background-color: ${PROBE_COLOR}; }
#MemberA { background-color: ${PROBE_COLOR}; }
`;

describe("SVG builder family parity (TPL-20260510-11 / GB11-1)", () => {
  it("registers every advertised family member (sanity)", () => {
    // Sentinel — if the family list shrinks to ≤1 member, the parity
    // test stops asserting parity. Fail loudly in that case.
    expect(SVG_BUILDER_FAMILY.length).toBeGreaterThanOrEqual(2);
    const names = SVG_BUILDER_FAMILY.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  describe.each(SVG_BUILDER_FAMILY)("$name", (member) => {
    it("produces an SVG without parse / build errors on a shared fixture", () => {
      const result = member.invoke(FIXTURE_KRS);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toEqual([]);
      expect(result.svg).toContain("<svg");
    });

    it("threads `styleSource` so the probe color reaches the output", () => {
      const result = member.invoke(FIXTURE_KRS, FIXTURE_STYLE);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toEqual([]);
      // The shared style targets a node in every view (system, org,
      // bundled), so every family member has at least one applicable
      // selector and must surface the resolved color.
      expect(result.svg.toLowerCase()).toContain(PROBE_COLOR);
    });

    it("threads `displayMode` so icon and shape outputs differ", () => {
      // `displayMode === "icon"` appends the icon-theme stylesheet last
      // (see `buildStyles` in renderer/all-layers-svg.ts), so two runs
      // with otherwise identical inputs must produce different SVG. A
      // builder that drops `displayMode` would return identical bytes.
      const shape = member.invoke(FIXTURE_KRS, undefined, "shape");
      const icon = member.invoke(FIXTURE_KRS, undefined, "icon");
      expect(shape.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(icon.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(icon.svg).not.toEqual(shape.svg);
    });
  });

  it("all family members agree on the probe color when given the shared style", () => {
    // Cross-family invariant: every builder that renders any styled node
    // must surface PROBE_COLOR. If one member silently drops styleSource
    // (the #219 failure mode), this single assertion catches it without
    // relying on the per-member tests being exhaustive.
    const missing = SVG_BUILDER_FAMILY.filter(
      (m) => !m.invoke(FIXTURE_KRS, FIXTURE_STYLE).svg.toLowerCase().includes(PROBE_COLOR),
    ).map((m) => m.name);
    expect(missing).toEqual([]);
  });
});
