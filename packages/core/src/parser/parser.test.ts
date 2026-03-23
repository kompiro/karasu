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
    const source = ['system "My System":', '  service S "placeholder"'].join("\n");
    const result = Parser.parse(source);
    expect(result.value.systems).toHaveLength(1);
    expect(result.value.systems[0].kind).toBe("system");
    expect(result.value.systems[0].label).toBe("My System");
  });

  it("parses description in property block", () => {
    const source = [
      'system "Test":',
      '  user Customer "顧客":',
      '    description: "商品を購入する一般ユーザー"',
      '  service ECommerce "ECサイト":',
      '    description: "商品管理と注文処理"',
    ].join("\n");
    const result = Parser.parse(source);
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

  it("rejects positional description with error", () => {
    const source = ['system "Test":', '  service ECommerce "ECサイト" "商品管理と注文処理"'].join(
      "\n",
    );
    const result = Parser.parse(source);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(
      result.diagnostics.some((d) => d.message.includes("位置引数の description は廃止されました")),
    ).toBe(true);
  });

  it("parses tags", () => {
    const source = ['system "Test":', '  service Payment "決済" [external]'].join("\n");
    const result = Parser.parse(source);
    const service = result.value.systems[0].children[0];
    expect(service.tags).toEqual(["external"]);
  });

  it("parses annotations", () => {
    const source = [
      'system "Test":',
      '  service Legacy "旧システム" @deprecated @migration_target',
    ].join("\n");
    const result = Parser.parse(source);
    const service = result.value.systems[0].children[0];
    expect(service.annotations).toEqual(["deprecated", "migration_target"]);
  });

  it("parses tags and annotations combined", () => {
    const source = ['system "Test":', '  service Legacy "旧システム" [external] @deprecated'].join(
      "\n",
    );
    const result = Parser.parse(source);
    const service = result.value.systems[0].children[0];
    expect(service.tags).toEqual(["external"]);
    expect(service.annotations).toEqual(["deprecated"]);
  });

  it("parses sync edges", () => {
    const source = [
      'system "Test":',
      '  user Customer "顧客"',
      '  service Shop "ショップ"',
      '  Customer -> Shop "商品を購入する"',
    ].join("\n");
    const result = Parser.parse(source);
    const edges = result.value.systems[0].edges;
    expect(edges).toHaveLength(1);
    expect(edges[0].from).toBe("Customer");
    expect(edges[0].to).toBe("Shop");
    expect(edges[0].label).toBe("商品を購入する");
    expect(edges[0].kind).toBe("sync");
  });

  it("parses async edges", () => {
    const source = [
      'system "Test":',
      '  service A "A"',
      '  service B "B"',
      '  A --> B "非同期処理"',
    ].join("\n");
    const result = Parser.parse(source);
    const edges = result.value.systems[0].edges;
    expect(edges).toHaveLength(1);
    expect(edges[0].kind).toBe("async");
  });

  it("parses nested nodes with full hierarchy", () => {
    const source = [
      'system "Test":',
      '  service ECommerce "EC":',
      '    domain Order "受注":',
      '      usecase PlaceOrder "注文を受け付ける":',
      '        resource OrderTable "注文テーブル"',
      '        resource InventoryAPI "在庫API" [external]',
    ].join("\n");
    const result = Parser.parse(source);
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
    const source = [
      'deploy "本番環境":',
      '  oci "order-service":',
      '    image: "order:2.1.0"',
      '    runtime: "Node.js 20"',
      "    realizes: ECommerce",
      '  job "monthly-billing":',
      '    schedule: "0 0 1 * *"',
      '    runtime: "Java 21"',
      "    realizes: Billing",
    ].join("\n");
    const result = Parser.parse(source);
    expect(result.diagnostics).toHaveLength(0);
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
    const source = [
      '@import "default.krs.style"',
      "",
      'system "ECプラットフォーム":',
      '  user Customer "顧客":',
      '    description: "商品を購入する一般ユーザー"',
      '  service ECommerce "ECサイト":',
      '    description: "商品管理と注文処理"',
      '  service Payment "決済サービス" [external]',
      '  Customer -> ECommerce "商品を購入する"',
      '  ECommerce --> Payment "決済を処理する"',
      "",
      'deploy "本番環境":',
      '  war "order.war":',
      '    runtime: "Tomcat 9"',
      "    realizes: ECommerce",
    ].join("\n");
    const result = Parser.parse(source);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value.styleImports).toEqual(["default.krs.style"]);
    expect(result.value.systems).toHaveLength(1);
    expect(result.value.deploys).toHaveLength(1);

    const sys = result.value.systems[0];
    expect(sys.children).toHaveLength(3);
    expect(sys.edges).toHaveLength(2);
  });

  it("parses user with role property", () => {
    const source = [
      'system "Test":',
      '  user Admin "管理者" [human]:',
      '    role: "システム管理者"',
    ].join("\n");
    const result = Parser.parse(source);
    expect(result.diagnostics).toHaveLength(0);
    const user = result.value.systems[0].children[0] as UserNode;
    expect(user.kind).toBe("user");
    expect(user.id).toBe("Admin");
    expect(user.label).toBe("管理者");
    expect(user.properties.role).toBe("システム管理者");
    expect(user.tags).toEqual(["human"]);
  });

  it("parses user with [ai] tag", () => {
    const source = [
      'system "Test":',
      '  user AIAgent "注文自動化エージェント" [ai]:',
      '    role: "注文処理担当"',
    ].join("\n");
    const result = Parser.parse(source);
    expect(result.diagnostics).toHaveLength(0);
    const user = result.value.systems[0].children[0] as UserNode;
    expect(user.kind).toBe("user");
    expect(user.tags).toEqual(["ai"]);
    expect(user.properties.role).toBe("注文処理担当");
  });

  it("parses user without role (simple form)", () => {
    const source = ['system "Test":', '  user Admin "管理者" [human]'].join("\n");
    const result = Parser.parse(source);
    expect(result.diagnostics).toHaveLength(0);
    const user = result.value.systems[0].children[0] as UserNode;
    expect(user.kind).toBe("user");
    expect(user.properties.role).toBeUndefined();
    expect(user.tags).toEqual(["human"]);
  });

  it("parses team property on service", () => {
    const source = [
      'system "Test":',
      '  service ECommerce "ECサイト":',
      '    team: "EC開発チーム"',
    ].join("\n");
    const result = Parser.parse(source);
    expect(result.diagnostics).toHaveLength(0);
    const service = result.value.systems[0].children[0] as ServiceNode;
    expect(service.kind).toBe("service");
    expect(service.properties.team).toBe("EC開発チーム");
  });

  it("parses links with YAML list syntax", () => {
    const source = [
      'system "Test":',
      '  service ECommerce "ECサイト":',
      "    links:",
      '      - "https://wiki.example.com/ec"',
      '      - "https://figma.com/file/xxx"',
    ].join("\n");
    const result = Parser.parse(source);
    expect(result.diagnostics).toHaveLength(0);
    const service = result.value.systems[0].children[0] as ServiceNode;
    expect(service.properties.links).toHaveLength(2);
    expect(service.properties.links[0].url).toBe("https://wiki.example.com/ec");
    expect(service.properties.links[1].url).toBe("https://figma.com/file/xxx");
  });

  it("parses single link in YAML list", () => {
    const source = [
      'system "Test":',
      '  service S "S":',
      "    links:",
      '      - "https://example.com"',
    ].join("\n");
    const result = Parser.parse(source);
    expect(result.diagnostics).toHaveLength(0);
    const service = result.value.systems[0].children[0] as ServiceNode;
    expect(service.properties.links).toHaveLength(1);
    expect(service.properties.links[0].url).toBe("https://example.com");
  });

  it("returns empty links array when no links specified", () => {
    const source = ['system "Test":', '  service S "S"'].join("\n");
    const result = Parser.parse(source);
    const service = result.value.systems[0].children[0];
    expect(service.properties.links).toEqual([]);
  });

  it("errors when team is used on user node", () => {
    const source = ['system "Test":', '  user Admin "管理者":', '    team: "チーム名"'].join("\n");
    const result = Parser.parse(source);
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics.some((d) => d.message.includes("team"))).toBe(true);
  });

  it("parses pipe description", () => {
    const source = [
      'system "Test":',
      '  service ECommerce "ECサイト":',
      "    description: |",
      "      商品管理と注文処理を担当するサービス。",
      "",
      "      ## 責務",
      "      - 商品カタログの管理",
    ].join("\n");
    const result = Parser.parse(source);
    expect(result.diagnostics).toHaveLength(0);
    const service = result.value.systems[0].children[0] as ServiceNode;
    expect(service.properties.description).toContain("商品管理と注文処理を担当するサービス。");
    expect(service.properties.description).toContain("## 責務");
  });

  it("parses top-level service", () => {
    const source = [
      'service Monitoring "監視サービス":',
      '  description: "配置先のシステムが未定"',
      '  team: "SRE チーム"',
    ].join("\n");
    const result = Parser.parse(source);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.value.services).toHaveLength(1);
    const service = result.value.services[0];
    expect(service.kind).toBe("service");
    expect(service.id).toBe("Monitoring");
    expect(service.label).toBe("監視サービス");
    expect(service.properties.description).toBe("配置先のシステムが未定");
    expect(service.properties.team).toBe("SRE チーム");
  });

  it("parses property block mixed with child nodes", () => {
    const source = [
      'system "Test":',
      '  service ECommerce "ECサイト":',
      '    description: "商品管理"',
      '    team: "ECチーム"',
      "    links:",
      '      - "https://example.com"',
      "",
      '    domain "受注":',
      '      usecase "注文を受け付ける"',
    ].join("\n");
    const result = Parser.parse(source);
    expect(result.diagnostics).toHaveLength(0);
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
});
