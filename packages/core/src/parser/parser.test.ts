import { describe, it, expect, assert } from "vitest";
import { Parser } from "./parser.js";
import { getReference } from "../builtins/reference.js";
import type {
  ClientNode,
  DomainNode,
  KrsFile,
  KrsNode,
  ServiceNode,
  UserNode,
} from "../types/ast.js";

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
    // After path-import support (#927) ids are stored as `string[][]`.
    // Bare ids parse to single-segment paths.
    expect(result.value.nodeImports[0].ids).toEqual([["ECommerce"], ["Payment"]]);
    expect(result.value.nodeImports[0].path).toBe("ec.krs");
  });

  it("parses path-syntax import declaration (Sys.Svc.Dom)", () => {
    const result = Parser.parse('import { ECPlatform.ECommerce.Order } from "services.krs"');
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value.nodeImports[0].ids).toEqual([["ECPlatform", "ECommerce", "Order"]]);
  });

  it("mixes bare ids and path imports in one block", () => {
    const result = Parser.parse('import { Foo, Sys.Bar } from "x.krs"');
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value.nodeImports[0].ids).toEqual([["Foo"], ["Sys", "Bar"]]);
  });

  it("emits expected-identifier when a path ends with a trailing dot", () => {
    const result = Parser.parse('import { Sys. } from "x.krs"');
    expect(result.diagnostics.length).toBeGreaterThan(0);
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

  it("parses recognized annotation params (until / from) and keeps the name list (#1568)", () => {
    const result = Parser.parse(`
system Test {
  service Legacy @deprecated(until: "2026-Q3")
  service NewSvc @migration_target(from: Legacy)
}
    `);
    expect(result.diagnostics.filter((d) => d.severity !== "info")).toHaveLength(0);
    const legacy = result.value.systems[0].children[0];
    const newSvc = result.value.systems[0].children[1];
    // The name list is unchanged (existing consumers unaffected)...
    expect(legacy.annotations).toEqual(["deprecated"]);
    expect(newSvc.annotations).toEqual(["migration_target"]);
    // ...and params are captured per annotation name.
    expect(legacy.annotationParams).toEqual({ deprecated: { until: "2026-Q3" } });
    expect(newSvc.annotationParams).toEqual({ migration_target: { from: "Legacy" } });
  });

  it("accepts an opaque (non-date) until value without a warning (graceful degradation)", () => {
    const result = Parser.parse(`
system Test {
  service Legacy @deprecated(until: "sometime next year")
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const legacy = result.value.systems[0].children[0];
    expect(legacy.annotationParams).toEqual({ deprecated: { until: "sometime next year" } });
  });

  it("warns and drops an unsupported annotation param, leaving annotationParams unset", () => {
    const result = Parser.parse(`
system Test {
  service Beta @new(until: "2026-Q3")
}
    `);
    const warns = result.diagnostics.filter((d) => d.code === "annotation-param-unsupported");
    expect(warns).toHaveLength(1);
    expect(warns[0].severity).toBe("warning");
    expect(JSON.stringify(warns[0].params)).toContain("until");
    const beta = result.value.systems[0].children[0];
    expect(beta.annotations).toEqual(["new"]);
    expect(beta.annotationParams).toBeUndefined();
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
    expect(JSON.stringify(errors[0].params)).toContain("OtherDomain");
    expect(JSON.stringify(errors[0].params)).toContain("Contract");
  });

  it("errors on async (-->) explicit edge source mismatch in service/domain block (#1623)", () => {
    const result = Parser.parse(`
system Test {
  service S {
    domain Contract {
      OtherDomain --> Billing
    }
  }
}
    `);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors.some((d) => d.code === "edge-source-mismatch")).toBe(true);
    expect(JSON.stringify(errors[0].params)).toContain("OtherDomain");
    expect(JSON.stringify(errors[0].params)).toContain("Contract");
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

  it("allows a domain edge whose target is another service's domain (source = enclosing) (#1623)", () => {
    const result = Parser.parse(`
system Test {
  service ECommerce {
    domain Contract { label "Contract" }
  }
  service BillingService {
    domain Billing {
      Billing -> Contract "Created from a contract"
    }
  }
}
    `);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
    const billing = result.value.systems[0].children[1].children[0];
    expect(billing.edges[0].from).toBe("Billing");
    expect(billing.edges[0].to).toBe("Contract");
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

  it("parses a `store` deploy unit with type + realizes", () => {
    const result = Parser.parse(`
deploy Production {
  store orderStore {
    label "Order DB"
    type "Aurora PostgreSQL 15"
    realizes OrderDB
  }
}
    `);
    expect(result.value.deploys).toHaveLength(1);
    const store = result.value.deploys[0].nodes[0];
    expect(store.kind).toBe("store");
    expect(store.id).toBe("orderStore");
    expect(store.label).toBe("Order DB");
    expect(store.properties.type).toBe("Aurora PostgreSQL 15");
    expect(store.properties.realizes).toEqual(["OrderDB"]);
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

  it("parses client resources with all whitelisted storage kinds", () => {
    const result = Parser.parse(`
system S {
  client WebApp [web] {
    resource localStorage "preferences"
    resource sessionStorage "view-state"
    resource indexedDB "outbox"
    resource opfs "drafts"
    resource file "config.json"
    resource keychain "auth-token"
  }
}
    `);
    expect(result.diagnostics).toEqual([]);
    const client = result.value.systems[0].children[0] as ClientNode;
    expect(client.properties.resources).toHaveLength(6);
    expect(client.properties.resources.map((r) => r.storageKind)).toEqual([
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "opfs",
      "file",
      "keychain",
    ]);
    expect(client.properties.resources[0].name).toBe("preferences");
  });

  it("rejects unknown client resource kind", () => {
    const result = Parser.parse(`
system S {
  client WebApp [web] {
    resource cookie "session"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe("client-resource-invalid-kind");
    expect(JSON.stringify(result.diagnostics[0].params)).toContain("cookie");
  });

  it("client without resource block parses with empty resources", () => {
    const result = Parser.parse(`system S { client X [web] }`);
    expect(result.diagnostics).toEqual([]);
    const client = result.value.systems[0].children[0] as ClientNode;
    expect(client.properties.resources).toEqual([]);
    expect(client.properties.capabilities).toEqual([]);
  });

  it("parses flat client capabilities", () => {
    const result = Parser.parse(`
system S {
  client App [mobile] {
    capability camera
    capability geolocation
    capability notification
  }
}
    `);
    expect(result.diagnostics).toEqual([]);
    const client = result.value.systems[0].children[0] as ClientNode;
    expect(client.properties.capabilities.map((c) => c.name)).toEqual([
      "camera",
      "geolocation",
      "notification",
    ]);
    expect(client.properties.capabilities[0].label).toBeUndefined();
    expect(client.properties.capabilities[0].description).toBeUndefined();
  });

  it("parses block-form capability with label and description", () => {
    const result = Parser.parse(`
system S {
  client App [mobile] {
    capability camera {
      label "QR scanning"
      description "Used to scan QR codes on inspection items"
    }
  }
}
    `);
    expect(result.diagnostics).toEqual([]);
    const client = result.value.systems[0].children[0] as ClientNode;
    expect(client.properties.capabilities).toHaveLength(1);
    expect(client.properties.capabilities[0].name).toBe("camera");
    expect(client.properties.capabilities[0].label).toBe("QR scanning");
    expect(client.properties.capabilities[0].description).toBe(
      "Used to scan QR codes on inspection items",
    );
  });

  it("accepts capability identifiers outside the recommended set without warnings", () => {
    const result = Parser.parse(`
system S {
  client X [device] {
    capability remote-config-fetch
  }
}
    `);
    expect(result.diagnostics).toEqual([]);
    const client = result.value.systems[0].children[0] as ClientNode;
    expect(client.properties.capabilities[0].name).toBe("remote-config-fetch");
  });

  it("parses capabilities mixed with resources", () => {
    const result = Parser.parse(`
system S {
  client App [mobile] {
    resource keychain "session"
    capability camera
    resource indexedDB "outbox"
    capability geolocation
  }
}
    `);
    expect(result.diagnostics).toEqual([]);
    const client = result.value.systems[0].children[0] as ClientNode;
    expect(client.properties.resources).toHaveLength(2);
    expect(client.properties.capabilities.map((c) => c.name)).toEqual(["camera", "geolocation"]);
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
    expect(result.diagnostics[0]).toMatchObject({
      code: "property-not-for-node-kind",
      params: { property: "role" },
    });
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
    expect(result.diagnostics[0]).toMatchObject({
      code: "property-not-for-node-kind",
      params: { property: "handles" },
    });
  });

  it("parses delivers property on service (single client)", () => {
    const result = Parser.parse(`
system ECPlatform {
  service NextServer {
    label "Next.js BFF"
    delivers WebApp
  }
  client WebApp [web]
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const service = result.value.systems[0].children[0] as ServiceNode;
    expect(service.properties.delivers).toEqual(["WebApp"]);
  });

  it("parses delivers property on service (comma-separated list)", () => {
    const result = Parser.parse(`
system S {
  service BFF {
    delivers WebApp, AdminUI
  }
  client WebApp [web]
  client AdminUI [desktop]
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const service = result.value.systems[0].children[0] as ServiceNode;
    expect(service.properties.delivers).toEqual(["WebApp", "AdminUI"]);
  });

  it("rejects delivers property on non-service kinds", () => {
    const result = Parser.parse(`
system S {
  client WebApp [web] {
    delivers OtherClient
  }
}
    `);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]).toMatchObject({
      code: "property-not-for-node-kind",
      params: { property: "delivers" },
    });
  });

  it("rejects the removed team property on service", () => {
    const result = Parser.parse(`
system Test {
  service ECommerce {
    team "EC開発チーム"
  }
}
    `);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].severity).toBe("error");
    expect(result.diagnostics[0].code).toBe("team-property-removed");
    const service = result.value.systems[0].children[0] as ServiceNode;
    expect(service.kind).toBe("service");
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

  // #1525 / TPL-168: link URLs are untrusted input rendered as
  // <a href> in the app and the VS Code webview. A disallowed scheme must be
  // reported with a dedicated warning at the parse boundary, but the link is
  // KEPT in the AST so Format / round-trip never silently deletes the user's
  // source — the href-render surfaces filter it out with isSafeLinkUrl.
  describe("link URL scheme allowlist (#1525)", () => {
    function parseServiceLink(url: string) {
      return Parser.parse(`
system Test {
  service ECommerce {
    link "${url}" "doc"
  }
}
      `);
    }

    it("accepts mailto links without a warning", () => {
      const result = parseServiceLink("mailto:team@example.com");
      expect(result.diagnostics).toHaveLength(0);
      const service = result.value.systems[0].children[0] as ServiceNode;
      expect(service.properties.links).toHaveLength(1);
    });

    it("warns on a javascript: link but keeps it in the AST", () => {
      const result = parseServiceLink("javascript:alert(1)");
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe("warning");
      expect(result.diagnostics[0].code).toBe("link-url-scheme-not-allowed");
      expect(result.diagnostics[0].params).toEqual({
        url: "javascript:alert(1)",
        scheme: "javascript:",
      });
      // Kept so Format does not delete the user's line; renderers filter it.
      const service = result.value.systems[0].children[0] as ServiceNode;
      expect(service.properties.links).toHaveLength(1);
      expect(service.properties.links[0].url).toBe("javascript:alert(1)");
    });

    it("normalizes scheme case before the check (JaVaScRiPt:)", () => {
      const result = parseServiceLink("JaVaScRiPt:alert(1)");
      expect(result.diagnostics[0]?.code).toBe("link-url-scheme-not-allowed");
    });

    it("warns on other absolute schemes (data:)", () => {
      const result = parseServiceLink("data:text/html,<script>alert(1)</script>");
      expect(result.diagnostics[0]?.code).toBe("link-url-scheme-not-allowed");
    });

    it("warns on relative paths (not an absolute URL) but keeps them", () => {
      const result = parseServiceLink("docs/readme.md");
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].code).toBe("link-url-scheme-not-allowed");
      expect(result.diagnostics[0].params).toEqual({ url: "docs/readme.md", scheme: "" });
      const service = result.value.systems[0].children[0] as ServiceNode;
      expect(service.properties.links).toHaveLength(1);
    });

    it("warns only on the unsafe link when a node mixes safe and unsafe", () => {
      const result = Parser.parse(`
system Test {
  service ECommerce {
    link "https://wiki.example.com/ec" "wiki"
    link "javascript:alert(1)" "evil"
  }
}
      `);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].code).toBe("link-url-scheme-not-allowed");
      // Both links survive parsing; only the rendered surfaces drop the unsafe one.
      const service = result.value.systems[0].children[0] as ServiceNode;
      expect(service.properties.links.map((l) => l.url)).toEqual([
        "https://wiki.example.com/ec",
        "javascript:alert(1)",
      ]);
    });
  });

  // Round-trip safety (#1525 review): an authored link with a disallowed scheme
  // must survive Format, not be silently deleted from the user's source.
  describe("link with disallowed scheme is preserved in the AST for round-trip", () => {
    it("keeps a relative-path link so the formatter can re-emit it", () => {
      const result = Parser.parse(`
system Test {
  service ECommerce {
    link "./architecture.md" "diagram"
  }
}
      `);
      const service = result.value.systems[0].children[0] as ServiceNode;
      expect(service.properties.links).toHaveLength(1);
      expect(service.properties.links[0].url).toBe("./architecture.md");
      expect(service.properties.links[0].label).toBe("diagram");
    });
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
    // The "unassigned-resource" warning is now raised by the resolver
    // (`analyze()`), not the parser — parsing itself is clean.
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
    expect(result.diagnostics[0].code).toBe("team-property-removed");
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
    expect(result.diagnostics[0].severity).toBe("error");
    expect(result.diagnostics[0].code).toBe("team-property-removed");
    expect(result.value.services).toHaveLength(1);
    const service = result.value.services[0];
    expect(service.kind).toBe("service");
    expect(service.id).toBe("Monitoring");
    expect(service.label).toBe("監視サービス");
    expect(service.properties.description).toBe("配置先のシステムが未定");
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
    // team is a removed property → error diagnostic
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].severity).toBe("error");
    expect(result.diagnostics[0].code).toBe("team-property-removed");
    const service = result.value.systems[0].children[0] as ServiceNode;
    expect(service.properties.description).toBe("商品管理");
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
  team backend {
    label "バックエンドチーム"
    owns ECommerce
    owns Order

    member alice {
      label "Alice"
      slack "@alice"
      github "alice-dev"
    }
    member bob {
      label "Bob"
      description "SRE担当"
    }
  }
  team frontend {
    label "フロントエンドチーム"
    owns WebApp
    member carol {
      label "Carol"
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
  team platform {
    label "プラットフォーム"
    team infra {
      label "インフラ"
      member dave { label "Dave" }
    }
    team security { label "セキュリティ" }
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

  it("reports duplicate owns across teams as info, keeping the first team as primary owner", () => {
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
    // Co-ownership is a fact, not an integrity error (ADR-1566): info register,
    // not error. Both teams parse; ownerIndex keeps the first (first-wins).
    const dup = result.diagnostics.filter((d) => d.code === "duplicate-owner-assignment");
    expect(dup).toHaveLength(1);
    expect(dup[0].severity).toBe("info");
    expect(JSON.stringify(dup[0].params)).toContain("ECommerce");
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result.value.ownerIndex.get("ECommerce")).toBe("teamA");
  });

  it("parses annotations and annotation params on a team block", () => {
    const result = Parser.parse(`
organization Corp {
  team newOwner @migration_target(from: "legacy") {
    owns Payment
  }
}
    `);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    const team = result.value.organizations[0].teams[0];
    expect(team.annotations).toEqual(["migration_target"]);
    expect(team.annotationParams).toEqual({ migration_target: { from: "legacy" } });
  });

  it("prefers the @migration_target team as primary owner on duplicate ownership", () => {
    const result = Parser.parse(`
organization Corp {
  team legacy @deprecated {
    owns Payment
  }
  team modern @migration_target {
    owns Payment
  }
}
    `);
    // ownerIndex is 1:1; the migration destination (@migration_target) wins,
    // mirroring the domain nodePathIndex coexistence rule (#1583).
    expect(result.value.ownerIndex.get("Payment")).toBe("modern");
    const dup = result.diagnostics.filter((d) => d.code === "duplicate-owner-assignment");
    expect(dup).toHaveLength(1);
    expect(dup[0].severity).toBe("info");
    // The diagnostic names the resolved primary after the swap.
    expect(JSON.stringify(dup[0].params)).toContain("modern");
  });

  it("@migration_target team wins even when it is declared first", () => {
    const result = Parser.parse(`
organization Corp {
  team modern @migration_target {
    owns Payment
  }
  team legacy @deprecated {
    owns Payment
  }
}
    `);
    expect(result.value.ownerIndex.get("Payment")).toBe("modern");
  });

  it("keeps first-wins when neither duplicate owner carries a migration annotation", () => {
    const result = Parser.parse(`
organization Corp {
  team teamA {
    owns Payment
  }
  team teamB @deprecated {
    owns Payment
  }
}
    `);
    // teamA (unmarked, priority 1) outranks teamB (@deprecated, priority 0).
    expect(result.value.ownerIndex.get("Payment")).toBe("teamA");
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
    expect(JSON.stringify(errors[0].params)).toContain("alpha");
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

  // ─── Positional label form retirement (#2133, ADR-19) ─────────────────────

  it("positional label on organization / team / member still parses but warns", () => {
    const result = Parser.parse(`
organization Corp "Corp Label" {
  team backend "Backend Team" {
    member alice "Alice Smith" {}
  }
}
    `);
    const warnings = result.diagnostics.filter((d) => d.code === "positional-label-deprecated");
    expect(warnings.map((w) => (w.params as { construct: string }).construct)).toEqual([
      "organization",
      "team",
      "member",
    ]);
    expect(warnings.every((w) => w.severity === "warning")).toBe(true);
    // Compatibility: the value still lands in the AST.
    const org = result.value.organizations[0];
    expect(org.label).toBe("Corp Label");
    expect(org.teams[0].label).toBe("Backend Team");
    expect(org.teams[0].children.find((c) => c.kind === "member")?.label).toBe("Alice Smith");
  });

  it("label property overrides a deprecated positional label", () => {
    const result = Parser.parse(`
organization Corp {
  team backend "Positional" {
    label "Property"
  }
}
    `);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["positional-label-deprecated"]);
    expect(result.value.organizations[0].teams[0].label).toBe("Property");
  });

  it("positional label on boundary is a parse error and does not set the label", () => {
    const result = Parser.parse(`
system Shop {
  service Billing {}
}
boundary payments "Payments" {
  contains Billing
}
    `);
    const errors = result.diagnostics.filter((d) => d.code === "positional-label-removed");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
    expect((errors[0].params as { construct: string }).construct).toBe("boundary");
    // Recovery: the block body still parses past the stray string.
    const boundary = result.value.boundaries[0];
    expect(boundary.label).toBeUndefined();
    expect(boundary.contains).toEqual(["Billing"]);
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
    // sampleKrs declares an infra layer (database / queue / storage) and references
    // tables / buckets via dot notation, so no "unassigned-resource" warnings should fire.
    // The [external]-tagged inline resources are also suppressed.
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
    const warnings = result.diagnostics.filter((d) => d.severity === "warning");
    expect(warnings).toHaveLength(0);
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
      expect(JSON.stringify(errors[0].params)).toContain("Payment");
    });

    it("does not error on cross-service duplicate domain id and keeps first path", () => {
      // A domain id shared by multiple services within one system is a
      // structural fact, not a parse error (ADR-1386 — "smell is
      // representable"). The resolver surfaces it via the `domain-dispersal`
      // info diagnostic; the parser just keeps the first occurrence in the
      // nodePathIndex so navigation stays deterministic.
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
      expect(errors).toHaveLength(0);
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
        (d) => d.severity === "error" && JSON.stringify(d.params).includes("Order"),
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

    it("does not error when both duplicate domain ids have no migration annotation", () => {
      // Pre-ADR-1386 this raised `domain-id-not-unique` (error). The
      // dispersal is now informational only (`domain-dispersal`, info), so
      // the parser stays silent and keeps the first occurrence in the index.
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
      expect(errors).toHaveLength(0);
      expect(result.value.nodePathIndex.get("Checkout")).toEqual(["EC", "A", "Checkout"]);
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
      expect(JSON.stringify(warnings[0].params)).toContain("Ghost");
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

describe("boundary declarations (P2b — system-view semantic clusters)", () => {
  it("parses a boundary block with label and contains members", () => {
    const result = Parser.parse(`
system Shop {
  service Billing {}
  service Wallet {}
}
boundary payments {
  label "Payments"
  description "money movement"
  contains Billing
  contains Wallet
}
    `);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result.value.boundaries).toHaveLength(1);
    const b = result.value.boundaries[0];
    expect(b.kind).toBe("boundary");
    expect(b.id).toBe("payments");
    expect(b.label).toBe("Payments");
    expect(b.properties.description).toBe("money movement");
    expect(b.contains).toEqual(["Billing", "Wallet"]);
  });

  it("builds boundaryIndex (node id → boundary id) at parse time", () => {
    const result = Parser.parse(`
system Shop {
  service Billing {}
  service Wallet {}
}
boundary payments {
  contains Billing
  contains Wallet
}
    `);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result.value.boundaryIndex.get("Billing")).toBe("payments");
    expect(result.value.boundaryIndex.get("Wallet")).toBe("payments");
  });

  it("keeps the first-declared boundary and reports the duplicate as info (first-wins)", () => {
    const result = Parser.parse(`
system Shop {
  service Billing {}
}
boundary payments {
  contains Billing
}
boundary finance {
  contains Billing
}
    `);
    // Multi-membership is a fact, not an error: info register (mirrors
    // duplicate-owner-assignment). boundaryIndex is 1:1 and keeps the first.
    const dup = result.diagnostics.filter((d) => d.code === "duplicate-boundary-assignment");
    expect(dup).toHaveLength(1);
    expect(dup[0].severity).toBe("info");
    expect(JSON.stringify(dup[0].params)).toContain("Billing");
    // The diagnostic names the retained (first) boundary.
    expect(JSON.stringify(dup[0].params)).toContain("payments");
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result.value.boundaryIndex.get("Billing")).toBe("payments");
  });

  it("warns when contains references a node that does not exist", () => {
    const result = Parser.parse(`
system Shop {
  service Billing {}
}
boundary payments {
  contains Billing
  contains Ghost
}
    `);
    const notFound = result.diagnostics.filter((d) => d.code === "contains-target-not-found");
    expect(notFound).toHaveLength(1);
    expect(notFound[0].severity).toBe("warning");
    expect(JSON.stringify(notFound[0].params)).toContain("Ghost");
    // The existing member is still indexed.
    expect(result.value.boundaryIndex.get("Billing")).toBe("payments");
  });

  it("allows any node kind as a member (no kind restriction, unlike owns)", () => {
    const result = Parser.parse(`
system Shop {
  user Shopper {}
  client Web {}
  service Billing {}
}
boundary checkout {
  contains Shopper
  contains Web
  contains Billing
}
    `);
    expect(result.diagnostics.filter((d) => d.code === "contains-target-not-found")).toHaveLength(
      0,
    );
    expect(result.value.boundaryIndex.get("Shopper")).toBe("checkout");
    expect(result.value.boundaryIndex.get("Web")).toBe("checkout");
  });

  it("stays silent for members that render only on drill levels — no warning of any kind (#1983)", () => {
    // TPL-1608: an absence assertion fixes its scope and severity.
    // Scope: the ENTIRE diagnostics list of this parse; severity: none at any
    // level. A nested domain, a usecase, an entity, a resource, and an infra
    // leaf are all drawn (and framed) on some drill-down / entity level
    // (#1983 normalization — the per-level enumeration fence lives in
    // group-by-drilldown-render.test.ts), so `contains` referencing them is
    // fully effective and must produce no diagnostic — in particular no
    // "not groupable" ghost warning.
    const result = Parser.parse(`
system Shop {
  service Orders {
    domain OrderDomain {
      usecase PlaceOrder {
        resource OrderRes
      }
      entity OrderEntity {}
    }
  }
  database ShopDB {
    table orders
  }
}
boundary cluster {
  contains OrderDomain
  contains PlaceOrder
  contains OrderEntity
  contains OrderRes
  contains orders
}
    `);
    expect(result.diagnostics).toEqual([]);
    // …and every member is indexed (accepted vocabulary keeps its effect).
    for (const id of ["OrderDomain", "PlaceOrder", "OrderEntity", "OrderRes", "orders"]) {
      expect(result.value.boundaryIndex.get(id)).toBe("cluster");
    }
  });

  it("accepts a string-literal id and string-literal members", () => {
    const result = Parser.parse(`
system Shop {
  service Billing {}
}
boundary "payments-domain" {
  contains "Billing"
}
    `);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result.value.boundaries[0].id).toBe("payments-domain");
    expect(result.value.boundaryIndex.get("Billing")).toBe("payments-domain");
  });

  it("degenerates cleanly with an empty boundary (no members)", () => {
    const result = Parser.parse(`
boundary empty {
  label "Empty"
}
    `);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result.value.boundaries[0].contains).toEqual([]);
    expect(result.value.boundaryIndex.size).toBe(0);
  });

  it("reports a missing member id after contains without crashing", () => {
    const result = Parser.parse(`
boundary payments {
  contains
}
    `);
    expect(result.diagnostics.some((d) => d.code === "expected-id-after")).toBe(true);
  });
});

describe("top-level-declaration diagnostic (#1624)", () => {
  it("errors on a top-level user with code top-level-declaration", () => {
    const result = Parser.parse(`
user Customer [human] {
  description "A general user"
}
    `);
    const errs = result.diagnostics.filter((d) => d.code === "top-level-declaration");
    expect(errs).toHaveLength(1);
    expect(errs[0].severity).toBe("error");
    expect(errs[0].params).toEqual({ construct: "user" });
    // The construct is consumed, so no generic unexpected-token-root follows.
    expect(result.diagnostics.some((d) => d.code === "unexpected-token-root")).toBe(false);
  });

  it("errors on a top-level sync edge with code top-level-declaration", () => {
    const result = Parser.parse(`A -> B "delegates"`);
    const errs = result.diagnostics.filter((d) => d.code === "top-level-declaration");
    expect(errs).toHaveLength(1);
    expect(errs[0].params).toEqual({ construct: "edge" });
  });

  it("errors on a top-level async edge with code top-level-declaration", () => {
    const result = Parser.parse(`A --> B`);
    const errs = result.diagnostics.filter((d) => d.code === "top-level-declaration");
    expect(errs).toHaveLength(1);
    expect(errs[0].params).toEqual({ construct: "edge" });
  });

  it("does not fire for a user or edge inside a system block", () => {
    const result = Parser.parse(`
system S {
  user Customer [human]
  service A
  service B
  A -> B
}
    `);
    expect(result.diagnostics.some((d) => d.code === "top-level-declaration")).toBe(false);
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

  describe("edge author IDs (#<id>)", () => {
    it("captures #<id> on a sync edge", () => {
      const result = Parser.parse(`
system S {
  service A {}
  service B {}
  A -> B #criticalWrite
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      const edge = result.value.systems[0].edges[0];
      expect(edge.authorId).toBe("criticalWrite");
    });

    it("captures #<id> after a label and tags", () => {
      const result = Parser.parse(`
system S {
  service A {}
  service B {}
  A -> B "do work" [important] #namedEdge
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      const edge = result.value.systems[0].edges[0];
      expect(edge.label).toBe("do work");
      expect(edge.tags).toContain("important");
      expect(edge.authorId).toBe("namedEdge");
    });

    it("captures #<id> on async edges", () => {
      const result = Parser.parse(`
system S {
  service A {}
  service B {}
  A --> B #liveStream
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      const edge = result.value.systems[0].edges[0];
      expect(edge.kind).toBe("async");
      expect(edge.authorId).toBe("liveStream");
    });

    it("leaves authorId undefined when no #<id> is present", () => {
      const result = Parser.parse(`
system S {
  service A {}
  service B {}
  A -> B
}
      `);
      const edge = result.value.systems[0].edges[0];
      expect(edge.authorId).toBeUndefined();
    });

    it("captures #<id> on a usecase resource row", () => {
      const result = Parser.parse(`
system S {
  database OrderDB {
    table OrderTable {}
  }
  usecase PlaceOrder {
    resource OrderDB.OrderTable #placeOrderWrite { operations create, read }
  }
}
      `);
      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
      const usecase = result.value.systems[0].children.find((c) => c.kind === "usecase");
      if (!usecase) throw new Error("usecase not found");
      const resource = usecase.children[0];
      if (resource.kind !== "resource") throw new Error("resource kind mismatch");
      expect(resource.authorId).toBe("placeOrderWrite");
    });
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

    it("parses the [index] tag on a database block (#1718)", () => {
      const result = Parser.parse(`
system ECPlatform {
  database ProductSearch [index] {
    table Products { label "Indexed products" }
  }
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      const db = result.value.systems[0].children[0];
      expect(db.kind).toBe("database");
      expect(db.id).toBe("ProductSearch");
      expect(db.tags).toEqual(["index"]);
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

  describe("entity declarations (#1870)", () => {
    it("parses an entity as a domain child with no attributes", () => {
      const result = Parser.parse(`
system EC {
  service OrderService {
    domain Ordering {
      entity Order {
        label "注文"
      }
    }
  }
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      const domain = result.value.systems[0].children[0].children[0];
      expect(domain.kind).toBe("domain");
      const entity = domain.children[0];
      expect(entity.kind).toBe("entity");
      expect(entity.id).toBe("Order");
      expect(entity.label).toBe("注文");
      assert(entity.kind === "entity");
      expect(entity.tableRef).toBeUndefined();
    });

    it("parses a `table <Infra>.<sub>` physical mapping into tableRef", () => {
      const result = Parser.parse(`
system EC {
  database OrderDB {
    table orders { label "orders" }
  }
  service OrderService {
    domain Ordering {
      entity Order {
        table OrderDB.orders
      }
    }
  }
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      const entity = result.value.systems[0].children[1].children[0].children[0];
      assert(entity.kind === "entity");
      expect(entity.tableRef).toEqual({ parent: "OrderDB", child: "orders" });
    });

    it("emits expected-id-after when the table mapping omits the dot form", () => {
      const result = Parser.parse(`
system EC {
  service OrderService {
    domain Ordering {
      entity Order {
        table orders
      }
    }
  }
}
      `);
      const errs = result.diagnostics.filter((d) => d.code === "expected-id-after");
      expect(errs).toHaveLength(1);
    });

    it("does not persist a malformed tableRef when the infra id is omitted before the dot", () => {
      const result = Parser.parse(`
system EC {
  service OrderService {
    domain Ordering {
      entity Order {
        table .orders
      }
    }
  }
}
      `);
      // A single clean recovery diagnostic, no cascade.
      const errs = result.diagnostics.filter((d) => d.code === "expected-id-or-string");
      expect(errs).toHaveLength(1);
      const unexpected = result.diagnostics.filter((d) => d.code === "unexpected-token-in-block");
      expect(unexpected).toHaveLength(0);
      const entity = result.value.systems[0].children[0].children[0].children[0];
      assert(entity.kind === "entity");
      expect(entity.tableRef).toBeUndefined();
    });

    it("does not consume the closing brace as a sub-id when the sub-id is omitted", () => {
      const result = Parser.parse(`
system EC {
  service OrderService {
    domain Ordering {
      entity Order {
        table OrderDB.
      }
      entity Customer {}
    }
  }
}
      `);
      const entity = result.value.systems[0].children[0].children[0].children[0];
      assert(entity.kind === "entity");
      // No bogus tableRef { child: "}" }, and the sibling entity still parses.
      expect(entity.tableRef).toBeUndefined();
      const domain = result.value.systems[0].children[0].children[0];
      expect(domain.children.filter((c) => c.kind === "entity")).toHaveLength(2);
    });

    it("rejects a nested logical node child inside an entity and drops it", () => {
      const result = Parser.parse(`
system EC {
  service OrderService {
    domain Ordering {
      entity Order {
        usecase Foo {}
      }
    }
  }
}
      `);
      const errs = result.diagnostics.filter((d) => d.code === "unexpected-token-in-block");
      expect(errs).toHaveLength(1);
      const entity = result.value.systems[0].children[0].children[0].children[0];
      assert(entity.kind === "entity");
      expect(entity.children).toHaveLength(0);
    });

    it("reports a top-level entity as entity-not-in-domain without an error cascade", () => {
      const result = Parser.parse(`
entity Order {
  label "Order"
}
      `);
      const notInDomain = result.diagnostics.filter((d) => d.code === "entity-not-in-domain");
      expect(notInDomain).toHaveLength(1);
      // No unexpected-token cascade from the entity body tokens.
      const cascade = result.diagnostics.filter((d) => d.code === "unexpected-token-root");
      expect(cascade).toHaveLength(0);
    });

    it("flags a usecase and entity sharing an id under a TOP-LEVEL domain", () => {
      const result = Parser.parse(`
domain Ordering {
  usecase Order {}
  entity Order {}
}
      `);
      const dup = result.diagnostics.filter((d) => d.code === "duplicate-node-id-parent");
      expect(dup).toHaveLength(1);
    });

    it("flags duplicate entities under a domain nested in a TOP-LEVEL (system-less) service", () => {
      const result = Parser.parse(`
service OrderService {
  domain Ordering {
    entity Order {}
    entity Order {}
  }
}
      `);
      const dup = result.diagnostics.filter((d) => d.code === "duplicate-node-id-parent");
      expect(dup).toHaveLength(1);
    });

    it("parses a relation edge into the entity's edges (origin = the entity)", () => {
      const result = Parser.parse(`
system EC {
  service OrderService {
    domain Ordering {
      entity Order {
        Order -> Customer "発注者"
      }
      entity Customer {}
    }
  }
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      const order = result.value.systems[0].children[0].children[0].children[0];
      assert(order.kind === "entity");
      expect(order.edges).toHaveLength(1);
      expect(order.edges[0].from).toBe("Order");
      expect(order.edges[0].to).toBe("Customer");
    });

    it("accepts implicit-source relation edges (-> Customer) inside an entity", () => {
      const result = Parser.parse(`
system EC {
  service OrderService {
    domain Ordering {
      entity Order {
        -> Customer
      }
    }
  }
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      const order = result.value.systems[0].children[0].children[0].children[0];
      assert(order.kind === "entity");
      expect(order.edges[0].from).toBe("Order");
      expect(order.edges[0].to).toBe("Customer");
    });

    it("emits edge-source-mismatch when a relation edge does not originate at the entity", () => {
      const result = Parser.parse(`
system EC {
  service OrderService {
    domain Ordering {
      entity Order {
        Customer -> Order
      }
    }
  }
}
      `);
      const mism = result.diagnostics.filter((d) => d.code === "edge-source-mismatch");
      expect(mism).toHaveLength(1);
    });

    it("rejects an entity declared outside a domain (entity-not-in-domain)", () => {
      const result = Parser.parse(`
system EC {
  service OrderService {
    entity Order {}
  }
}
      `);
      const errs = result.diagnostics.filter((d) => d.code === "entity-not-in-domain");
      expect(errs).toHaveLength(1);
      // The stray entity is dropped, not attached to the service.
      const service = result.value.systems[0].children[0];
      expect(service.children.some((c) => c.kind === "entity")).toBe(false);
    });

    it("accepts a domain declared directly inside a system", () => {
      // A domain that belongs to the system but is not (yet) assigned to a
      // service — the in-system counterpart of the top-level unassigned domain
      // ADR-681 renders under `(Unassigned)`. #2165.
      const result = Parser.parse(`
system EC {
  domain Ordering {
    usecase PlaceOrder {}
  }
  service OrderService {}
}
      `);
      expect(result.diagnostics).toEqual([]);
      expect(result.value.systems[0].children.map((c) => c.kind)).toEqual(["domain", "service"]);
    });

    it("warns when a logical node is nested outside its parent's canContain", () => {
      const result = Parser.parse(`
system EC {
  client Web {
    usecase PlaceOrder {}
  }
}
      `);
      const misplaced = result.diagnostics.filter((d) => d.code === "node-not-in-context");
      expect(misplaced).toHaveLength(1);
      expect(misplaced[0]?.severity).toBe("warning");
      expect(misplaced[0]?.params).toEqual({ childKind: "usecase", parentKind: "client" });
      // Warning only — nothing is escalated to an error (`.krs` v1.0 is frozen).
      expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    });

    it("keeps a misplaced node in the tree so rendering is unchanged", () => {
      const result = Parser.parse(`
system EC {
  client Web {
    usecase PlaceOrder {}
  }
}
      `);
      const client = result.value.systems[0].children[0];
      expect(client.kind).toBe("client");
      expect(client.children.map((c) => c.id)).toEqual(["PlaceOrder"]);
    });

    it("flags a usecase and entity sharing an id under one domain (duplicate-node-id-parent)", () => {
      const result = Parser.parse(`
system EC {
  service OrderService {
    domain Ordering {
      usecase Order {}
      entity Order {}
    }
  }
}
      `);
      const dup = result.diagnostics.filter((d) => d.code === "duplicate-node-id-parent");
      expect(dup).toHaveLength(1);
    });
  });

  // NOTE: the `unassigned-resource` warning moved from the parser to the
  // resolver (`analyze()`) so a bare `resource <id>` can be promoted by an
  // `entity` declared elsewhere in the model. Its coverage now lives in
  // `resolver/warnings.test.ts` (see "unassigned-resource / entity resolution").

  describe("resource operations", () => {
    function findResource(file: KrsFile, id: string) {
      let found: import("../types/ast.js").ResourceNode | undefined;
      const visit = (node: KrsNode) => {
        if (node.kind === "resource" && node.id === id) {
          found = node;
          return;
        }
        for (const child of node.children) visit(child);
      };
      for (const node of file.systems) visit(node);
      assert(found, `resource ${id} not found`);
      return found;
    }

    it("accepts CRUD verbs on a resource inside a usecase", () => {
      const result = Parser.parse(`
system ECPlatform {
  service A {
    domain X {
      usecase PlaceOrder {
        resource OrderTable [external] {
          operations create, read
        }
      }
    }
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toHaveLength(0);
      const warnings = result.diagnostics.filter((d) => d.severity === "warning");
      expect(warnings).toHaveLength(0);
      const resource = findResource(result.value, "OrderTable");
      expect(resource.properties.operations).toEqual([{ verb: "create" }, { verb: "read" }]);
    });

    it("accumulates verbs across multiple operations lines", () => {
      const result = Parser.parse(`
system ECPlatform {
  service A {
    domain X {
      usecase PlaceOrder {
        resource OrderTable [external] {
          operations create
          operations read, update
        }
      }
    }
  }
}
      `);
      const resource = findResource(result.value, "OrderTable");
      expect(resource.properties.operations).toEqual([
        { verb: "create" },
        { verb: "read" },
        { verb: "update" },
      ]);
    });

    it("emits no diagnostic when operations is omitted", () => {
      const result = Parser.parse(`
system ECPlatform {
  service A {
    domain X {
      usecase PlaceOrder {
        resource OrderTable [external] { label "Order table" }
      }
    }
  }
}
      `);
      const warnings = result.diagnostics.filter((d) => d.severity === "warning");
      expect(warnings).toHaveLength(0);
      const resource = findResource(result.value, "OrderTable");
      expect(resource.properties.operations).toBeUndefined();
    });

    it("warns on unknown verbs but preserves them on the AST", () => {
      const result = Parser.parse(`
system ECPlatform {
  service A {
    domain X {
      usecase PlaceOrder {
        resource OrderTable [external] {
          operations read, fetch
        }
      }
    }
  }
}
      `);
      const warnings = result.diagnostics.filter((d) => d.severity === "warning");
      expect(warnings).toHaveLength(1);
      expect(warnings[0].code).toBe("unknown-resource-operation");
      expect(JSON.stringify(warnings[0].params)).toContain("fetch");
      const resource = findResource(result.value, "OrderTable");
      expect(resource.properties.operations).toEqual([{ verb: "read" }, { verb: "fetch" }]);
    });

    it("warns on duplicate verbs and dedupes them on the AST", () => {
      const result = Parser.parse(`
system ECPlatform {
  service A {
    domain X {
      usecase PlaceOrder {
        resource OrderTable [external] {
          operations read, read
        }
      }
    }
  }
}
      `);
      const warnings = result.diagnostics.filter((d) => d.severity === "warning");
      expect(warnings).toHaveLength(1);
      expect(warnings[0].code).toBe("duplicate-resource-operation");
      const resource = findResource(result.value, "OrderTable");
      expect(resource.properties.operations).toEqual([{ verb: "read" }]);
    });

    it("rejects operations on non-resource nodes", () => {
      const result = Parser.parse(`
system ECPlatform {
  service A {
    domain X {
      usecase PlaceOrder {
        operations create
      }
    }
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors.some((e) => e.code === "property-not-for-node-kind")).toBe(true);
    });

    it("accepts verb decoration `verb:crud` and suppresses unknown-resource-operation", () => {
      const result = Parser.parse(`
system S {
  service A {
    domain X {
      usecase U {
        resource OrderTable [external] {
          operations create, list:read, search:read
        }
      }
    }
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      const warnings = result.diagnostics.filter((d) => d.severity === "warning");
      expect(errors).toHaveLength(0);
      expect(warnings).toHaveLength(0);
      const resource = findResource(result.value, "OrderTable");
      expect(resource.properties.operations).toEqual([
        { verb: "create" },
        { verb: "list", decoratedAs: ["read"] },
        { verb: "search", decoratedAs: ["read"] },
      ]);
    });

    it("groups CRUD continuations until the next `verb:` boundary (Q1.1 rule)", () => {
      // `replace:create,delete, list:read` → replace:[C,D], list:[R]
      // `search:read,create` → search:[R,C] because `create` has no following `:`.
      const result = Parser.parse(`
system S {
  service A {
    domain X {
      usecase U {
        resource T [external] {
          operations search:read,create, list:read
        }
      }
    }
  }
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      const resource = findResource(result.value, "T");
      expect(resource.properties.operations).toEqual([
        { verb: "search", decoratedAs: ["read", "create"] },
        { verb: "list", decoratedAs: ["read"] },
      ]);
    });

    it("accepts 1:N decoration `verb:c1,c2`", () => {
      const result = Parser.parse(`
system S {
  service A {
    domain X {
      usecase U {
        resource Cache [external] {
          operations replace:create,delete, list:read
        }
      }
    }
  }
}
      `);
      expect(result.diagnostics).toHaveLength(0);
      const resource = findResource(result.value, "Cache");
      expect(resource.properties.operations).toEqual([
        { verb: "replace", decoratedAs: ["create", "delete"] },
        { verb: "list", decoratedAs: ["read"] },
      ]);
    });

    it("emits invalid-crud-decoration when RHS is not a CRUD verb", () => {
      const result = Parser.parse(`
system S {
  service A {
    domain X {
      usecase U {
        resource T [external] {
          operations list:bogus
        }
      }
    }
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("invalid-crud-decoration");
      const resource = findResource(result.value, "T");
      expect(resource.properties.operations).toEqual([{ verb: "list", decoratedAs: [] }]);
    });

    it("emits empty-crud-decoration when RHS is empty", () => {
      const result = Parser.parse(`
system S {
  service A {
    domain X {
      usecase U {
        resource T [external] {
          operations list:, create
        }
      }
    }
  }
}
      `);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors.some((e) => e.code === "empty-crud-decoration")).toBe(true);
    });

    it("emits duplicate-crud-decoration-target on `replace:create,create`", () => {
      const result = Parser.parse(`
system S {
  service A {
    domain X {
      usecase U {
        resource T [external] {
          operations replace:create,create
        }
      }
    }
  }
}
      `);
      const warnings = result.diagnostics.filter((d) => d.severity === "warning");
      expect(warnings.some((w) => w.code === "duplicate-crud-decoration-target")).toBe(true);
      const resource = findResource(result.value, "T");
      expect(resource.properties.operations).toEqual([
        { verb: "replace", decoratedAs: ["create"] },
      ]);
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
      expect(errors[0]).toMatchObject({
        code: "infra-not-in-context",
        params: { infraKind: "database" },
      });
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
      expect(errors[0]).toMatchObject({
        code: "infra-not-in-context",
        params: { infraKind: "queue" },
      });
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
      expect(errors[0]).toMatchObject({
        code: "infra-not-in-context",
        params: { infraKind: "storage" },
      });
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
      expect(
        errors.some(
          (e) => e.code === "unexpected-token-in-block" && e.params.blockKind === "sub-resource",
        ),
      ).toBe(true);
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

    it("does not emit owns-target-not-found when owns references a client (ADR-1720)", () => {
      const result = Parser.parse(`
system S {
  client Web [web] {}
}

organization Corp {
  team frontend {
    owns Web
  }
}
      `);
      const warnings = result.diagnostics.filter(
        (d) => d.severity === "warning" && d.code === "owns-target-not-found",
      );
      expect(warnings).toHaveLength(0);
    });

    it("does not emit owns-target-not-found when owns references a top-level client", () => {
      const result = Parser.parse(`
client Web [web] {}

organization Corp {
  team frontend {
    owns Web
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

// #1495: a nested legend gets ONE dedicated diagnostic and the whole
// block is skipped — no per-token unexpected-token-in-block cascade.
describe("legend nested in a block (legend-not-top-level)", () => {
  function expectSingleNestedLegendError(source: string, parentKind: string) {
    const result = Parser.parse(source);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe("legend-not-top-level");
    expect(result.diagnostics[0].params).toEqual({ parentKind });
    return result;
  }

  it("system: reports once and keeps parsing siblings", () => {
    const result = expectSingleNestedLegendError(
      `
system Test {
  legend "Nested" {
    swatch #2563EB "Color"
  }
  service Svc { }
}
      `,
      "system",
    );
    const system = result.value.systems[0];
    expect(system.children.map((c) => c.id)).toEqual(["Svc"]);
    expect(result.value.legends).toHaveLength(0);
  });

  it("service: reports once", () => {
    expectSingleNestedLegendError(
      `
system Test {
  service Svc {
    legend { swatch #FFF "x" }
  }
}
      `,
      "service",
    );
  });

  it("domain: reports once", () => {
    expectSingleNestedLegendError(
      `
system Test {
  service Svc {
    domain Order {
      legend org "O" { swatch #333 "c" }
    }
  }
}
      `,
      "domain",
    );
  });

  it("infra block: reports once", () => {
    expectSingleNestedLegendError(
      `
database OrderDB {
  legend { swatch #111 "a" }
}
      `,
      "database",
    );
  });

  it("deploy block: reports once and keeps parsing nodes", () => {
    const result = expectSingleNestedLegendError(
      `
deploy Prod {
  legend { swatch #111 "a" }
  oci app { }
}
      `,
      "deploy",
    );
    expect(result.value.deploys[0].nodes.map((n) => n.id)).toEqual(["app"]);
  });

  it("organization block: reports once and keeps parsing teams", () => {
    const result = expectSingleNestedLegendError(
      `
organization Acme {
  legend { swatch #111 "a" }
  team Backend { }
}
      `,
      "organization",
    );
    expect(result.value.organizations[0].teams.map((t) => t.id)).toEqual(["Backend"]);
  });

  it("team block: reports once", () => {
    expectSingleNestedLegendError(
      `
organization Acme {
  team Backend {
    legend { swatch #111 "a" }
  }
}
      `,
      "team",
    );
  });

  it("malformed nested legend without a body does not eat the enclosing brace", () => {
    const result = Parser.parse(`
system Test {
  legend "No body"
}
service After { }
    `);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["legend-not-top-level"]);
    // The enclosing system closed normally and the next top-level node parsed.
    expect(result.value.systems[0].id).toBe("Test");
    expect(result.value.services.map((s) => s.id)).toEqual(["After"]);
  });
});

describe("legend block", () => {
  it("parses a top-level legend with a swatch entry", () => {
    const result = Parser.parse(`
legend "Owner team" {
  swatch #2563EB "Team Backend"
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value.legends).toHaveLength(1);
    const legend = result.value.legends[0];
    expect(legend.scope).toBeUndefined();
    expect(legend.title).toBe("Owner team");
    expect(legend.entries).toHaveLength(1);
    const entry = legend.entries[0];
    expect(entry.kind).toBe("swatch");
    if (entry.kind !== "swatch") throw new Error("kind mismatch");
    expect(entry.color).toBe("#2563EB");
    expect(entry.label).toBe("Team Backend");
  });

  it("parses a legend without a title", () => {
    const result = Parser.parse(`
legend {
  swatch #FFF "White"
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value.legends[0].title).toBeUndefined();
  });

  it("parses each view-scope variant", () => {
    const result = Parser.parse(`
legend system "S" { swatch #111 "a" }
legend service "Sv" { swatch #444 "d" }
legend domain "Dm" { swatch #555 "e" }
legend deploy "D" { swatch #222 "b" }
legend org "O" { swatch #333 "c" }
    `);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value.legends.map((l) => l.scope)).toEqual([
      "system",
      "service",
      "domain",
      "deploy",
      "org",
    ]);
  });

  it("treats a scope-less legend starting with a string title as unscoped", () => {
    // `service` / `domain` joined the scope vocabulary; make sure a title
    // that happens to follow `legend` directly is still parsed as a title.
    const result = Parser.parse(`
legend "service catalog" { swatch #111 "a" }
    `);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value.legends[0].scope).toBeUndefined();
    expect(result.value.legends[0].title).toBe("service catalog");
  });

  it("parses every ref target kind", () => {
    const result = Parser.parse(`
legend "All ref kinds" {
  ref @deprecated "Deprecated"
  ref [external]  "External"
  ref .legacy     "Legacy class"
  ref #LegacyId   "Legacy id"
  ref service     "Service type"
}
    `);
    expect(result.diagnostics).toHaveLength(0);
    const targets = result.value.legends[0].entries.map((e) => {
      if (e.kind !== "ref") throw new Error("expected ref");
      return e.target;
    });
    expect(targets).toEqual([
      { kind: "annotation", name: "deprecated" },
      { kind: "tag", name: "external" },
      { kind: "selector", selector: ".legacy" },
      { kind: "selector", selector: "#LegacyId" },
      { kind: "selector", selector: "service" },
    ]);
  });

  it("preserves declaration order for multiple entries", () => {
    const result = Parser.parse(`
legend {
  swatch #111 "a"
  ref @deprecated "b"
  swatch #222 "c"
}
    `);
    expect(result.value.legends[0].entries.map((e) => e.label)).toEqual(["a", "b", "c"]);
  });

  it("allows multiple legend blocks with independent scopes", () => {
    const result = Parser.parse(`
legend "All views" { swatch #111 "a" }
legend deploy "Hosting" { swatch #222 "b" }
    `);
    expect(result.value.legends).toHaveLength(2);
    expect(result.value.legends[0].scope).toBeUndefined();
    expect(result.value.legends[1].scope).toBe("deploy");
  });

  it("rejects legend nested inside a system block", () => {
    const result = Parser.parse(`
system S {
  legend "nope" { swatch #111 "x" }
}
    `);
    // The inner block does not handle Legend, so the parser falls through to
    // its generic "unexpected token in <kind> block" diagnostic.
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    // Top-level legends remain empty — nested content is not collected.
    expect(result.value.legends).toHaveLength(0);
  });

  it("emits unexpected-token-in-block on an unknown entry keyword", () => {
    const result = Parser.parse(`
legend "x" {
  swatch #111 "ok"
  bogus "bad"
}
    `);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors.some((d) => d.code === "unexpected-token-in-block")).toBe(true);
    // The valid entry is still captured.
    expect(result.value.legends[0].entries.some((e) => e.label === "ok")).toBe(true);
  });
});
