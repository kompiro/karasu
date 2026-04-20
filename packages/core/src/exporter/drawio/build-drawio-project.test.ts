import { describe, it, expect } from "vitest";
import { Parser } from "../../parser/parser.js";
import type { KrsFile } from "../../types/ast.js";
import { buildDrawio } from "./build-drawio-project.js";

function parse(src: string): KrsFile {
  const result = Parser.parse(src);
  return result.value;
}

function diagramIds(xml: string): string[] {
  return [...xml.matchAll(/<diagram id="([^"]+)"/g)].map((m) => m[1]!);
}

describe("buildDrawio — system drill-down", () => {
  it("emits one page per drillable level (top + each system / service / domain / usecase with children)", () => {
    const krs = parse(`
      system ECPlatform {
        service ECommerce {
          domain Order {
            usecase PlaceOrder {
              resource OrderTable
            }
          }
        }
        service Payment {}
      }
    `);
    const xml = buildDrawio(krs, { view: "system" });
    const ids = diagramIds(xml);
    // Top-level + drillable containers with children. Payment has no children,
    // so no drill-down for it.
    expect(ids).toContain("system");
    expect(ids).toContain("system_ECPlatform");
    expect(ids).toContain("system_ECPlatform_ECommerce");
    expect(ids).toContain("system_ECPlatform_ECommerce_Order");
    expect(ids).toContain("system_ECPlatform_ECommerce_Order_PlaceOrder");
    expect(ids).not.toContain("system_ECPlatform_Payment");
  });

  it("uses labels (not ids) in the page name when they are set", () => {
    const krs = parse(`
      system ECPlatform {
        label "ECプラットフォーム"
        service Checkout {
          label "Checkout Service"
          domain Order {
            label "受注"
            usecase PlaceOrder {}
          }
        }
      }
    `);
    const xml = buildDrawio(krs, { view: "system" });
    expect(xml).toContain(`name="System ▸ ECプラットフォーム"`);
    expect(xml).toContain(`name="System ▸ ECプラットフォーム ▸ Checkout Service"`);
    expect(xml).toContain(`name="System ▸ ECプラットフォーム ▸ Checkout Service ▸ 受注"`);
  });
});

describe("buildDrawio — org view", () => {
  it("emits a single org page when there is one organization", () => {
    const krs = parse(`
      organization Acme {
        team Platform {
          member alice {}
          member bob {}
        }
      }
    `);
    const xml = buildDrawio(krs, { view: "org" });
    const ids = diagramIds(xml);
    expect(ids).toContain("org");
    // Members show up as cells with their ids
    expect(xml).toContain(`data-karasu-id="alice"`);
    expect(xml).toContain(`data-karasu-id="bob"`);
    // Team is a container
    expect(xml).toContain(`data-karasu-id="Platform"`);
    expect(xml).toContain(`data-karasu-kind="container"`);
  });

  it("emits one org page per organization when there are multiple", () => {
    const krs = parse(`
      organization Acme {
        team Platform { member alice {} }
      }
      organization Subsidiary {
        team Ops { member carol {} }
      }
    `);
    const xml = buildDrawio(krs, { view: "org" });
    const ids = diagramIds(xml);
    expect(ids).toContain("org_Acme");
    expect(ids).toContain("org_Subsidiary");
  });

  it("returns zero org pages when no organizations are defined", () => {
    const krs = parse(`system S {}`);
    const xml = buildDrawio(krs, { view: "org" });
    expect(diagramIds(xml)).toEqual([]);
  });
});

describe("buildDrawio — view:all", () => {
  it("bundles system drill-down, deploy, and org pages together", () => {
    const krs = parse(`
      system S {
        service Svc {
          domain D {}
        }
      }
      deploy "prod" {
        oci "svc-oci" { realizes Svc }
      }
      organization Acme {
        team T { member m {} }
      }
    `);
    const xml = buildDrawio(krs);
    const ids = diagramIds(xml);
    expect(ids).toContain("system");
    expect(ids).toContain("system_S");
    expect(ids).toContain("system_S_Svc");
    expect(ids).toContain("deploy");
    expect(ids).toContain("org");
  });
});
