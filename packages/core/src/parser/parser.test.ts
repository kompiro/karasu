import { describe, it, expect, assert } from "vitest";
import { Parser } from "./parser.js";
import { formatDiagnostic } from "./diagnostic-legacy-format.js";
import { getReference } from "../builtins/reference.js";
import type { ClientNode, DomainNode, ServiceNode, UserNode } from "../types/ast.js";

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

  it("parses wildcard import declaration", () => {
    const result = Parser.parse('import "team-ec.krs"');
    expect(result.value.nodeImports).toHaveLength(1);
    expect(result.value.nodeImports[0].ids).toEqual([]);
    expect(result.value.nodeImports[0].path).toBe("team-ec.krs");
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  it("parses multiple wildcard imports", () => {
    const result = Parser.parse('import "team-ec.krs"\nimport "team-payment.krs"');
    expect(result.value.nodeImports).toHaveLength(2);
    expect(result.value.nodeImports[0].ids).toEqual([]);
    expect(result.value.nodeImports[0].path).toBe("team-ec.krs");
    expect(result.value.nodeImports[1].ids).toEqual([]);
    expect(result.value.nodeImports[1].path).toBe("team-payment.krs");
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

  it("parses implicit-source edge in domain block", () => {
    const result = Parser.parse(`
system Test {
  service S {
    domain Contract {
      -> Billing
    }
  }
}
    `);
    const domain = result.value.systems[0].children[0].children[0];
    expect(domain.edges).toHaveLength(1);
    expect(domain.edges[0].from).toBe("Contract");
    expect(domain.edges[0].to).toBe("Billing");
    expect(domain.edges[0].kind).toBe("sync");
  });

  it("parses implicit-source async edge in domain block", () => {
    const result = Parser.parse(`
system Test {
  service S {
    domain Contract {
      --> Notification "notify"
    }
  }
}
    `);
    const domain = result.value.systems[0].children[0].children[0];
    expect(domain.edges).toHaveLength(1);
    expect(domain.edges[0].from).toBe("Contract");
    expect(domain.edges[0].to).toBe("Notification");
    expect(domain.edges[0].label).toBe("notify");
    expect(domain.edges[0].kind).toBe("async");
  });

  it("parses implicit-source edge with label and tags", () => {
    const result = Parser.parse(`
system Test {
  service S {
    domain Order {
      -> Payment "decides payment" [async]
    }
  }
}
    `);
    const domain = result.value.systems[0].children[0].children[0];
    expect(domain.edges[0].from).toBe("Order");
    expect(domain.edges[0].to).toBe("Payment");
    expect(domain.edges[0].label).toBe("decides payment");
    expect(domain.edges[0].tags).toEqual(["async"]);
  });

  it("parses implicit-source edge in service block", () => {
    const result = Parser.parse(`
system Test {
  service ECommerce {
    -> Payment "delegates"
  }
}
    `);
    const service = result.value.systems[0].children[0];
    expect(service.edges).toHaveLength(1);
    expect(service.edges[0].from).toBe("ECommerce");
    expect(service.edges[0].to).toBe("Payment");
  });

  it("errors when explicit edge source does not match parent in service/domain block", () => {
    const result = Parser.parse(`
system Test {
  service S {
    domain Contract {
      OtherDomain -> Billing
    }
  }
}
    `);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(formatDiagnostic(errors[0])).toContain("OtherDomain");
    expect(formatDiagnostic(errors[0])).toContain("Contract");
  });

  it("allows explicit edge with matching source in service/domain block", () => {
    const result = Parser.parse(`
system Test {
  service S {
    domain Contract {
      Contract -> Billing
    }
  }
}
    `);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
    const domain = result.value.systems[0].children[0].children[0];
    expect(domain.edges[0].from).toBe("Contract");
  });

  it("allows arbitrary edge source in system block", () => {
    const result = Parser.parse(`
system Test {
  service A
  service B
  A -> B "delegates"
}
    `);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
    expect(result.value.systems[0].edges[0].from).toBe("A");
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
    expect(oci.properties.realizes).toEqual(["ECommerce"]);

    const job = deploy.nodes[1];
    expect(job.kind).toBe("job");
    expect(job.properties.schedule).toBe("0 0 1 * *");
    expect(job.properties.realizes).toEqual(["Billing"]);
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
    expect(oci.properties.realizes).toEqual(["ECommerce"]);

    const job = deploy.nodes[1];
    expect(job.kind).toBe("job");
    expect(job.id).toBe("billingJob");
    expect(job.label).toBeUndefined();
    expect(job.properties.schedule).toBe("0 0 1 * *");
    expect(job.properties.realizes).toEqual(["Billing"]);
  });

  it("parses deploy node with multiple realizes lines into an array", () => {
    const result = Parser.parse(`
deploy Production {
  oci monolith {
    realizes OrderService
    realizes InventoryService
  }
}
    `);
    const node = result.value.deploys[0].nodes[0];
    expect(node.properties.realizes).toEqual(["OrderService", "InventoryService"]);
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

  it("parses client kind with subtype tag", () => {
    const result = Parser.parse(`
system ECPlatform {
  client MobileApp [mobile] {
    label "Customer mobile app"
    description "iOS / Android native app"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const client = result.value.systems[0].children[0] as ClientNode;
    expect(client.kind).toBe("client");
    expect(client.id).toBe("MobileApp");
    expect(client.label).toBe("Customer mobile app");
    expect(client.tags).toEqual(["mobile"]);
    expect(client.properties.description).toBe("iOS / Android native app");
  });

  it("accepts all reserved client subtype tags", () => {
    for (const tag of ["mobile", "web", "desktop", "cli", "device", "extension", "embed"]) {
      const result = Parser.parse(`system S { client X [${tag}] }`);
      expect(result.diagnostics).toEqual([]);
      const client = result.value.systems[0].children[0] as ClientNode;
      expect(client.tags).toEqual([tag]);
    }
  });

  it("emits unassigned-client warning for top-level client", () => {
    const result = Parser.parse(`client TopLevelClient [web]`);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value.clients).toHaveLength(1);
    expect(result.value.clients[0].id).toBe("TopLevelClient");
  });

  it("rejects role property on client", () => {
    const result = Parser.parse(`
system S {
  client WebApp [web] {
    role "should-not-be-allowed"
  }
}
    `);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(formatDiagnostic(result.diagnostics[0])).toContain("role");
  });

  it("parses client handles property — single id", () => {
    const result = Parser.parse(`system S { client A [web] { handles Order } }`);
    expect(result.diagnostics).toHaveLength(0);
    const client = result.value.systems[0].children[0] as ClientNode;
    expect(client.properties.handles).toEqual(["Order"]);
  });

  it("parses client handles property — comma-separated list", () => {
    const result = Parser.parse(`system S { client A [web] { handles X, Y, Z } }`);
    expect(result.diagnostics).toHaveLength(0);
    const client = result.value.systems[0].children[0] as ClientNode;
    expect(client.properties.handles).toEqual(["X", "Y", "Z"]);
  });

  it("merges multiple handles lines", () => {
    const result = Parser.parse(`
system S {
  client A [web] {
    handles X
    handles Y, Z
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const client = result.value.systems[0].children[0] as ClientNode;
    expect(client.properties.handles).toEqual(["X", "Y", "Z"]);
  });

  it("parses service handles property (re-export)", () => {
    const result = Parser.parse(`system S { service Bff { handles Order, Catalog } }`);
    expect(result.diagnostics).toHaveLength(0);
    const service = result.value.systems[0].children[0] as ServiceNode;
    expect(service.properties.handles).toEqual(["Order", "Catalog"]);
  });

  it("rejects handles on user node", () => {
    const result = Parser.parse(`system S { user U [human] { handles X } }`);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(formatDiagnostic(result.diagnostics[0])).toContain("handles");
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
    expect(formatDiagnostic(result.diagnostics[0])).toContain("deprecated");
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
    // Inline resource without dot-notation emits an "unassigned-resource" warning
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].severity).toBe("warning");
    expect(formatDiagnostic(result.diagnostics[0])).toContain("is not assigned to any database");
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
    expect(formatDiagnostic(result.diagnostics[0])).toContain("team");
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
    expect(formatDiagnostic(result.diagnostics[0])).toContain("deprecated");
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
    const members = backend.children.filter((c) => c.kind === "member");
    expect(members).toHaveLength(2);

    const alice = members[0];
    expect(alice.id).toBe("alice");
    expect(alice.label).toBe("Alice");
    expect(alice.kind === "member" && alice.properties.slack).toBe("@alice");
    expect(alice.kind === "member" && alice.properties.github).toBe("alice-dev");

    const bob = members[1];
    expect(bob.properties.description).toBe("SRE担当");

    const frontend = org.teams[1];
    expect(frontend.id).toBe("frontend");
    expect(frontend.properties.owns).toEqual(["WebApp"]);
    expect(frontend.children.filter((c) => c.kind === "member")).toHaveLength(1);
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
    const subTeams = platform.children.filter((c) => c.kind === "team");
    expect(subTeams).toHaveLength(2);
    expect(subTeams[0].id).toBe("infra");
    expect(
      subTeams[0].kind === "team" && subTeams[0].children.filter((c) => c.kind === "member"),
    ).toHaveLength(1);
    expect(subTeams[1].id).toBe("security");
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
    expect(formatDiagnostic(errors[0])).toContain("ECommerce");
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
    expect(formatDiagnostic(errors[0])).toContain("alpha");
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
    const member = team.children.find((c) => c.kind === "member");
    expect(member?.label).toBe("Alice Smith");
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

  // ─── String literal ids ────────────────────────────────────────────────────

  it("parses logical node with string literal id", () => {
    const result = Parser.parse(`
system "e-commerce" {
  label "ECサイト"
  service "order-service" {
    label "受注サービス"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const sys = result.value.systems[0];
    expect(sys.id).toBe("e-commerce");
    expect(sys.label).toBe("ECサイト");
    expect(sys.children[0].id).toBe("order-service");
    expect(sys.children[0].label).toBe("受注サービス");
  });

  it("parses edge with string literal from and to", () => {
    const result = Parser.parse(`
system S {
  service "order-service" {}
  service "payment-gateway" {}
  "order-service" --> "payment-gateway" "決済を呼び出す"
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const edge = result.value.systems[0].edges[0];
    expect(edge.from).toBe("order-service");
    expect(edge.to).toBe("payment-gateway");
    expect(edge.label).toBe("決済を呼び出す");
  });

  it("parses organization and team with string literal ids", () => {
    const result = Parser.parse(`
organization "dev-team" {
  label "開発チーム"
  team "backend-team" {
    label "バックエンド"
    owns "order-service"
    owns "payment-gateway"
    member "alice-smith" {
      label "Alice"
    }
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const org = result.value.organizations[0];
    expect(org.id).toBe("dev-team");
    expect(org.label).toBe("開発チーム");
    const team = org.teams[0];
    expect(team.id).toBe("backend-team");
    expect(team.label).toBe("バックエンド");
    expect(team.properties.owns).toEqual(["order-service", "payment-gateway"]);
    expect(team.children.find((c) => c.kind === "member")?.id).toBe("alice-smith");
  });

  // ─── Identifier forms: camelCase vs string literal ────────────────────────

  it("camelCase and string literal ids produce the same AST shape for system/service", () => {
    const camel = Parser.parse(`
system MySystem {
  service myService {
    label "サービス"
  }
}
    `);
    const quoted = Parser.parse(`
system "MySystem" {
  service "myService" {
    label "サービス"
  }
}
    `);
    expect(camel.diagnostics).toHaveLength(0);
    expect(quoted.diagnostics).toHaveLength(0);
    expect(camel.value.systems[0].id).toBe(quoted.value.systems[0].id);
    expect(camel.value.systems[0].children[0].id).toBe(quoted.value.systems[0].children[0].id);
    expect(camel.value.systems[0].children[0].label).toBe(
      quoted.value.systems[0].children[0].label,
    );
  });

  it("camelCase and string literal ids produce the same AST shape for organization/team", () => {
    const camel = Parser.parse(`
organization Corp {
  team ecTeam {
    owns ECommerce
  }
}
    `);
    const quoted = Parser.parse(`
organization "Corp" {
  team "ecTeam" {
    owns ECommerce
  }
}
    `);
    expect(camel.diagnostics).toHaveLength(0);
    expect(quoted.diagnostics).toHaveLength(0);
    expect(camel.value.organizations[0].id).toBe(quoted.value.organizations[0].id);
    expect(camel.value.organizations[0].teams[0].id).toBe(
      quoted.value.organizations[0].teams[0].id,
    );
    expect(camel.value.organizations[0].teams[0].properties.owns).toEqual(
      quoted.value.organizations[0].teams[0].properties.owns,
    );
  });

  it("accepts identifiers with numbers (e.g. v2Service, order2)", () => {
    const result = Parser.parse(`
system Test {
  service v2Service {
    domain order2 {
      usecase placeOrder3
    }
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const service = result.value.systems[0].children[0];
    expect(service.id).toBe("v2Service");
    const domain = service.children[0];
    expect(domain.id).toBe("order2");
    expect(domain.children[0].id).toBe("placeOrder3");
  });

  it("accepts Japanese string identifiers for organization and team", () => {
    const result = Parser.parse(`
organization "Corp社" {
  team "EC開発チーム" {
    owns ECommerce
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const org = result.value.organizations[0];
    expect(org.id).toBe("Corp社");
    const team = org.teams[0];
    expect(team.id).toBe("EC開発チーム");
    expect(team.properties.owns).toEqual(["ECommerce"]);
  });

  it("accepts Japanese string identifier for member", () => {
    const result = Parser.parse(`
organization "Corp社" {
  team "EC開発チーム" {
    member "山田太郎" {
      slack "@yamada"
      github "yamada-taro"
    }
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const member = result.value.organizations[0].teams[0].children.find(
      (c) => c.kind === "member",
    )!;
    expect(member.id).toBe("山田太郎");
    expect(member.properties.slack).toBe("@yamada");
    expect(member.properties.github).toBe("yamada-taro");
  });

  it("owns references work with camelCase ids", () => {
    const result = Parser.parse(`
organization Corp {
  team ecTeam {
    owns ECommerce
    owns PaymentService
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value.organizations[0].teams[0].properties.owns).toEqual([
      "ECommerce",
      "PaymentService",
    ]);
  });

  it("owns references work with string literal ids", () => {
    const result = Parser.parse(`
organization "corp" {
  team "ec-team" {
    owns "e-commerce"
    owns "payment-service"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value.organizations[0].teams[0].properties.owns).toEqual([
      "e-commerce",
      "payment-service",
    ]);
  });

  it("owns references work with mixed camelCase and string literal ids", () => {
    const result = Parser.parse(`
organization Corp {
  team ecTeam {
    owns ECommerce
    owns "payment-service"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value.organizations[0].teams[0].properties.owns).toEqual([
      "ECommerce",
      "payment-service",
    ]);
  });

  it("ownerIndex is built correctly with camelCase team id and string literal owns", () => {
    const result = Parser.parse(`
system S {
  service "e-commerce" {}
}
organization Corp {
  team ecTeam {
    owns "e-commerce"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value.ownerIndex.get("e-commerce")).toBe("ecTeam");
  });

  it("edge supports mixed camelCase and string literal endpoint ids", () => {
    const result = Parser.parse(`
system Test {
  service MyService {}
  service "payment-gateway" {}
  MyService -> "payment-gateway" "決済を呼び出す"
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const edge = result.value.systems[0].edges[0];
    expect(edge.from).toBe("MyService");
    expect(edge.to).toBe("payment-gateway");
    expect(edge.label).toBe("決済を呼び出す");
  });

  it("parses sampleKrs from getReference() without errors", () => {
    const { sampleKrs } = getReference();
    const result = Parser.parse(sampleKrs);
    // sampleKrs has 4 non-external inline resources → 4 "unassigned-resource" warnings.
    // The 4 [external]-tagged inline resources are suppressed and emit no warning.
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
    const warnings = result.diagnostics.filter((d) => d.severity === "warning");
    expect(warnings).toHaveLength(4);
    expect(
      warnings.every((w) => formatDiagnostic(w).includes("is not assigned to any database")),
    ).toBe(true);
    expect(result.value.systems).toHaveLength(1);
    expect(result.value.deploys).toHaveLength(1);
    expect(result.value.organizations).toHaveLength(1);
  });

  describe("nodePathIndex", () => {
    it("builds paths with system ID prefix for direct children of system", () => {
      const result = Parser.parse(`
system EC {
  service Payment {}
  service Order {}
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      expect(result.value.nodePathIndex.get("Payment")).toEqual(["EC", "Payment"]);
      expect(result.value.nodePathIndex.get("Order")).toEqual(["EC", "Order"]);
    });

    it("builds multi-level paths including system ID for nested nodes", () => {
      const result = Parser.parse(`
system EC {
  service Payment {
    domain Checkout {}
  }
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      expect(result.value.nodePathIndex.get("Payment")).toEqual(["EC", "Payment"]);
      expect(result.value.nodePathIndex.get("Checkout")).toEqual(["EC", "Payment", "Checkout"]);
    });

    it("does not include the system node itself in the index", () => {
      const result = Parser.parse(`
system EC {
  service Payment {}
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      expect(result.value.nodePathIndex.has("EC")).toBe(false);
    });

    it("errors on duplicate node id under the same parent", () => {
      const result = Parser.parse(`
system EC {
  service Payment {}
  service Payment {}
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(formatDiagnostic(errors[0])).toContain("Payment");
    });

    it("errors on cross-scope duplicate domain id and keeps first path", () => {
      const result = Parser.parse(`
system EC {
  service Payment {
    domain Checkout {}
  }
  service Order {
    domain Checkout {}
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(formatDiagnostic(errors[0])).toContain("Checkout");
      expect(result.value.nodePathIndex.get("Checkout")).toEqual(["EC", "Payment", "Checkout"]);
    });

    it("does not error when the same domain id appears in different systems", () => {
      const result = Parser.parse(`
system A {
  service S1 {
    domain Order {}
  }
}
system B {
  service S2 {
    domain Order {}
  }
}
      `);
      const errors = result.diagnostics.filter(
        (d) => d.severity === "error" && formatDiagnostic(d).includes("Order"),
      );
      expect(errors).toHaveLength(0);
    });

    it("allows duplicate domain id when one has @deprecated annotation, indexes non-deprecated path", () => {
      const result = Parser.parse(`
system EC {
  service Legacy {
    domain Contract @deprecated {}
  }
  service New {
    domain Contract {}
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toHaveLength(0);
      // Non-annotated domain (priority 1) wins over @deprecated (priority 0)
      expect(result.value.nodePathIndex.get("Contract")).toEqual(["EC", "New", "Contract"]);
    });

    it("allows duplicate domain id when @deprecated appears second, index still points to non-deprecated", () => {
      const result = Parser.parse(`
system EC {
  service New {
    domain Contract {}
  }
  service Legacy {
    domain Contract @deprecated {}
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toHaveLength(0);
      expect(result.value.nodePathIndex.get("Contract")).toEqual(["EC", "New", "Contract"]);
    });

    it("allows duplicate domain id when one has @migration_target, indexes migration_target path", () => {
      const result = Parser.parse(`
system EC {
  service Legacy {
    domain Contract @deprecated {}
  }
  service New {
    domain Contract @migration_target {}
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toHaveLength(0);
      // @migration_target (priority 2) wins over @deprecated (priority 0)
      expect(result.value.nodePathIndex.get("Contract")).toEqual(["EC", "New", "Contract"]);
    });

    it("@migration_target wins the index even when it appears first", () => {
      const result = Parser.parse(`
system EC {
  service New {
    domain Contract @migration_target {}
  }
  service Legacy {
    domain Contract @deprecated {}
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toHaveLength(0);
      expect(result.value.nodePathIndex.get("Contract")).toEqual(["EC", "New", "Contract"]);
    });

    it("allows duplicate domain id when only @migration_target is present (no @deprecated)", () => {
      const result = Parser.parse(`
system EC {
  service New {
    domain Contract @migration_target {}
  }
  service Other {
    domain Contract {}
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toHaveLength(0);
    });

    it("allows duplicate domain id when parent services carry migration annotations (inherited)", () => {
      // Domains have no annotations of their own; the migration annotations
      // live on the parent services. The duplicate-id check must honour this
      // inheritance so the user is not forced to re-annotate every domain.
      const result = Parser.parse(`
system EC {
  service Legacy @deprecated {
    domain Contract {}
  }
  service New @migration_target {
    domain Contract {}
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toHaveLength(0);
      // @migration_target (priority 2, inherited) wins over @deprecated (priority 0, inherited)
      expect(result.value.nodePathIndex.get("Contract")).toEqual(["EC", "New", "Contract"]);
    });

    it("inherited @deprecated + explicit non-annotated is legal, non-annotated wins", () => {
      const result = Parser.parse(`
system EC {
  service Legacy @deprecated {
    domain Contract {}
  }
  service New {
    domain Contract {}
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toHaveLength(0);
      expect(result.value.nodePathIndex.get("Contract")).toEqual(["EC", "New", "Contract"]);
    });

    it("explicit domain annotation overrides parent service annotation in priority", () => {
      // Service is @migration_target, but the domain explicitly overrides with
      // @deprecated — the explicit domain annotation wins (replace, not merge).
      const result = Parser.parse(`
system EC {
  service Svc @migration_target {
    domain Contract @deprecated {}
  }
  service Other {
    domain Contract {}
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toHaveLength(0);
      // Non-annotated domain in Other (priority 1) wins over @deprecated (priority 0)
      expect(result.value.nodePathIndex.get("Contract")).toEqual(["EC", "Other", "Contract"]);
    });

    it("still errors when both duplicate domain ids have no migration annotation", () => {
      const result = Parser.parse(`
system EC {
  service A {
    domain Checkout {}
  }
  service B {
    domain Checkout {}
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(formatDiagnostic(errors[0])).toContain("Checkout");
    });

    it("warns when owns references an id not found in the system hierarchy", () => {
      const result = Parser.parse(`
system EC {
  service Payment {}
}
organization Corp {
  team backend {
    owns Ghost
  }
}
      `);
      const warnings = result.diagnostics.filter((d) => d.severity === "warning");
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(formatDiagnostic(warnings[0])).toContain("Ghost");
    });

    it("produces no warning when owns references a known node id", () => {
      const result = Parser.parse(`
system EC {
  service Payment {}
}
organization Corp {
  team backend {
    owns Payment
  }
}
      `);
      expect(result.diagnostics).toHaveLength(0);
    });

    it("coexists correctly with ownerIndex", () => {
      const result = Parser.parse(`
system EC {
  service Payment {}
}
organization Corp {
  team backend {
    owns Payment
  }
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      expect(result.value.ownerIndex.get("Payment")).toBe("backend");
      expect(result.value.nodePathIndex.get("Payment")).toEqual(["EC", "Payment"]);
    });
  });

  describe("top-level domain declarations", () => {
    it("parses a single top-level domain", () => {
      const result = Parser.parse(`
domain Payment { label "決済" }
      `);
      expect(result.diagnostics).toHaveLength(0);
      expect(result.value.domains).toHaveLength(1);
      const domain = result.value.domains[0] as DomainNode;
      expect(domain.kind).toBe("domain");
      expect(domain.id).toBe("Payment");
      expect(domain.label).toBe("決済");
    });

    it("parses multiple top-level domains", () => {
      const result = Parser.parse(`
domain Payment { label "決済" }
domain Inventory { label "在庫" }
      `);
      expect(result.diagnostics).toHaveLength(0);
      expect(result.value.domains).toHaveLength(2);
      expect(result.value.domains[0].id).toBe("Payment");
      expect(result.value.domains[1].id).toBe("Inventory");
    });

    it("parses top-level domains mixed with system blocks", () => {
      const result = Parser.parse(`
domain Payment { label "決済" }

system ECPlatform {
  service ECommerce {
    domain Order { label "注文" }
  }
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      expect(result.value.domains).toHaveLength(1);
      expect(result.value.domains[0].id).toBe("Payment");
      expect(result.value.systems).toHaveLength(1);
      const service = result.value.systems[0].children[0] as ServiceNode;
      expect(service.children[0].id).toBe("Order");
    });

    it("parses top-level domain with children", () => {
      const result = Parser.parse(`
domain Payment {
  label "決済"
  usecase ProcessPayment { label "支払い処理" }
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      expect(result.value.domains).toHaveLength(1);
      expect(result.value.domains[0].children).toHaveLength(1);
      expect(result.value.domains[0].children[0].id).toBe("ProcessPayment");
    });
  });
});

describe("cross-system edge references", () => {
  it("parses fully qualified edge target (System.Service) at system level", () => {
    const result = Parser.parse(`
system ECPlatform {
  service OrderService {}
  OrderService -> PaymentGateway.PaymentService "決済を依頼する"
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const edges = result.value.systems[0].edges;
    expect(edges).toHaveLength(1);
    expect(edges[0].from).toBe("OrderService");
    expect(edges[0].to).toBe("PaymentGateway.PaymentService");
    expect(edges[0].label).toBe("決済を依頼する");
  });

  it("parses qualified edge without label", () => {
    const result = Parser.parse(`
system ECPlatform {
  service OrderService {}
  OrderService -> PaymentGateway.PaymentService
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const edges = result.value.systems[0].edges;
    expect(edges).toHaveLength(1);
    expect(edges[0].to).toBe("PaymentGateway.PaymentService");
  });

  it("parses async qualified edge (-->)", () => {
    const result = Parser.parse(`
system ECPlatform {
  service OrderService {}
  OrderService --> PaymentGateway.NotifyService
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const edge = result.value.systems[0].edges[0];
    expect(edge.to).toBe("PaymentGateway.NotifyService");
    expect(edge.kind).toBe("async");
  });

  // ─── Infra resource blocks (database / queue / storage) ───────────────────

  describe("database block", () => {
    it("parses a database block with table sub-resources", () => {
      const result = Parser.parse(`
system ECPlatform {
  database OrderDB {
    table OrderTable { label "注文テーブル" }
    table InventoryTable { label "在庫テーブル" }
  }
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      const system = result.value.systems[0];
      expect(system.children).toHaveLength(1);
      const db = system.children[0];
      expect(db.kind).toBe("database");
      expect(db.id).toBe("OrderDB");
      expect(db.children).toHaveLength(2);
      expect(db.children[0].kind).toBe("table");
      expect(db.children[0].id).toBe("OrderTable");
      expect(db.children[0].label).toBe("注文テーブル");
      expect(db.children[1].kind).toBe("table");
      expect(db.children[1].id).toBe("InventoryTable");
    });

    it("parses a database block with label property", () => {
      const result = Parser.parse(`
system ECPlatform {
  database OrderDB {
    label "注文DB"
    table OrderTable { label "注文テーブル" }
  }
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      const db = result.value.systems[0].children[0];
      expect(db.kind).toBe("database");
      expect(db.label).toBe("注文DB");
    });
  });

  describe("queue block", () => {
    it("parses a queue block with queue sub-resources", () => {
      const result = Parser.parse(`
system ECPlatform {
  queue EventBus {
    queue OrderCreated { label "注文作成イベント" }
    queue OrderShipped { label "注文発送イベント" }
  }
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      const system = result.value.systems[0];
      const queueGroup = system.children[0];
      expect(queueGroup.kind).toBe("queue");
      expect(queueGroup.id).toBe("EventBus");
      expect(queueGroup.children).toHaveLength(2);
      expect(queueGroup.children[0].kind).toBe("queue-item");
      expect(queueGroup.children[0].id).toBe("OrderCreated");
      expect(queueGroup.children[0].label).toBe("注文作成イベント");
    });
  });

  describe("storage block", () => {
    it("parses a storage block with bucket sub-resources", () => {
      const result = Parser.parse(`
system ECPlatform {
  storage MediaStorage {
    bucket ImageBucket { label "商品画像バケット" }
  }
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      const storage = result.value.systems[0].children[0];
      expect(storage.kind).toBe("storage");
      expect(storage.id).toBe("MediaStorage");
      expect(storage.children).toHaveLength(1);
      expect(storage.children[0].kind).toBe("bucket");
      expect(storage.children[0].id).toBe("ImageBucket");
      expect(storage.children[0].label).toBe("商品画像バケット");
    });
  });

  describe("resource dot-notation reference", () => {
    it("parses resource with dot-notation and sets ref", () => {
      const result = Parser.parse(`
system ECPlatform {
  database OrderDB {
    table OrderTable { label "注文テーブル" }
  }
  service A {
    domain X {
      usecase PlaceOrder {
        resource OrderDB.OrderTable
      }
    }
  }
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      const usecase = result.value.systems[0].children[1].children[0].children[0];
      expect(usecase.kind).toBe("usecase");
      const resourceNode = usecase.children[0];
      expect(resourceNode.kind).toBe("resource");
      expect(resourceNode.id).toBe("OrderDB.OrderTable");
      assert(resourceNode.kind === "resource");
      expect(resourceNode.ref).toEqual({ parent: "OrderDB", child: "OrderTable" });
    });

    it("parses multiple dot-notation references in one usecase", () => {
      const result = Parser.parse(`
system ECPlatform {
  database OrderDB {
    table OrderTable { label "注文テーブル" }
    table InventoryTable { label "在庫テーブル" }
  }
  queue EventBus {
    queue OrderCreated { label "注文作成イベント" }
  }
  storage MediaStorage {
    bucket ImageBucket { label "商品画像バケット" }
  }
  service A {
    domain X {
      usecase PlaceOrder {
        resource OrderDB.OrderTable
        resource OrderDB.InventoryTable
        resource EventBus.OrderCreated
        resource MediaStorage.ImageBucket
      }
    }
  }
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      const usecase = result.value.systems[0].children[3].children[0].children[0];
      expect(usecase.children).toHaveLength(4);
      for (const child of usecase.children) {
        expect(child.kind).toBe("resource");
        assert(child.kind === "resource");
        expect(child.ref).toBeDefined();
      }
    });

    it("emits no warning for dot-notation resource references", () => {
      const result = Parser.parse(`
system ECPlatform {
  database OrderDB {
    table OrderTable { label "注文テーブル" }
  }
  service A {
    domain X {
      usecase B {
        resource OrderDB.OrderTable
      }
    }
  }
}
      `);
      const warnings = result.diagnostics.filter((d) => d.severity === "warning");
      expect(warnings).toHaveLength(0);
    });
  });

  describe("unassigned-resource warning", () => {
    it("emits warning for inline resource not assigned to a database", () => {
      const result = Parser.parse(`
system ECPlatform {
  service A {
    domain X {
      usecase B {
        resource OrderTable { label "注文テーブル" }
      }
    }
  }
}
      `);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe("warning");
      expect(formatDiagnostic(result.diagnostics[0])).toBe(
        `resource "OrderTable" is not assigned to any database`,
      );
    });

    it("emits one warning per unassigned inline resource", () => {
      const result = Parser.parse(`
system ECPlatform {
  service A {
    domain X {
      usecase B {
        resource TableA { label "A" }
        resource TableB { label "B" }
        resource TableC { label "C" }
      }
    }
  }
}
      `);
      const warnings = result.diagnostics.filter((d) => d.severity === "warning");
      expect(warnings).toHaveLength(3);
    });

    it("emits only a warning (not error) for unresolved dot-notation reference", () => {
      // database OrderDB is not declared but resource OrderDB.C is referenced
      const result = Parser.parse(`
system ECPlatform {
  service A {
    domain X {
      usecase B {
        resource OrderDB.C
      }
    }
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toHaveLength(0);
      // No warning for dot-notation: unresolved reference check is deferred to a later phase
      const warnings = result.diagnostics.filter((d) => d.severity === "warning");
      expect(warnings).toHaveLength(0);
    });

    it("does not emit warning for [external]-tagged inline resource", () => {
      const result = Parser.parse(`
system ECPlatform {
  service A {
    domain X {
      usecase B {
        resource InventoryAPI [external] { label "在庫API" }
        resource PaymentAPI [external] { label "決済API" }
      }
    }
  }
}
      `);
      // [external] resources intentionally have no database parent — no warning
      const warnings = result.diagnostics.filter((d) => d.severity === "warning");
      expect(warnings).toHaveLength(0);
    });

    it("emits warning for non-external inline resource but not for external sibling", () => {
      const result = Parser.parse(`
system ECPlatform {
  service A {
    domain X {
      usecase B {
        resource OrderTable { label "注文テーブル" }
        resource ExternalAPI [external] { label "外部API" }
      }
    }
  }
}
      `);
      const warnings = result.diagnostics.filter((d) => d.severity === "warning");
      expect(warnings).toHaveLength(1);
      expect(formatDiagnostic(warnings[0])).toContain("OrderTable");
    });
  });

  describe("infra block placement validation", () => {
    it("emits error when database appears inside service block", () => {
      const result = Parser.parse(`
system ECPlatform {
  service A {
    database OrderDB {
      table OrderTable { label "注文テーブル" }
    }
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors.length).toBeGreaterThan(0);
      expect(formatDiagnostic(errors[0])).toContain(
        '"database" is only valid as a direct child of system',
      );
    });

    it("emits error when queue appears inside domain block", () => {
      const result = Parser.parse(`
system ECPlatform {
  service A {
    domain X {
      queue EventBus {
        queue OrderCreated { label "注文イベント" }
      }
    }
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors.length).toBeGreaterThan(0);
      expect(formatDiagnostic(errors[0])).toContain(
        '"queue" is only valid as a direct child of system',
      );
    });

    it("emits error when storage appears inside usecase block", () => {
      const result = Parser.parse(`
system ECPlatform {
  service A {
    domain X {
      usecase B {
        storage MediaStorage {
          bucket ImageBucket { label "画像バケット" }
        }
      }
    }
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors.length).toBeGreaterThan(0);
      expect(formatDiagnostic(errors[0])).toContain(
        '"storage" is only valid as a direct child of system',
      );
    });

    it("emits error when infra block appears inside sub-resource body", () => {
      const result = Parser.parse(`
system ECPlatform {
  database OrderDB {
    table OrderTable {
      database NestedDB { }
    }
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => formatDiagnostic(e).includes("Sub-resource nodes"))).toBe(true);
    });
  });

  describe("full database/queue/storage + usecase integration", () => {
    it("parses the complete design doc example without diagnostics", () => {
      const result = Parser.parse(`
system ECPlatform {
  database OrderDB {
    table OrderTable { label "注文テーブル" }
    table InventoryTable { label "在庫テーブル" }
  }
  queue EventBus {
    queue OrderCreated { label "注文作成イベント" }
  }
  storage MediaStorage {
    bucket ImageBucket { label "商品画像バケット" }
  }

  service OrderService {
    domain Order {
      usecase PlaceOrder {
        resource OrderDB.OrderTable
        resource OrderDB.InventoryTable
        resource EventBus.OrderCreated
        resource MediaStorage.ImageBucket
      }
    }
  }
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      const system = result.value.systems[0];
      // 4 top-level children: database, queue, storage, service
      expect(system.children).toHaveLength(4);
      expect(system.children[0].kind).toBe("database");
      expect(system.children[1].kind).toBe("queue");
      expect(system.children[2].kind).toBe("storage");
      expect(system.children[3].kind).toBe("service");
    });
  });

  describe("validateOwnsReferences with infra-only files", () => {
    it("emits owns-target-not-found when only top-level database exists and owns references a missing id", () => {
      const result = Parser.parse(`
database OrderDB {}

organization Corp {
  team backend {
    owns OrderDB
    owns NonExistentDB
  }
}
      `);
      const warnings = result.diagnostics.filter(
        (d) => d.severity === "warning" && d.code === "owns-target-not-found",
      );
      expect(warnings).toHaveLength(1);
      if (warnings[0].code !== "owns-target-not-found") throw new Error("code mismatch");
      expect(warnings[0].params.ownedId).toBe("NonExistentDB");
    });

    it("does not emit owns-target-not-found when owns correctly references a top-level database", () => {
      const result = Parser.parse(`
database OrderDB {}

organization Corp {
  team backend {
    owns OrderDB
  }
}
      `);
      const warnings = result.diagnostics.filter(
        (d) => d.severity === "warning" && d.code === "owns-target-not-found",
      );
      expect(warnings).toHaveLength(0);
    });
  });
});
