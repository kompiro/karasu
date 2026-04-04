import { describe, it, expect, beforeEach } from "vitest";
import { buildAllLayersSvg, buildAllLayersSvgOrg } from "./all-layers-svg.js";
import { registerBuiltinShapes } from "./shapes.js";
import { clearRegistry } from "./shape-registry.js";
import { Parser } from "../parser/parser.js";

beforeEach(() => {
  clearRegistry();
  registerBuiltinShapes();
});

const ONE_LEVEL = `
system ECommerce {
  service OrderService { label "Order" }
  service PaymentService { label "Payment" }
}
`;

const TWO_LEVEL = `
system ECommerce {
  service OrderService {
    label "Order"
    domain OrderDomain { label "Order Domain" }
    domain ShippingDomain { label "Shipping Domain" }
  }
  service PaymentService { label "Payment" }
}
`;

const THREE_LEVEL = `
system ECommerce {
  service OrderService {
    label "Order"
    domain OrderDomain {
      label "Order Domain"
      usecase CreateOrder { label "Create Order" }
    }
  }
}
`;

describe("buildAllLayersSvg with styleSource", () => {
  it("applies styleSource to the rendered output", () => {
    const krsFile = Parser.parse(ONE_LEVEL).value;
    const styleSource = `service { color: #00FF00; }`;
    const withStyle = buildAllLayersSvg(krsFile, styleSource);
    const without = buildAllLayersSvg(krsFile);

    expect(withStyle.svg).not.toEqual(without.svg);
    expect(withStyle.svg).toContain("#00FF00");
    expect(withStyle.diagnostics).toEqual([]);
  });
});

const ORG_FLAT = `
organization Acme {
  team Frontend { label "Frontend" }
  team Backend { label "Backend" }
}
`;

const ORG_TWO_LEVEL = `
organization Acme {
  team Engineering {
    label "Engineering"
    team Frontend { label "Frontend" }
    team Backend { label "Backend" }
  }
  team Design { label "Design" }
}
`;

// Tests for assembleAllLayersSvg (via buildAllLayersSvg / buildAllLayersSvgOrg)
describe("buildAllLayersSvg", () => {
  it("returns placeholder for empty source", () => {
    const krsFile = Parser.parse("system Empty {}").value;
    const { svg } = buildAllLayersSvg(krsFile);
    expect(svg).toContain("No diagram");
  });

  it("single-level: one section, no separator line", () => {
    const krsFile = Parser.parse(ONE_LEVEL).value;
    const { svg } = buildAllLayersSvg(krsFile);

    // Section label for root
    expect(svg).toContain("ECommerce");
    // No separator line (only one level)
    expect(svg).not.toContain('stroke="#1E293B"');
    // Dark background
    expect(svg).toContain("#0F172A");
  });

  it("two-level: two sections with separator line between them", () => {
    const krsFile = Parser.parse(TWO_LEVEL).value;
    const { svg } = buildAllLayersSvg(krsFile);

    // Both section labels present
    expect(svg).toContain("ECommerce");
    expect(svg).toContain("ECommerce › Order");
    // Separator line appears between sections
    expect(svg).toContain('stroke="#1E293B"');
  });

  it("three-level: three sections with path labels", () => {
    const krsFile = Parser.parse(THREE_LEVEL).value;
    const { svg } = buildAllLayersSvg(krsFile);

    expect(svg).toContain("ECommerce");
    expect(svg).toContain("ECommerce › Order");
    expect(svg).toContain("ECommerce › Order › Order Domain");
  });

  it("is a valid outer SVG with background style", () => {
    const krsFile = Parser.parse(ONE_LEVEL).value;
    const { svg } = buildAllLayersSvg(krsFile);

    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('style="background:#0F172A"');
  });
});

describe("buildAllLayersSvgOrg", () => {
  it("returns placeholder for empty org", () => {
    const krsFile = Parser.parse("system Empty {}").value;
    const { svg } = buildAllLayersSvgOrg(krsFile);
    expect(svg).toContain("No org diagram");
  });

  it("renders a section for each team including leaf teams", () => {
    // ORG_FLAT has 2 leaf teams → root + Frontend + Backend = 3 sections with separators
    const krsFile = Parser.parse(ORG_FLAT).value;
    const { svg } = buildAllLayersSvgOrg(krsFile);

    expect(svg).toContain("Acme");
    expect(svg).toContain("Frontend");
    expect(svg).toContain("Backend");
    // Multiple sections → separator lines present
    expect(svg).toContain('stroke="#1E293B"');
    expect(svg).toContain("#0F172A");
  });

  it("two-level: path labels include team name", () => {
    const krsFile = Parser.parse(ORG_TWO_LEVEL).value;
    const { svg } = buildAllLayersSvgOrg(krsFile);

    expect(svg).toContain("Acme");
    expect(svg).toContain("Engineering");
    expect(svg).toContain("Frontend");
    expect(svg).toContain('stroke="#1E293B"');
  });

  it("is a valid outer SVG with background style", () => {
    const krsFile = Parser.parse(ORG_FLAT).value;
    const { svg } = buildAllLayersSvgOrg(krsFile);

    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('style="background:#0F172A"');
  });

  it("applies styleSource to the rendered output", () => {
    const krsFile = Parser.parse(ORG_FLAT).value;
    const styleSource = `team { color: #ABCDEF; }`;
    const withStyle = buildAllLayersSvgOrg(krsFile, styleSource);
    const without = buildAllLayersSvgOrg(krsFile);

    expect(withStyle.svg).not.toEqual(without.svg);
    expect(withStyle.svg).toContain("#ABCDEF");
    expect(withStyle.diagnostics).toEqual([]);
  });
});
