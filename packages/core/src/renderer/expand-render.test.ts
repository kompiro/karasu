import { describe, it, expect } from "vitest";
import { compile, type CompileOptions } from "../index.js";

const KRS = `
system ECPlatform {
  service ECommerce {
    domain Contract { label "契約" }
  }
  service BillingService {
    label "Billing"
    domain Billing {
      Billing -> Contract "creates from contract"
    }
    domain Invoicing {
      Invoicing -> Billing "internal"
    }
  }
}
`;

function systemSvg(opts: CompileOptions): string {
  const result = compile(KRS, opts);
  if (result.diagramType !== "system") throw new Error("expected system diagram");
  return result.svg;
}

describe("compile — in-place expansion end-to-end (#1921)", () => {
  it("renders the expanded container's domains inside a labelled frame", () => {
    const svg = systemSvg({
      diagramType: "system",
      expandedContainers: new Set(["BillingService"]),
    });
    // The expanded service's domains are shown as nodes…
    expect(svg).toContain('data-node-id="Invoicing"');
    expect(svg).toContain('data-node-id="Billing"');
    // …while the collapsed sibling stays a service box (its Contract domain hidden).
    expect(svg).toContain('data-node-id="ECommerce"');
    expect(svg).not.toContain('data-node-id="Contract"');
  });

  it("emits data-expand-node controls only when interactive", () => {
    const staticSvg = systemSvg({ diagramType: "system", interactive: false });
    expect(staticSvg).not.toContain("data-expand-node");

    const liveSvg = systemSvg({ diagramType: "system", interactive: true });
    // ⊕ expand control on the collapsed, drillable service boxes.
    expect(liveSvg).toContain('data-expand-node="BillingService"');
    expect(liveSvg).toContain('data-expand-node="ECommerce"');
  });

  it("draws the expansion frame even when the model has team ownership (owns)", () => {
    // Regression: an `owns` model populates ownerIndex; the expansion band must
    // group by the expanded container, not the team, or the frame goes missing
    // (#1921 feedback — "frame not shown" on org/system.krs).
    const OWNS = `
system S {
  service ECommerce {
    label "EC Site"
    domain Order { label "Orders" }
    domain Catalog { label "Product Catalog" }
  }
  service Payment { domain Billing { usecase Charge } }
  ECommerce -> Payment "pay"
}
organization Corp {
  team "ec" {
    owns ECommerce
    owns Order
    owns Catalog
  }
}
`;
    const r = compile(OWNS, { diagramType: "system", expandedContainers: new Set(["ECommerce"]) });
    if (r.diagramType !== "system") throw new Error("expected system diagram");
    expect(r.svg).toContain('data-container-id="__group_ECommerce__"');
    expect(r.svg).toContain('data-expanded="true"');
    expect(r.svg).toContain('data-node-id="Order"');
  });

  it("does not draw expand controls in a multi-system root", () => {
    // Regression for #1921 review finding 2: expansion is only derived for the
    // single-system root, so a multi-system view must not show a dead ⊕.
    const MULTI = `
system A {
  service Svc { domain Dom { usecase U } }
}
system B {
  service Other { domain D2 { usecase U2 } }
}
`;
    const r = compile(MULTI, { diagramType: "system", interactive: true });
    if (r.diagramType !== "system") throw new Error("expected system diagram");
    expect(r.svg).not.toContain("data-expand-node");
  });

  it("renders the expanded frame prominently (solid accent border, not a muted dashed team frame)", () => {
    // #1921 feedback: on a busy diagram the reused dashed team-frame style is
    // easy to miss ("frame not shown"); the opened service must stand out.
    const svg = systemSvg({
      diagramType: "system",
      expandedContainers: new Set(["BillingService"]),
    });
    const i = svg.indexOf('data-container-id="__group_BillingService__"');
    expect(i).toBeGreaterThan(-1);
    const group = svg.slice(i - 40, i + 300);
    expect(group).toContain('data-expanded="true"');
    // The frame rect is solid (no dashed team-frame stroke).
    const rect = group.match(/<rect [^>]*\/>/)![0];
    expect(rect).not.toContain("stroke-dasharray");
    expect(rect).toContain("fill-opacity"); // faint accent tint
  });

  it("shows a ⊖ (collapse) control on the expanded frame and no ⊕ for it", () => {
    const liveSvg = systemSvg({
      diagramType: "system",
      interactive: true,
      expandedContainers: new Set(["BillingService"]),
    });
    // The expanded service still carries a data-expand-node (now the frame's ⊖).
    expect(liveSvg).toContain('data-expand-node="BillingService"');
    // The expanded frame is not a team-collapse target.
    expect(liveSvg).not.toContain('data-collapse-group="BillingService"');
  });
});
