import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";

describe("Parser", () => {
  it("parses empty input", () => {
    const result = Parser.parse("");
    expect(result.value.systems).toHaveLength(0);
    expect(result.value.deploys).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("parses @import", () => {
    const result = Parser.parse('@import "default.krs.style"');
    expect(result.value.styleImports).toEqual(["default.krs.style"]);
  });

  it("parses multiple @import", () => {
    const result = Parser.parse('@import "base.krs.style"\n@import "theme.krs.style"');
    expect(result.value.styleImports).toEqual(["base.krs.style", "theme.krs.style"]);
  });

  it("parses import declaration", () => {
    const result = Parser.parse('import { ECommerce, Payment } from "ec.krs"');
    expect(result.value.nodeImports).toHaveLength(1);
    expect(result.value.nodeImports[0].ids).toEqual(["ECommerce", "Payment"]);
    expect(result.value.nodeImports[0].path).toBe("ec.krs");
  });

  it("parses a minimal system", () => {
    const result = Parser.parse('system "My System" {}');
    expect(result.value.systems).toHaveLength(1);
    expect(result.value.systems[0].kind).toBe("system");
    expect(result.value.systems[0].label).toBe("My System");
    expect(result.value.systems[0].children).toHaveLength(0);
  });

  it("parses nodes with id, label, and description", () => {
    const result = Parser.parse(`
system "Test" {
  user Customer "顧客" "商品を購入する一般ユーザー"
  service ECommerce "ECサイト" "商品管理と注文処理"
}
    `);
    const sys = result.value.systems[0];
    expect(sys.children).toHaveLength(2);

    const userNode = sys.children[0];
    expect(userNode.kind).toBe("user");
    expect(userNode.id).toBe("Customer");
    expect(userNode.label).toBe("顧客");
    expect(userNode.description).toBe("商品を購入する一般ユーザー");

    const service = sys.children[1];
    expect(service.kind).toBe("service");
    expect(service.id).toBe("ECommerce");
    expect(service.label).toBe("ECサイト");
    expect(service.description).toBe("商品管理と注文処理");
  });

  it("parses tags", () => {
    const result = Parser.parse(`
system "Test" {
  service Payment "決済" [external]
}
    `);
    const service = result.value.systems[0].children[0];
    expect(service.tags).toEqual(["external"]);
  });

  it("parses annotations", () => {
    const result = Parser.parse(`
system "Test" {
  service Legacy "旧システム" @deprecated @migration_target
}
    `);
    const service = result.value.systems[0].children[0];
    expect(service.annotations).toEqual(["deprecated", "migration_target"]);
  });

  it("parses tags and annotations combined", () => {
    const result = Parser.parse(`
system "Test" {
  service Legacy "旧システム" [external] @deprecated
}
    `);
    const service = result.value.systems[0].children[0];
    expect(service.tags).toEqual(["external"]);
    expect(service.annotations).toEqual(["deprecated"]);
  });

  it("parses sync edges", () => {
    const result = Parser.parse(`
system "Test" {
  user Customer "顧客"
  service Shop "ショップ"
  Customer -> Shop "商品を購入する"
}
    `);
    const edges = result.value.systems[0].edges;
    expect(edges).toHaveLength(1);
    expect(edges[0].from).toBe("Customer");
    expect(edges[0].to).toBe("Shop");
    expect(edges[0].label).toBe("商品を購入する");
    expect(edges[0].kind).toBe("sync");
  });

  it("parses async edges", () => {
    const result = Parser.parse(`
system "Test" {
  service A "A"
  service B "B"
  A --> B "非同期処理"
}
    `);
    const edges = result.value.systems[0].edges;
    expect(edges).toHaveLength(1);
    expect(edges[0].kind).toBe("async");
  });

  it("parses nested nodes with full hierarchy", () => {
    const result = Parser.parse(`
system "Test" {
  service ECommerce "EC" {
    domain Order "受注" {
      usecase PlaceOrder "注文を受け付ける" {
        resource OrderTable "注文テーブル"
        resource InventoryAPI "在庫API" [external]
      }
    }
  }
}
    `);
    const service = result.value.systems[0].children[0];
    expect(service.children).toHaveLength(1);
    const domain = service.children[0];
    expect(domain.kind).toBe("domain");
    expect(domain.children).toHaveLength(1);
    const usecase = domain.children[0];
    expect(usecase.kind).toBe("usecase");
    expect(usecase.children).toHaveLength(2);

    const table = usecase.children[0];
    expect(table.kind).toBe("resource");
    expect(table.id).toBe("OrderTable");
    expect(table.label).toBe("注文テーブル");
    expect(table.tags).toEqual([]);

    const api = usecase.children[1];
    expect(api.kind).toBe("resource");
    expect(api.id).toBe("InventoryAPI");
    expect(api.label).toBe("在庫API");
    expect(api.tags).toEqual(["external"]);
  });

  it("parses deploy block", () => {
    const result = Parser.parse(`
deploy "本番環境" {
  oci "order-service" {
    image "order:2.1.0"
    runtime "Node.js 20"
    realizes ECommerce
  }
  job "monthly-billing" {
    schedule "0 0 1 * *"
    runtime "Java 21"
    realizes Billing
  }
}
    `);
    expect(result.value.deploys).toHaveLength(1);
    const deploy = result.value.deploys[0];
    expect(deploy.label).toBe("本番環境");
    expect(deploy.nodes).toHaveLength(2);

    const oci = deploy.nodes[0];
    expect(oci.kind).toBe("oci");
    expect(oci.id).toBe("order-service");
    expect(oci.properties.image).toBe("order:2.1.0");
    expect(oci.properties.runtime).toBe("Node.js 20");
    expect(oci.properties.realizes).toBe("ECommerce");

    const job = deploy.nodes[1];
    expect(job.kind).toBe("job");
    expect(job.properties.schedule).toBe("0 0 1 * *");
    expect(job.properties.realizes).toBe("Billing");
  });

  it("parses a complete file with imports, system, and deploy", () => {
    const result = Parser.parse(`
@import "default.krs.style"

system "ECプラットフォーム" {
  user Customer "顧客" "商品を購入する一般ユーザー"
  service ECommerce "ECサイト" "商品管理と注文処理"
  service Payment "決済サービス" [external]
  Customer -> ECommerce "商品を購入する"
  ECommerce --> Payment "決済を処理する"
}

deploy "本番環境" {
  war "order.war" {
    runtime "Tomcat 9"
    realizes ECommerce
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value.styleImports).toEqual(["default.krs.style"]);
    expect(result.value.systems).toHaveLength(1);
    expect(result.value.deploys).toHaveLength(1);

    const sys = result.value.systems[0];
    expect(sys.children).toHaveLength(3);
    expect(sys.edges).toHaveLength(2);
  });

  it("parses user with role property", () => {
    const result = Parser.parse(`
system "Test" {
  user Admin "管理者" [human] {
    role "システム管理者"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const user = result.value.systems[0].children[0];
    expect(user.kind).toBe("user");
    expect(user.id).toBe("Admin");
    expect(user.label).toBe("管理者");
    expect(user.role).toBe("システム管理者");
    expect(user.tags).toEqual(["human"]);
  });

  it("parses user with [ai] tag", () => {
    const result = Parser.parse(`
system "Test" {
  user AIAgent "注文自動化エージェント" [ai] {
    role "注文処理担当"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const user = result.value.systems[0].children[0];
    expect(user.kind).toBe("user");
    expect(user.tags).toEqual(["ai"]);
    expect(user.role).toBe("注文処理担当");
  });

  it("parses user without role (simple form)", () => {
    const result = Parser.parse(`
system "Test" {
  user Admin "管理者" [human]
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const user = result.value.systems[0].children[0];
    expect(user.kind).toBe("user");
    expect(user.role).toBeUndefined();
    expect(user.tags).toEqual(["human"]);
  });

  it("parses service with team and links", () => {
    const result = Parser.parse(`
system "Test" {
  service ECommerce "ECサイト" "商品管理と注文処理" {
    team "EC開発チーム"
    link "設計Wiki" "https://wiki.example.com/ec"
    link "画面設計" "https://figma.com/ec-design"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const service = result.value.systems[0].children[0];
    expect(service.kind).toBe("service");
    expect(service.team).toBe("EC開発チーム");
    expect(service.links).toHaveLength(2);
    expect(service.links[0]).toEqual({ label: "設計Wiki", url: "https://wiki.example.com/ec" });
    expect(service.links[1]).toEqual({ label: "画面設計", url: "https://figma.com/ec-design" });
  });

  it("parses domain with team", () => {
    const result = Parser.parse(`
system "Test" {
  service ECommerce "EC" {
    domain Order "受注" {
      team "受注チーム"
    }
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const domain = result.value.systems[0].children[0].children[0];
    expect(domain.kind).toBe("domain");
    expect(domain.team).toBe("受注チーム");
  });

  it("parses user with role and link", () => {
    const result = Parser.parse(`
system "Test" {
  user Customer "顧客" [human] {
    role "商品を購入する一般ユーザー"
    link "ペルソナ定義" "https://wiki.example.com/persona"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const user = result.value.systems[0].children[0];
    expect(user.role).toBe("商品を購入する一般ユーザー");
    expect(user.links).toHaveLength(1);
    expect(user.links[0]).toEqual({
      label: "ペルソナ定義",
      url: "https://wiki.example.com/persona",
    });
  });

  it("parses resource with link", () => {
    const result = Parser.parse(`
system "Test" {
  service S "S" {
    domain D "D" {
      usecase U "U" {
        resource OrderTable "注文テーブル" {
          link "テーブル定義" "https://wiki.example.com/order-table"
        }
      }
    }
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const resource = result.value.systems[0].children[0].children[0].children[0].children[0];
    expect(resource.kind).toBe("resource");
    expect(resource.links).toHaveLength(1);
    expect(resource.links[0].label).toBe("テーブル定義");
  });

  it("returns empty links array when no links specified", () => {
    const result = Parser.parse(`
system "Test" {
  service S "S"
}
    `);
    const service = result.value.systems[0].children[0];
    expect(service.links).toEqual([]);
  });

  it("warns when team is used on user node", () => {
    const result = Parser.parse(`
system "Test" {
  user Admin "管理者" {
    team "チーム名"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].severity).toBe("warning");
    expect(result.diagnostics[0].message).toContain("team");
    expect(result.diagnostics[0].message).toContain("user");
  });

  it("errors when link has missing URL", () => {
    const result = Parser.parse(`
system "Test" {
  service S "S" {
    link "ラベルのみ"
  }
}
    `);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.severity === "error")).toBe(true);
  });

  it("parses properties in any order", () => {
    const result = Parser.parse(`
system "Test" {
  service ECommerce "EC" {
    link "Wiki" "https://wiki.example.com"
    team "ECチーム"
    link "設計" "https://design.example.com"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const service = result.value.systems[0].children[0];
    expect(service.team).toBe("ECチーム");
    expect(service.links).toHaveLength(2);
  });

  it("parses service with team, links, and child nodes", () => {
    const result = Parser.parse(`
system "Test" {
  service ECommerce "EC" {
    team "ECチーム"
    link "Wiki" "https://wiki.example.com"
    domain "受注" {
      usecase "注文する"
    }
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const service = result.value.systems[0].children[0];
    expect(service.team).toBe("ECチーム");
    expect(service.links).toHaveLength(1);
    expect(service.children).toHaveLength(1);
    expect(service.children[0].kind).toBe("domain");
  });

  it("reports errors for unexpected tokens", () => {
    const result = Parser.parse("??? system");
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
