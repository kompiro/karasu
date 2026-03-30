import { describe, it, expect, beforeEach } from "vitest";
import { buildDrillDownSvg } from "./drill-down-svg.js";
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

describe("buildDrillDownSvg", () => {
  it("returns placeholder for empty source", () => {
    const krsFile = Parser.parse("system Empty {}").value;
    const svg = buildDrillDownSvg(krsFile);
    expect(svg).toContain("No diagram");
  });

  it("single-level: produces krs-view-root, no back buttons", () => {
    const krsFile = Parser.parse(ONE_LEVEL).value;
    const svg = buildDrillDownSvg(krsFile);

    expect(svg).toContain('id="krs-view-root"');
    // No back button elements rendered (CSS class definitions are still present)
    expect(svg).not.toContain('<g class="krs-back-button"');
    // No child levels — only root
    expect(svg).not.toContain('id="krs-view-OrderService"');
  });

  it("two-level: root + child view, <a> links in root", () => {
    const krsFile = Parser.parse(TWO_LEVEL).value;
    const svg = buildDrillDownSvg(krsFile);

    expect(svg).toContain('id="krs-view-root"');
    expect(svg).toContain('id="krs-view-OrderService"');
    // Root should link to OrderService
    expect(svg).toContain('href="#krs-view-OrderService"');
    // PaymentService has no children — no link to it
    expect(svg).not.toContain('id="krs-view-PaymentService"');
    // OrderService level should have a back button element
    const orderIdx = svg.indexOf('id="krs-view-OrderService"');
    const backIdx = svg.indexOf('<g class="krs-back-button"', orderIdx);
    expect(backIdx).toBeGreaterThan(orderIdx);
  });

  it("three-level: recursively generates all levels", () => {
    const krsFile = Parser.parse(THREE_LEVEL).value;
    const svg = buildDrillDownSvg(krsFile);

    expect(svg).toContain('id="krs-view-root"');
    expect(svg).toContain('id="krs-view-OrderService"');
    expect(svg).toContain('id="krs-view-OrderDomain"');
    // OrderDomain level links back to OrderService
    const domainIdx = svg.indexOf('id="krs-view-OrderDomain"');
    const backHref = svg.indexOf('href="#krs-view-OrderService"', domainIdx);
    expect(backHref).toBeGreaterThan(domainIdx);
  });

  it("includes CSS :target rules", () => {
    const krsFile = Parser.parse(TWO_LEVEL).value;
    const svg = buildDrillDownSvg(krsFile);

    expect(svg).toContain(".krs-view { display: none; }");
    expect(svg).toContain(".krs-view:target { display: block; }");
    expect(svg).toContain("#krs-view-root { display: block; }");
  });

  it("each level has its own viewBox nested svg", () => {
    const krsFile = Parser.parse(TWO_LEVEL).value;
    const svg = buildDrillDownSvg(krsFile);

    // Each level should have an inner <svg viewBox="...">
    const matches = [...svg.matchAll(/viewBox="[^"]+"/g)];
    // At least two viewBox values (root + OrderService level)
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
