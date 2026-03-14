import { describe, it, expect } from "vitest";
import { Parser } from "../parser/parser.js";

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
    const result = Parser.parse(
      '@import "base.krs.style"\n@import "theme.krs.style"'
    );
    expect(result.value.styleImports).toEqual([
      "base.krs.style",
      "theme.krs.style",
    ]);
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
  person Customer "顧客" "商品を購入する一般ユーザー"
  service ECommerce "ECサイト" "商品管理と注文処理"
}
    `);
    const sys = result.value.systems[0];
    expect(sys.children).toHaveLength(2);

    const person = sys.children[0];
    expect(person.kind).toBe("person");
    expect(person.id).toBe("Customer");
    expect(person.label).toBe("顧客");
    expect(person.description).toBe("商品を購入する一般ユーザー");

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
  person Customer "顧客"
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

  it("parses nested nodes", () => {
    const result = Parser.parse(`
system "Test" {
  service ECommerce "EC" {
    domain Order "受注" {
      usecase PlaceOrder "注文を受け付ける"
    }
  }
}
    `);
    const service = result.value.systems[0].children[0];
    expect(service.children).toHaveLength(1);
    const domain = service.children[0];
    expect(domain.kind).toBe("domain");
    expect(domain.children).toHaveLength(1);
    expect(domain.children[0].kind).toBe("usecase");
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
  person Customer "顧客" "商品を購入する一般ユーザー"
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

  it("reports errors for unexpected tokens", () => {
    const result = Parser.parse("??? system");
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
