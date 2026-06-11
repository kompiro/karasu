import { describe, it, expect, beforeEach } from "vitest";
import { buildDrillDownSvg, buildDrillDownSvgOrg, buildAllViewsSvg } from "./drill-down-svg.js";
import { buildAllLayersSvg, buildAllLayersSvgOrg } from "./all-layers-svg.js";
import { registerBuiltinShapes } from "./shapes.js";
import { clearRegistry } from "../shapes/shape-registry.js";
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
    const { svg } = buildDrillDownSvg(krsFile);
    expect(svg).toContain("No diagram");
  });

  it("single-level: produces krs-system-root, no back buttons", () => {
    const krsFile = Parser.parse(ONE_LEVEL).value;
    const { svg } = buildDrillDownSvg(krsFile);

    expect(svg).toContain('id="krs-system-root"');
    // No back button elements rendered (CSS class definitions are still present)
    expect(svg).not.toContain('<g class="krs-back-button"');
    // No child levels — only root
    expect(svg).not.toContain('id="krs-system-OrderService"');
  });

  it("two-level: root + child view, <a> links in root", () => {
    const krsFile = Parser.parse(TWO_LEVEL).value;
    const { svg } = buildDrillDownSvg(krsFile);

    expect(svg).toContain('id="krs-system-root"');
    expect(svg).toContain('id="krs-system-OrderService"');
    // Root should link to OrderService
    expect(svg).toContain('href="#krs-system-OrderService"');
    // PaymentService has no children — no link to it
    expect(svg).not.toContain('id="krs-system-PaymentService"');
    // OrderService level should have a back button element
    const orderIdx = svg.indexOf('id="krs-system-OrderService"');
    const backIdx = svg.indexOf('<g class="krs-back-button"', orderIdx);
    expect(backIdx).toBeGreaterThan(orderIdx);
  });

  it("three-level: recursively generates all levels", () => {
    const krsFile = Parser.parse(THREE_LEVEL).value;
    const { svg } = buildDrillDownSvg(krsFile);

    expect(svg).toContain('id="krs-system-root"');
    expect(svg).toContain('id="krs-system-OrderService"');
    expect(svg).toContain('id="krs-system-OrderDomain"');
    // OrderDomain level links back to OrderService
    const domainIdx = svg.indexOf('id="krs-system-OrderDomain"');
    const backHref = svg.indexOf('href="#krs-system-OrderService"', domainIdx);
    expect(backHref).toBeGreaterThan(domainIdx);
  });

  it("includes CSS :target rules", () => {
    const krsFile = Parser.parse(TWO_LEVEL).value;
    const { svg } = buildDrillDownSvg(krsFile);

    expect(svg).toContain(".krs-view { display: none; }");
    expect(svg).toContain(".krs-view:target { display: block; }");
    expect(svg).toContain(".krs-root-level { display: block; }");
  });

  it("each level has its own viewBox nested svg", () => {
    const krsFile = Parser.parse(TWO_LEVEL).value;
    const { svg } = buildDrillDownSvg(krsFile);

    // Each level should have an inner <svg viewBox="...">
    const matches = [...svg.matchAll(/viewBox="[^"]+"/g)];
    // At least two viewBox values (root + OrderService level)
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

describe("buildDrillDownSvg with top-level services", () => {
  it("renders an orphan service inside an Unassigned frame when no system wraps it", () => {
    const krsFile = Parser.parse(
      `service ECommerce { usecase ManageOrders { label "注文管理" } }`,
    ).value;
    const { svg } = buildDrillDownSvg(krsFile);
    expect(svg).not.toContain("No diagram");
    expect(svg).toContain("Unassigned");
    expect(svg).toContain('data-node-id="ECommerce"');
    // Drill-down page for the orphan service is produced so clicking it works
    expect(svg).toContain('id="krs-system-ECommerce"');
    expect(svg).toContain('data-node-id="ManageOrders"');
  });

  it("renders orphan service in Unassigned frame alongside an existing system frame", () => {
    const krsFile = Parser.parse(`
service Standalone { label "単独" }
system ECPlatform { service ECommerce {} }
    `).value;
    const { svg } = buildDrillDownSvg(krsFile);
    expect(svg).toContain("ECPlatform");
    expect(svg).toContain("Unassigned");
    expect(svg).toContain('data-node-id="Standalone"');
    expect(svg).toContain('data-node-id="ECommerce"');
  });
});

describe("buildDrillDownSvg with top-level infra blocks", () => {
  it("renders an orphan database inside an Unassigned frame when no system wraps it", () => {
    const krsFile = Parser.parse(
      `database OrderDB { label "注文DB" table OrdersTable { label "orders" } }`,
    ).value;
    const { svg } = buildDrillDownSvg(krsFile);
    expect(svg).not.toContain("No diagram");
    expect(svg).toContain("Unassigned");
    expect(svg).toContain('data-node-id="OrderDB"');
  });

  it("renders orphan database alongside an existing system frame", () => {
    const krsFile = Parser.parse(`
database OrderDB {}
system ECPlatform { service ECommerce {} }
    `).value;
    const { svg } = buildDrillDownSvg(krsFile);
    expect(svg).toContain("ECPlatform");
    expect(svg).toContain("Unassigned");
    expect(svg).toContain('data-node-id="OrderDB"');
    expect(svg).toContain('data-node-id="ECommerce"');
  });

  it("renders a zero-system file with only database/queue/storage", () => {
    const krsFile = Parser.parse(`
database OrderDB {}
queue EventQueue {}
storage FileStore {}
    `).value;
    const { svg } = buildDrillDownSvg(krsFile);
    expect(svg).not.toContain("No diagram");
    expect(svg).toContain("Unassigned");
    expect(svg).toContain('data-node-id="OrderDB"');
    expect(svg).toContain('data-node-id="EventQueue"');
    expect(svg).toContain('data-node-id="FileStore"');
  });

  it("produces a drill-down page for a top-level database so its table children are reachable", () => {
    const krsFile = Parser.parse(
      `database OrderDB { table OrdersTable { label "orders" } table PaymentsTable { label "payments" } }`,
    ).value;
    const { svg } = buildDrillDownSvg(krsFile);
    // The drill-down page for OrderDB must exist so clicking the node navigates into it
    expect(svg).toContain('id="krs-system-OrderDB"');
    // Both table children must be visible inside that drill-down level
    expect(svg).toContain('data-node-id="OrdersTable"');
    expect(svg).toContain('data-node-id="PaymentsTable"');
  });
});

describe("buildDrillDownSvg with styleSource", () => {
  it("applies styleSource to the rendered output", () => {
    const krsFile = Parser.parse(ONE_LEVEL).value;
    const styleSource = `service { color: #FF0000; }`;
    const withStyle = buildDrillDownSvg(krsFile, styleSource);
    const without = buildDrillDownSvg(krsFile);

    // The style should change the output
    expect(withStyle.svg).not.toEqual(without.svg);
    // Custom color should appear in the styled SVG
    expect(withStyle.svg).toContain("#FF0000");
    expect(withStyle.diagnostics).toEqual([]);
  });
});

describe("buildDrillDownSvg diagnostics", () => {
  it("returns diagnostics for malformed style source", () => {
    const krsFile = Parser.parse(ONE_LEVEL).value;
    // "service" selector without braces triggers expect(LeftBrace) diagnostic
    const result = buildDrillDownSvg(krsFile, "service color: red;");

    expect(result.diagnostics.length).toBeGreaterThan(0);
    // SVG should still render (best-effort)
    expect(result.svg).toContain("<svg");
  });

  it("returns empty diagnostics when no style source", () => {
    const krsFile = Parser.parse(ONE_LEVEL).value;
    const result = buildDrillDownSvg(krsFile);

    expect(result.diagnostics).toEqual([]);
  });
});

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
    const { svg } = buildDrillDownSvgOrg(krsFile);
    expect(svg).toContain("No org diagram");
  });

  it("flat org: produces krs-org-root, no drill-down links", () => {
    const krsFile = Parser.parse(ORG_FLAT).value;
    const { svg } = buildDrillDownSvgOrg(krsFile);

    expect(svg).toContain('id="krs-org-root"');
    // No child levels — teams have no sub-teams
    expect(svg).not.toContain('id="krs-org-Frontend"');
    expect(svg).not.toContain('id="krs-org-Backend"');
    // No back button
    expect(svg).not.toContain('<g class="krs-back-button"');
  });

  it("two-level: root + child view, <a> links for drillable teams", () => {
    const krsFile = Parser.parse(ORG_TWO_LEVEL).value;
    const { svg } = buildDrillDownSvgOrg(krsFile);

    expect(svg).toContain('id="krs-org-root"');
    expect(svg).toContain('id="krs-org-Engineering"');
    // Root links to Engineering (has sub-teams)
    expect(svg).toContain('href="#krs-org-Engineering"');
    // Design has no sub-teams and no members — no level for it
    expect(svg).not.toContain('id="krs-org-Design"');
    // Engineering level has back button
    const engIdx = svg.indexOf('id="krs-org-Engineering"');
    const backIdx = svg.indexOf('<g class="krs-back-button"', engIdx);
    expect(backIdx).toBeGreaterThan(engIdx);
  });

  it("three-level: recursively generates all levels", () => {
    const krsFile = Parser.parse(ORG_THREE_LEVEL).value;
    const { svg } = buildDrillDownSvgOrg(krsFile);

    expect(svg).toContain('id="krs-org-root"');
    expect(svg).toContain('id="krs-org-Engineering"');
    expect(svg).toContain('id="krs-org-Platform"');
    // Infra has no sub-teams and no members — no level
    expect(svg).not.toContain('id="krs-org-Infra"');
    // Platform level back button links to Engineering
    const platformIdx = svg.indexOf('id="krs-org-Platform"');
    const backHref = svg.indexOf('href="#krs-org-Engineering"', platformIdx);
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
    const { svg } = buildDrillDownSvgOrg(krsFile);

    expect(svg).toContain('id="krs-org-root"');
    // Engineering has a member → drillable
    expect(svg).toContain('id="krs-org-Engineering"');
    expect(svg).toContain('href="#krs-org-Engineering"');
    // Design has no members and no sub-teams → not drillable
    expect(svg).not.toContain('id="krs-org-Design"');
    // Engineering level has back button
    const engIdx = svg.indexOf('id="krs-org-Engineering"');
    const backIdx = svg.indexOf('<g class="krs-back-button"', engIdx);
    expect(backIdx).toBeGreaterThan(engIdx);
  });

  it("includes CSS :target rules", () => {
    const krsFile = Parser.parse(ORG_TWO_LEVEL).value;
    const { svg } = buildDrillDownSvgOrg(krsFile);

    expect(svg).toContain(".krs-view { display: none; }");
    expect(svg).toContain(".krs-view:target { display: block; }");
    expect(svg).toContain(".krs-root-level { display: block; }");
  });
});

describe("buildDrillDownSvgOrg with styleSource", () => {
  it("applies styleSource to the rendered output", () => {
    const krsFile = Parser.parse(ORG_TWO_LEVEL).value;
    const styleSource = `team { color: #FF00FF; }`;
    const withStyle = buildDrillDownSvgOrg(krsFile, styleSource);
    const without = buildDrillDownSvgOrg(krsFile);

    expect(withStyle.svg).not.toEqual(without.svg);
    expect(withStyle.svg).toContain("#FF00FF");
    expect(withStyle.diagnostics).toEqual([]);
  });
});

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

// ─── buildAllViewsSvg ────────────────────────────────────────────────────────

const SYSTEM_ONLY = `
system ECommerce {
  service OrderService { label "Order" }
  service PaymentService { label "Payment" }
}
`;

const SYSTEM_WITH_DEPLOY = `
system ECommerce {
  service OrderService { label "Order" }
}

deploy Production {
  oci AppServer { label "App Server" }
}
`;

const ALL_THREE_VIEWS = `
system ECommerce {
  service OrderService { label "Order" }
}

deploy Production {
  oci AppServer { label "App Server" }
}

organization Acme {
  team Engineering { label "Engineering" }
}
`;

const SYSTEM_WITH_DRILLDOWN = `
system ECommerce {
  service OrderService {
    label "Order"
    domain OrderDomain { label "Order Domain" }
  }
}
`;

describe("buildAllViewsSvg", () => {
  it("returns placeholder for empty file", () => {
    const krsFile = Parser.parse("system Empty {}").value;
    const { svg } = buildAllViewsSvg(krsFile);
    expect(svg).toContain("No diagram");
  });

  it("system only: system tab enabled, deploy/org tabs disabled", () => {
    const krsFile = Parser.parse(SYSTEM_ONLY).value;
    const { svg } = buildAllViewsSvg(krsFile);

    // System pane exists
    expect(svg).toContain('id="krs-system-root"');
    // System tab is enabled (has anchor link)
    expect(svg).toContain('href="#krs-system-root"');
    // Deploy and org tabs are disabled
    expect(svg).toMatch(/class="krs-tab krs-tab--deploy krs-tab--disabled"/);
    expect(svg).toMatch(/class="krs-tab krs-tab--org krs-tab--disabled"/);
    // System tab is NOT disabled
    expect(svg).not.toMatch(/class="krs-tab krs-tab--system krs-tab--disabled"/);
  });

  it("system + deploy: both enabled, org disabled", () => {
    const krsFile = Parser.parse(SYSTEM_WITH_DEPLOY).value;
    const { svg } = buildAllViewsSvg(krsFile);

    expect(svg).toContain('id="krs-system-root"');
    expect(svg).toContain('id="krs-deploy-root"');
    expect(svg).not.toMatch(/class="krs-tab krs-tab--system krs-tab--disabled"/);
    expect(svg).not.toMatch(/class="krs-tab krs-tab--deploy krs-tab--disabled"/);
    expect(svg).toMatch(/class="krs-tab krs-tab--org krs-tab--disabled"/);
  });

  it("all three views: all tabs enabled", () => {
    const krsFile = Parser.parse(ALL_THREE_VIEWS).value;
    const { svg } = buildAllViewsSvg(krsFile);

    expect(svg).toContain('id="krs-system-root"');
    expect(svg).toContain('id="krs-deploy-root"');
    expect(svg).toContain('id="krs-org-root"');
    // No tab element should have the disabled class
    expect(svg).not.toMatch(/class="krs-tab krs-tab--\w+ krs-tab--disabled"/);
  });

  it("tab bar always has three tabs", () => {
    const krsFile = Parser.parse(SYSTEM_ONLY).value;
    const { svg } = buildAllViewsSvg(krsFile);

    // Match krs-tab--system/deploy/org but not krs-tab-bar
    const matches = [...svg.matchAll(/class="krs-tab krs-tab--/g)];
    expect(matches.length).toBe(3);
  });

  it("deploy is a single non-drillable level", () => {
    const krsFile = Parser.parse(SYSTEM_WITH_DEPLOY).value;
    const { svg } = buildAllViewsSvg(krsFile);

    expect(svg).toContain('id="krs-deploy-root"');
    // No sub-levels for deploy
    expect(svg).not.toContain('id="krs-deploy-AppServer"');
  });

  it("system drill-down links use krs-system-* prefix", () => {
    const krsFile = Parser.parse(SYSTEM_WITH_DRILLDOWN).value;
    const { svg } = buildAllViewsSvg(krsFile);

    expect(svg).toContain('id="krs-system-root"');
    expect(svg).toContain('id="krs-system-OrderService"');
    expect(svg).toContain('href="#krs-system-OrderService"');
  });

  it("includes pane switching CSS rules", () => {
    const krsFile = Parser.parse(SYSTEM_ONLY).value;
    const { svg } = buildAllViewsSvg(krsFile);

    expect(svg).toContain(".krs-pane { display: none; }");
    expect(svg).toContain(".krs-pane--system { display: block; }");
    expect(svg).toContain(':has([id^="krs-deploy-"]:target) .krs-pane--deploy { display: block; }');
    expect(svg).toContain(':has([id^="krs-org-"]:target) .krs-pane--org { display: block; }');
  });

  it("includes .krs-view drill-down CSS rules", () => {
    const krsFile = Parser.parse(SYSTEM_ONLY).value;
    const { svg } = buildAllViewsSvg(krsFile);

    expect(svg).toContain(".krs-view { display: none; }");
    expect(svg).toContain(".krs-view:target { display: block; }");
    expect(svg).toContain(".krs-root-level { display: block; }");
  });

  it("outer SVG has numeric width and height attributes", () => {
    const krsFile = Parser.parse(SYSTEM_ONLY).value;
    const { svg } = buildAllViewsSvg(krsFile);

    expect(svg).toMatch(/^<svg[^>]+width="\d+"/);
    expect(svg).toMatch(/^<svg[^>]+height="\d+"/);
  });

  it("applies styleSource to the rendered output", () => {
    const krsFile = Parser.parse(SYSTEM_ONLY).value;
    const withStyle = buildAllViewsSvg(krsFile, `service { color: #FF1234; }`);
    const without = buildAllViewsSvg(krsFile);

    expect(withStyle.svg).not.toEqual(without.svg);
    expect(withStyle.svg).toContain("#FF1234");
    expect(withStyle.diagnostics).toEqual([]);
  });

  it("returns diagnostics for malformed style source", () => {
    const krsFile = Parser.parse(SYSTEM_ONLY).value;
    const result = buildAllViewsSvg(krsFile, "service color: red;");

    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.svg).toContain("<svg");
  });

  // Resolver warnings are a model-level fact, independent of which view is
  // rendered — the all-views path must surface them too. See Issue #1438.
  it("surfaces resolver warnings (unassigned + dispersed domain) — Issue #1438", () => {
    const krsFile = Parser.parse(`
domain Orphan {}

system EC {
  service ECommerce { domain Order {} }
  service Legacy { domain Order {} }
}
`).value;
    const result = buildAllViewsSvg(krsFile);

    expect(result.warnings.some((w) => w.kind === "unassigned-domain")).toBe(true);
    expect(result.warnings.some((w) => w.kind === "domain-dispersal")).toBe(true);
  });

  it("returns an empty warnings array for a clean model — Issue #1438", () => {
    const krsFile = Parser.parse(SYSTEM_ONLY).value;
    const result = buildAllViewsSvg(krsFile);

    expect(result.warnings).toEqual([]);
  });
});

// ─── Legend plumbing for drill-down levels (Issue #1513) ─────────────────────
//
// Phase 0 + scope switching: every level of the single-SVG builders gets the
// legend options, and the renderer's exact-match filter decides which legends
// each level shows. Parity across the three logical render paths (top-level
// compile / drill-down / all-layers) is pinned per TPL-20260510-11.

const LEGEND_SCOPED = `
legend "U" { swatch #111111 "unscoped-entry" }
legend system "S" { swatch #222222 "system-entry" }
legend service "Sv" { swatch #333333 "service-entry" }
legend domain "Dm" { swatch #444444 "domain-entry" }
system Shop {
  service Order {
    label "Order"
    domain Billing {
      label "Billing"
      usecase Pay { label "Pay" }
    }
  }
}
`;

/**
 * Splits a multi-level SVG into per-level chunks keyed by their view id.
 * Chunks end at the next `<g id="krs-...">` of any view prefix so a trailing
 * system level does not swallow the deploy / org panes that follow it.
 */
function levelChunks(svg: string, prefix: string): Map<string, string> {
  const marker = '<g id="krs-';
  const idStart = '<g id="'.length;
  const chunks = new Map<string, string>();
  let from = svg.indexOf(marker);
  while (from !== -1) {
    const next = svg.indexOf(marker, from + marker.length);
    const chunk = next === -1 ? svg.slice(from) : svg.slice(from, next);
    const id = chunk.slice(idStart, chunk.indexOf('"', idStart));
    if (id.startsWith(prefix)) chunks.set(id, chunk);
    from = next;
  }
  return chunks;
}

describe("buildDrillDownSvg legend scope switching (Issue #1513)", () => {
  it("each level shows exactly the legends scoped to its depth", () => {
    const krsFile = Parser.parse(LEGEND_SCOPED).value;
    const { svg } = buildDrillDownSvg(krsFile);
    const chunks = levelChunks(svg, "krs-system-");

    const root = chunks.get("krs-system-root");
    expect(root).toBeDefined();
    expect(root).toContain("unscoped-entry");
    expect(root).toContain("system-entry");
    expect(root).not.toContain("service-entry");
    expect(root).not.toContain("domain-entry");

    const service = chunks.get("krs-system-Order");
    expect(service).toBeDefined();
    expect(service).toContain("service-entry");
    expect(service).not.toContain("unscoped-entry");
    expect(service).not.toContain("system-entry");
    expect(service).not.toContain("domain-entry");

    const domain = chunks.get("krs-system-Billing");
    expect(domain).toBeDefined();
    expect(domain).toContain("domain-entry");
    expect(domain).not.toContain("unscoped-entry");
    expect(domain).not.toContain("service-entry");
  });

  it("keeps drill-down levels legend-free for files using only pre-#1513 scopes", () => {
    const krsFile = Parser.parse(`
legend "U" { swatch #111111 "unscoped-entry" }
legend system "S" { swatch #222222 "system-entry" }
${TWO_LEVEL}
`).value;
    const { svg } = buildDrillDownSvg(krsFile);
    const chunks = levelChunks(svg, "krs-system-");

    expect(chunks.get("krs-system-root")).toContain("legend-footer");
    const offendingLevels = [...chunks.entries()]
      .filter(([id, chunk]) => id !== "krs-system-root" && chunk.includes("legend-footer"))
      .map(([id]) => id);
    expect(offendingLevels).toEqual([]);
  });
});

describe("buildAllViewsSvg legend scope switching (Issue #1513)", () => {
  it("renders the deploy-scoped legend on the bundled deploy pane", () => {
    const krsFile = Parser.parse(`
legend deploy "Dp" { swatch #666666 "deploy-entry" }
legend service "Sv" { swatch #333333 "service-entry" }
system Shop {
  service Order { label "Order" domain Billing {} }
}
deploy Production {
  oci "api" { realizes Order }
}
`).value;
    const { svg } = buildAllViewsSvg(krsFile);
    const deployChunk = levelChunks(svg, "krs-deploy-").get("krs-deploy-root");
    expect(deployChunk).toBeDefined();
    expect(deployChunk).toContain("deploy-entry");
    expect(deployChunk).not.toContain("service-entry");

    const serviceChunk = levelChunks(svg, "krs-system-").get("krs-system-Order");
    expect(serviceChunk).toContain("service-entry");
    expect(serviceChunk).not.toContain("deploy-entry");
  });
});

describe("logical render path parity for legends (TPL-20260510-11)", () => {
  it("drill-down and all-layers carry the same legends as the top-level compile", () => {
    const krsFile = Parser.parse(LEGEND_SCOPED).value;
    const drillDown = buildDrillDownSvg(krsFile).svg;
    const allLayers = buildAllLayersSvg(krsFile).svg;
    const allViews = buildAllViewsSvg(krsFile).svg;

    // Every legend declared for a logical depth must surface in all three
    // multi-level outputs; a missing one means a render path lost the
    // legend options again (parity drift).
    const entries = ["unscoped-entry", "system-entry", "service-entry", "domain-entry"];
    const lost = [
      ["drill-down", drillDown],
      ["all-layers", allLayers],
      ["all-views", allViews],
    ].flatMap(([path, svg]) => entries.filter((e) => !svg.includes(e)).map((e) => `${path}:${e}`));
    expect(lost).toEqual([]);
  });
});
