import { describe, it, expect, beforeEach } from "vitest";
import {
  buildDrillDownSvg,
  buildDrillDownSvgOrg,
  buildFullViewSvg,
  buildFullViewSvgOrg,
} from "./drill-down-svg.js";
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

describe("buildDrillDownSvg with styleSource", () => {
  it("applies styleSource to the rendered output", () => {
    const krsFile = Parser.parse(ONE_LEVEL).value;
    const styleSource = `service { color: #FF0000; }`;
    const svgWithStyle = buildDrillDownSvg(krsFile, styleSource);
    const svgWithout = buildDrillDownSvg(krsFile);

    // The style should change the output
    expect(svgWithStyle).not.toEqual(svgWithout);
    // Custom color should appear in the styled SVG
    expect(svgWithStyle).toContain("#FF0000");
  });
});

describe("buildFullViewSvg with styleSource", () => {
  it("applies styleSource to the rendered output", () => {
    const krsFile = Parser.parse(ONE_LEVEL).value;
    const styleSource = `service { color: #00FF00; }`;
    const svgWithStyle = buildFullViewSvg(krsFile, styleSource);
    const svgWithout = buildFullViewSvg(krsFile);

    expect(svgWithStyle).not.toEqual(svgWithout);
    expect(svgWithStyle).toContain("#00FF00");
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

const ORG_THREE_LEVEL = `
organization Acme {
  team Engineering {
    label "Engineering"
    team Platform {
      label "Platform"
      team Infra { label "Infra" }
    }
  }
}
`;

describe("buildDrillDownSvgOrg", () => {
  it("returns placeholder for empty org", () => {
    const krsFile = Parser.parse("system Empty {}").value;
    const svg = buildDrillDownSvgOrg(krsFile);
    expect(svg).toContain("No org diagram");
  });

  it("flat org: produces krs-view-root, no drill-down links", () => {
    const krsFile = Parser.parse(ORG_FLAT).value;
    const svg = buildDrillDownSvgOrg(krsFile);

    expect(svg).toContain('id="krs-view-root"');
    // No child levels — teams have no sub-teams
    expect(svg).not.toContain('id="krs-view-Frontend"');
    expect(svg).not.toContain('id="krs-view-Backend"');
    // No back button
    expect(svg).not.toContain('<g class="krs-back-button"');
  });

  it("two-level: root + child view, <a> links for drillable teams", () => {
    const krsFile = Parser.parse(ORG_TWO_LEVEL).value;
    const svg = buildDrillDownSvgOrg(krsFile);

    expect(svg).toContain('id="krs-view-root"');
    expect(svg).toContain('id="krs-view-Engineering"');
    // Root links to Engineering (has sub-teams)
    expect(svg).toContain('href="#krs-view-Engineering"');
    // Design has no sub-teams and no members — no level for it
    expect(svg).not.toContain('id="krs-view-Design"');
    // Engineering level has back button
    const engIdx = svg.indexOf('id="krs-view-Engineering"');
    const backIdx = svg.indexOf('<g class="krs-back-button"', engIdx);
    expect(backIdx).toBeGreaterThan(engIdx);
  });

  it("three-level: recursively generates all levels", () => {
    const krsFile = Parser.parse(ORG_THREE_LEVEL).value;
    const svg = buildDrillDownSvgOrg(krsFile);

    expect(svg).toContain('id="krs-view-root"');
    expect(svg).toContain('id="krs-view-Engineering"');
    expect(svg).toContain('id="krs-view-Platform"');
    // Infra has no sub-teams and no members — no level
    expect(svg).not.toContain('id="krs-view-Infra"');
    // Platform level back button links to Engineering
    const platformIdx = svg.indexOf('id="krs-view-Platform"');
    const backHref = svg.indexOf('href="#krs-view-Engineering"', platformIdx);
    expect(backHref).toBeGreaterThan(platformIdx);
  });

  it("team with members is drillable even without sub-teams", () => {
    const krsFile = Parser.parse(`
organization Acme {
  team Engineering {
    label "Engineering"
    member alice { label "Alice" }
  }
  team Design { label "Design" }
}
`).value;
    const svg = buildDrillDownSvgOrg(krsFile);

    expect(svg).toContain('id="krs-view-root"');
    // Engineering has a member → drillable
    expect(svg).toContain('id="krs-view-Engineering"');
    expect(svg).toContain('href="#krs-view-Engineering"');
    // Design has no members and no sub-teams → not drillable
    expect(svg).not.toContain('id="krs-view-Design"');
    // Engineering level has back button
    const engIdx = svg.indexOf('id="krs-view-Engineering"');
    const backIdx = svg.indexOf('<g class="krs-back-button"', engIdx);
    expect(backIdx).toBeGreaterThan(engIdx);
  });

  it("includes CSS :target rules", () => {
    const krsFile = Parser.parse(ORG_TWO_LEVEL).value;
    const svg = buildDrillDownSvgOrg(krsFile);

    expect(svg).toContain(".krs-view { display: none; }");
    expect(svg).toContain(".krs-view:target { display: block; }");
    expect(svg).toContain("#krs-view-root { display: block; }");
  });
});

describe("buildDrillDownSvgOrg with styleSource", () => {
  it("applies styleSource to the rendered output", () => {
    const krsFile = Parser.parse(ORG_TWO_LEVEL).value;
    const styleSource = `team { color: #FF00FF; }`;
    const svgWithStyle = buildDrillDownSvgOrg(krsFile, styleSource);
    const svgWithout = buildDrillDownSvgOrg(krsFile);

    expect(svgWithStyle).not.toEqual(svgWithout);
    expect(svgWithStyle).toContain("#FF00FF");
  });
});

// Tests for assembleFullViewSvg (via buildFullViewSvg / buildFullViewSvgOrg)
describe("buildFullViewSvg", () => {
  it("returns placeholder for empty source", () => {
    const krsFile = Parser.parse("system Empty {}").value;
    const svg = buildFullViewSvg(krsFile);
    expect(svg).toContain("No diagram");
  });

  it("single-level: one section, no separator line", () => {
    const krsFile = Parser.parse(ONE_LEVEL).value;
    const svg = buildFullViewSvg(krsFile);

    // Section label for root
    expect(svg).toContain("ECommerce");
    // No separator line (only one level)
    expect(svg).not.toContain('stroke="#1E293B"');
    // Dark background
    expect(svg).toContain("#0F172A");
  });

  it("two-level: two sections with separator line between them", () => {
    const krsFile = Parser.parse(TWO_LEVEL).value;
    const svg = buildFullViewSvg(krsFile);

    // Both section labels present
    expect(svg).toContain("ECommerce");
    expect(svg).toContain("ECommerce › Order");
    // Separator line appears between sections
    expect(svg).toContain('stroke="#1E293B"');
  });

  it("three-level: three sections with path labels", () => {
    const krsFile = Parser.parse(THREE_LEVEL).value;
    const svg = buildFullViewSvg(krsFile);

    expect(svg).toContain("ECommerce");
    expect(svg).toContain("ECommerce › Order");
    expect(svg).toContain("ECommerce › Order › Order Domain");
  });

  it("is a valid outer SVG with background style", () => {
    const krsFile = Parser.parse(ONE_LEVEL).value;
    const svg = buildFullViewSvg(krsFile);

    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('style="background:#0F172A"');
  });
});

describe("buildFullViewSvgOrg", () => {
  it("returns placeholder for empty org", () => {
    const krsFile = Parser.parse("system Empty {}").value;
    const svg = buildFullViewSvgOrg(krsFile);
    expect(svg).toContain("No org diagram");
  });

  it("renders a section for each team including leaf teams", () => {
    // ORG_FLAT has 2 leaf teams → root + Frontend + Backend = 3 sections with separators
    const krsFile = Parser.parse(ORG_FLAT).value;
    const svg = buildFullViewSvgOrg(krsFile);

    expect(svg).toContain("Acme");
    expect(svg).toContain("Frontend");
    expect(svg).toContain("Backend");
    // Multiple sections → separator lines present
    expect(svg).toContain('stroke="#1E293B"');
    expect(svg).toContain("#0F172A");
  });

  it("two-level: path labels include team name", () => {
    const krsFile = Parser.parse(ORG_TWO_LEVEL).value;
    const svg = buildFullViewSvgOrg(krsFile);

    expect(svg).toContain("Acme");
    expect(svg).toContain("Engineering");
    expect(svg).toContain("Frontend");
    expect(svg).toContain('stroke="#1E293B"');
  });

  it("is a valid outer SVG with background style", () => {
    const krsFile = Parser.parse(ORG_FLAT).value;
    const svg = buildFullViewSvgOrg(krsFile);

    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('style="background:#0F172A"');
  });

  it("applies styleSource to the rendered output", () => {
    const krsFile = Parser.parse(ORG_FLAT).value;
    const styleSource = `team { color: #ABCDEF; }`;
    const svgWithStyle = buildFullViewSvgOrg(krsFile, styleSource);
    const svgWithout = buildFullViewSvgOrg(krsFile);

    expect(svgWithStyle).not.toEqual(svgWithout);
    expect(svgWithStyle).toContain("#ABCDEF");
  });
});
