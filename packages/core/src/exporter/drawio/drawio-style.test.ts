import { describe, it, expect } from "vitest";
import {
  buildContainerStyle,
  buildEdgeStyle,
  buildNodeStyle,
  formatCellValue,
} from "./drawio-style.js";
import { renderStyle } from "./mxgraph-builder.js";

describe("buildNodeStyle", () => {
  it("produces a rounded white-filled card by default", () => {
    const rendered = renderStyle(buildNodeStyle({}));
    expect(rendered).toContain("rounded=1");
    expect(rendered).toContain("fillColor=#ffffff");
  });

  it("applies the external annotation overrides", () => {
    const rendered = renderStyle(buildNodeStyle({ annotations: ["external"] }));
    expect(rendered).toContain("fillColor=#f5f5f5");
    expect(rendered).toContain("dashed=1");
  });

  it("marks ghost nodes as dashed with reduced opacity", () => {
    const rendered = renderStyle(buildNodeStyle({ ghost: true }));
    expect(rendered).toContain("dashed=1");
    expect(rendered).toContain("opacity=60");
  });

  it("ignores unknown annotations without erroring", () => {
    const rendered = renderStyle(buildNodeStyle({ annotations: ["unknown-tag"] }));
    expect(rendered).toContain("rounded=1");
  });

  it("applies kind-specific fill color (service)", () => {
    const rendered = renderStyle(buildNodeStyle({ kind: "service" }));
    expect(rendered).toContain("fillColor=#e8f5e9");
  });

  it("applies kind-specific shape (user → umlActor)", () => {
    const rendered = renderStyle(buildNodeStyle({ kind: "user" }));
    expect(rendered).toContain("shape=umlActor");
  });

  it("lets annotation overrides win over kind overrides (deprecated wins on stroke)", () => {
    const rendered = renderStyle(buildNodeStyle({ kind: "service", annotations: ["deprecated"] }));
    expect(rendered).toContain("strokeColor=#cc0000");
    // service fillColor is retained because deprecated does not set fillColor
    expect(rendered).toContain("fillColor=#e8f5e9");
  });
});

describe("formatCellValue", () => {
  it("returns the label unchanged when no kind is given", () => {
    expect(formatCellValue("Checkout")).toBe("Checkout");
  });

  it("prefixes the kind as a UML-style stereotype above the label", () => {
    const value = formatCellValue("Checkout", "service");
    expect(value).toContain("«service»");
    expect(value).toContain("Checkout");
    expect(value).toContain("<br");
  });
});

describe("buildContainerStyle", () => {
  it("marks containers as draw.io containers", () => {
    const style = buildContainerStyle({});
    expect(style.container).toBe(1);
    expect(style.collapsible).toBe(0);
  });
});

describe("buildEdgeStyle", () => {
  it("defaults to an orthogonal edge with classic arrow", () => {
    const rendered = renderStyle(buildEdgeStyle({}));
    expect(rendered).toContain("edgeStyle=orthogonalEdgeStyle");
    expect(rendered).toContain("endArrow=classic");
  });

  it("marks cyclic edges in red dashed", () => {
    const style = buildEdgeStyle({ cyclic: true });
    expect(style.strokeColor).toBe("#d32f2f");
    expect(style.dashed).toBe(1);
  });
});
