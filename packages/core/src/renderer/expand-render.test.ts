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
