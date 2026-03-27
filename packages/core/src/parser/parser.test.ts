import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import type { ServiceNode, UserNode } from "../types/ast.js";

describe("Parser", () => {
  it("parses empty input", () => {
    const result = Parser.parse("");
    expect(result.value.systems).toHaveLength(0);
    expect(result.value.services).toHaveLength(0);
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
    const result = Parser.parse("system MySystem {}");
    expect(result.value.systems).toHaveLength(1);
    expect(result.value.systems[0].kind).toBe("system");
    expect(result.value.systems[0].id).toBe("MySystem");
    expect(result.value.systems[0].children).toHaveLength(0);
  });

  it("parses label as property", () => {
    const result = Parser.parse(`
system MySystem {
  label "My System"
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value.systems[0].label).toBe("My System");
  });

  it("uses id as display name when label is omitted", () => {
    const result = Parser.parse("system MySystem {}");
    expect(result.value.systems[0].label).toBeUndefined();
    expect(result.value.systems[0].id).toBe("MySystem");
  });

  it("errors when id is missing", () => {
    const result = Parser.parse("system { }");
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("parses description in property block", () => {
    const result = Parser.parse(`
system Test {
  user Customer {
    label "顧客"
    description "商品を購入する一般ユーザー"
  }
  service ECommerce {
    label "ECサイト"
    description "商品管理と注文処理"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const sys = result.value.systems[0];
    expect(sys.children).toHaveLength(2);

    const userNode = sys.children[0];
    expect(userNode.kind).toBe("user");
    expect(userNode.id).toBe("Customer");
    expect(userNode.label).toBe("顧客");
    expect(userNode.properties.description).toBe("商品を購入する一般ユーザー");

    const service = sys.children[1];
    expect(service.kind).toBe("service");
    expect(service.id).toBe("ECommerce");
    expect(service.label).toBe("ECサイト");
    expect(service.properties.description).toBe("商品管理と注文処理");
  });

  it("parses tags", () => {
    const result = Parser.parse(`
system Test {
  service Payment [external]
}
    `);
    const service = result.value.systems[0].children[0];
    expect(service.tags).toEqual(["external"]);
  });

  it("parses annotations", () => {
    const result = Parser.parse(`
system Test {
  service Legacy @deprecated @migration_target
}
    `);
    const service = result.value.systems[0].children[0];
    expect(service.annotations).toEqual(["deprecated", "migration_target"]);
  });

  it("parses tags and annotations combined", () => {
    const result = Parser.parse(`
system Test {
  service Legacy [external] @deprecated
}
    `);
    const service = result.value.systems[0].children[0];
    expect(service.tags).toEqual(["external"]);
    expect(service.annotations).toEqual(["deprecated"]);
  });

  it("parses sync edges", () => {
    const result = Parser.parse(`
system Test {
  user Customer
  service Shop
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
system Test {
  service A
  service B
  A --> B "非同期処理"
}
    `);
    const edges = result.value.systems[0].edges;
    expect(edges).toHaveLength(1);
    expect(edges[0].kind).toBe("async");
  });

  it("parses nested nodes with full hierarchy", () => {
    const result = Parser.parse(`
system Test {
  service ECommerce {
    domain Order {
      usecase PlaceOrder {
        resource OrderTable {
          label "注文テーブル"
        }
        resource InventoryAPI [external] {
          label "在庫API"
        }
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

  it("parses deploy block (legacy string literal syntax)", () => {
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
    expect(deploy.id).toBe("本番環境");
    expect(deploy.label).toBeUndefined();
    expect(deploy.nodes).toHaveLength(2);

    const oci = deploy.nodes[0];
    expect(oci.kind).toBe("oci");
    expect(oci.id).toBe("order-service");
    expect(oci.label).toBeUndefined();
    expect(oci.properties.image).toBe("order:2.1.0");
    expect(oci.properties.runtime).toBe("Node.js 20");
    expect(oci.properties.realizes).toBe("ECommerce");

    const job = deploy.nodes[1];
    expect(job.kind).toBe("job");
    expect(job.properties.schedule).toBe("0 0 1 * *");
    expect(job.properties.realizes).toBe("Billing");
  });

  it("parses deploy block with identifier id and label properties", () => {
    const result = Parser.parse(`
deploy Production {
  label "本番環境"
  oci ecommerceApp {
    label "EC Application"
    runtime "Node.js 20"
    realizes ECommerce
  }
  job billingJob {
    schedule "0 0 1 * *"
    realizes Billing
  }
}
    `);
    expect(result.value.deploys).toHaveLength(1);
    const deploy = result.value.deploys[0];
    expect(deploy.id).toBe("Production");
    expect(deploy.label).toBe("本番環境");
    expect(deploy.nodes).toHaveLength(2);

    const oci = deploy.nodes[0];
    expect(oci.kind).toBe("oci");
    expect(oci.id).toBe("ecommerceApp");
    expect(oci.label).toBe("EC Application");
    expect(oci.properties.runtime).toBe("Node.js 20");
    expect(oci.properties.realizes).toBe("ECommerce");

    const job = deploy.nodes[1];
    expect(job.kind).toBe("job");
    expect(job.id).toBe("billingJob");
    expect(job.label).toBeUndefined();
    expect(job.properties.schedule).toBe("0 0 1 * *");
    expect(job.properties.realizes).toBe("Billing");
  });

  it("parses a complete file with imports, system, and deploy", () => {
    const result = Parser.parse(`
@import "default.krs.style"

system ECPlatform {
  label "ECプラットフォーム"
  user Customer {
    description "商品を購入する一般ユーザー"
  }
  service ECommerce {
    description "商品管理と注文処理"
  }
  service Payment [external]
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
system Test {
  user Admin [human] {
    label "管理者"
    role "システム管理者"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const user = result.value.systems[0].children[0] as UserNode;
    expect(user.kind).toBe("user");
    expect(user.id).toBe("Admin");
    expect(user.label).toBe("管理者");
    expect(user.properties.role).toBe("システム管理者");
    expect(user.tags).toEqual(["human"]);
  });

  it("parses user with [ai] tag", () => {
    const result = Parser.parse(`
system Test {
  user AIAgent [ai] {
    role "注文処理担当"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const user = result.value.systems[0].children[0] as UserNode;
    expect(user.kind).toBe("user");
    expect(user.tags).toEqual(["ai"]);
    expect(user.properties.role).toBe("注文処理担当");
  });

  it("parses user without role (simple form)", () => {
    const result = Parser.parse(`
system Test {
  user Admin [human]
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const user = result.value.systems[0].children[0] as UserNode;
    expect(user.kind).toBe("user");
    expect(user.properties.role).toBeUndefined();
    expect(user.tags).toEqual(["human"]);
  });

  it("parses team property on service (deprecated)", () => {
    const result = Parser.parse(`
system Test {
  service ECommerce {
    team "EC開発チーム"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].severity).toBe("warning");
    expect(result.diagnostics[0].message).toContain("deprecated");
    const service = result.value.systems[0].children[0] as ServiceNode;
    expect(service.kind).toBe("service");
    expect(service.properties.team).toBe("EC開発チーム");
  });

  it("parses link property", () => {
    const result = Parser.parse(`
system Test {
  service ECommerce {
    link "https://wiki.example.com/ec" "設計Wiki"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const service = result.value.systems[0].children[0] as ServiceNode;
    expect(service.properties.links).toHaveLength(1);
    expect(service.properties.links[0].url).toBe("https://wiki.example.com/ec");
    expect(service.properties.links[0].label).toBe("設計Wiki");
  });

  it("parses link without label", () => {
    const result = Parser.parse(`
system Test {
  service ECommerce {
    link "https://wiki.example.com/ec"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const service = result.value.systems[0].children[0] as ServiceNode;
    expect(service.properties.links).toHaveLength(1);
    expect(service.properties.links[0].url).toBe("https://wiki.example.com/ec");
    expect(service.properties.links[0].label).toBeUndefined();
  });

  it("parses multiple links", () => {
    const result = Parser.parse(`
system Test {
  service ECommerce {
    link "https://wiki.example.com/ec" "設計Wiki"
    link "https://figma.com/file/xxx" "画面設計"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const service = result.value.systems[0].children[0] as ServiceNode;
    expect(service.properties.links).toHaveLength(2);
    expect(service.properties.links[0].url).toBe("https://wiki.example.com/ec");
    expect(service.properties.links[1].url).toBe("https://figma.com/file/xxx");
  });

  it("parses user with role and link", () => {
    const result = Parser.parse(`
system Test {
  user Customer [human] {
    role "商品を購入する一般ユーザー"
    link "https://wiki.example.com/persona" "ペルソナ定義"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const user = result.value.systems[0].children[0] as UserNode;
    expect(user.properties.role).toBe("商品を購入する一般ユーザー");
    expect(user.properties.links).toHaveLength(1);
    expect(user.properties.links[0].url).toBe("https://wiki.example.com/persona");
    expect(user.properties.links[0].label).toBe("ペルソナ定義");
  });

  it("parses resource with link", () => {
    const result = Parser.parse(`
system Test {
  service S {
    domain D {
      usecase U {
        resource OrderTable {
          link "https://wiki.example.com/order-table" "テーブル定義"
        }
      }
    }
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const resource = result.value.systems[0].children[0].children[0].children[0].children[0];
    expect(resource.kind).toBe("resource");
    expect(resource.properties.links).toHaveLength(1);
    expect(resource.properties.links[0].label).toBe("テーブル定義");
  });

  it("returns empty links array when no links specified", () => {
    const result = Parser.parse(`
system Test {
  service S
}
    `);
    const service = result.value.systems[0].children[0];
    expect(service.properties.links).toEqual([]);
  });

  it("errors when team is used on user node", () => {
    const result = Parser.parse(`
system Test {
  user Admin {
    team "チーム名"
  }
}
    `);
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics[0].message).toContain("team");
  });

  it("parses triple-quoted description", () => {
    const result = Parser.parse(`
system Test {
  service ECommerce {
    description """
      商品管理と注文処理を担当するサービス。

      ## 責務
      - 商品カタログの管理
      """
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const service = result.value.systems[0].children[0] as ServiceNode;
    expect(service.properties.description).toContain("商品管理と注文処理を担当するサービス。");
    expect(service.properties.description).toContain("## 責務");
  });

  it("parses top-level service with deprecated team property", () => {
    const result = Parser.parse(`
service Monitoring {
  label "監視サービス"
  description "配置先のシステムが未定"
  team "SRE チーム"
}
    `);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].severity).toBe("warning");
    expect(result.diagnostics[0].message).toContain("deprecated");
    expect(result.value.services).toHaveLength(1);
    const service = result.value.services[0];
    expect(service.kind).toBe("service");
    expect(service.id).toBe("Monitoring");
    expect(service.label).toBe("監視サービス");
    expect(service.properties.description).toBe("配置先のシステムが未定");
    expect(service.properties.team).toBe("SRE チーム");
  });

  it("parses property block mixed with child nodes", () => {
    const result = Parser.parse(`
system Test {
  service ECommerce {
    description "商品管理"
    team "ECチーム"
    link "https://example.com" "Wiki"

    domain Order {
      usecase PlaceOrder
    }
  }
}
    `);
    // team emits a deprecation warning
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].severity).toBe("warning");
    const service = result.value.systems[0].children[0] as ServiceNode;
    expect(service.properties.description).toBe("商品管理");
    expect(service.properties.team).toBe("ECチーム");
    expect(service.properties.links).toHaveLength(1);
    expect(service.children).toHaveLength(1);
    expect(service.children[0].kind).toBe("domain");
    expect(service.children[0].children).toHaveLength(1);
  });

  it("reports errors for unexpected tokens", () => {
    const result = Parser.parse("??? system");
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  // ─── Organization ─────────────────────────────────────────────────────────

  it("parses organization block with teams and members", () => {
    const result = Parser.parse(`
organization ExampleCorp {
  team backend "バックエンドチーム" {
    owns ECommerce
    owns Order

    member alice "Alice" {
      slack "@alice"
      github "alice-dev"
    }
    member bob "Bob" {
      description "SRE担当"
    }
  }
  team frontend "フロントエンドチーム" {
    owns WebApp
    member carol "Carol" {
      github "carol-fe"
    }
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value.organizations).toHaveLength(1);

    const org = result.value.organizations[0];
    expect(org.id).toBe("ExampleCorp");
    expect(org.teams).toHaveLength(2);

    const backend = org.teams[0];
    expect(backend.id).toBe("backend");
    expect(backend.label).toBe("バックエンドチーム");
    expect(backend.properties.owns).toEqual(["ECommerce", "Order"]);
    expect(backend.members).toHaveLength(2);

    const alice = backend.members[0];
    expect(alice.id).toBe("alice");
    expect(alice.label).toBe("Alice");
    expect(alice.properties.slack).toBe("@alice");
    expect(alice.properties.github).toBe("alice-dev");

    const bob = backend.members[1];
    expect(bob.properties.description).toBe("SRE担当");

    const frontend = org.teams[1];
    expect(frontend.id).toBe("frontend");
    expect(frontend.properties.owns).toEqual(["WebApp"]);
    expect(frontend.members).toHaveLength(1);
  });

  it("parses sub-team nesting", () => {
    const result = Parser.parse(`
organization Corp {
  team platform "プラットフォーム" {
    team infra "インフラ" {
      member dave "Dave" {}
    }
    team security "セキュリティ" {}
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const platform = result.value.organizations[0].teams[0];
    expect(platform.teams).toHaveLength(2);
    expect(platform.teams[0].id).toBe("infra");
    expect(platform.teams[0].members).toHaveLength(1);
    expect(platform.teams[1].id).toBe("security");
  });

  it("builds ownerIndex at parse time", () => {
    const result = Parser.parse(`
system Test {
  service ECommerce {}
  service Payment {}
}
organization Corp {
  team backend {
    owns ECommerce
    owns Payment
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value.ownerIndex.get("ECommerce")).toBe("backend");
    expect(result.value.ownerIndex.get("Payment")).toBe("backend");
  });

  it("errors on duplicate owns across teams", () => {
    const result = Parser.parse(`
organization Corp {
  team teamA {
    owns ECommerce
  }
  team teamB {
    owns ECommerce
  }
}
    `);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].message).toContain("ECommerce");
  });

  it("errors on duplicate team IDs", () => {
    const result = Parser.parse(`
organization Corp {
  team alpha {}
  team alpha {}
}
    `);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].message).toContain("alpha");
  });

  it("parses label property inside organization, team, and member blocks", () => {
    const result = Parser.parse(`
organization Corp {
  label "Corp Label"
  team backend {
    label "Backend Team"
    member alice {
      label "Alice Smith"
    }
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const org = result.value.organizations[0];
    expect(org.label).toBe("Corp Label");
    const team = org.teams[0];
    expect(team.label).toBe("Backend Team");
    const member = team.members[0];
    expect(member.label).toBe("Alice Smith");
  });

  it("label property overrides positional label", () => {
    const result = Parser.parse(`
organization Corp {
  team backend "Positional" {
    label "Property"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value.organizations[0].teams[0].label).toBe("Property");
  });
});
