import { describe, it, expect } from "vitest";
import { extractView } from "./view-extract.js";
import { Parser } from "../parser/parser.js";
import type { KrsNode } from "../types/ast.js";

function parseSystem(krs: string): KrsNode[] {
  return Parser.parse(krs).value.systems;
}

const FULL_KRS = `
system "ECプラットフォーム" {
  person Customer "顧客" "商品を購入する一般ユーザー"
  person Admin "管理者" "システムを運用する担当者"

  service ECommerce "ECサイト" "商品管理と注文処理" {
    domain Order "受注" {
      usecase PlaceOrder "注文を受け付ける" {
        resource OrderTable "注文テーブル"
        resource InventoryAPI "在庫API" [external]
      }
      usecase CancelOrder "注文をキャンセルする"
    }
    domain Shipping "発送" {
      usecase ShipOrder "出荷する"
    }
  }
  service Payment "決済サービス" "クレジットカード決済処理" [external]

  Customer -> ECommerce "商品を購入する"
  Admin -> ECommerce "商品を管理する"
  ECommerce -> Payment "決済を処理する"
}
`;

describe("extractView", () => {
  describe("system view (empty path)", () => {
    it("returns system's direct children", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, []);

      expect(view.containerNode?.kind).toBe("system");
      expect(view.childNodes.map((n) => n.id ?? n.label)).toEqual([
        "Customer",
        "Admin",
        "ECommerce",
        "Payment",
      ]);
      expect(view.ancestorChain).toHaveLength(0);
      expect(view.ghostPersons).toHaveLength(0);
    });

    it("includes edges between direct children", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, []);

      expect(view.childEdges).toHaveLength(3);
      expect(view.childEdges.map((e) => `${e.from}->${e.to}`)).toEqual([
        "Customer->ECommerce",
        "Admin->ECommerce",
        "ECommerce->Payment",
      ]);
    });
  });

  describe("service view (path length 1)", () => {
    it("returns service's domain children", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECommerce"]);

      expect(view.containerNode?.kind).toBe("service");
      expect(view.containerNode?.id).toBe("ECommerce");
      expect(view.childNodes.map((n) => n.id ?? n.label)).toEqual([
        "Order",
        "Shipping",
      ]);
    });

    it("builds ancestor chain with system", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECommerce"]);

      expect(view.ancestorChain).toHaveLength(1);
      expect(view.ancestorChain[0].kind).toBe("system");
    });

    it("includes ghost persons connected to the service", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECommerce"]);

      expect(view.ghostPersons.map((n) => n.id ?? n.label)).toEqual([
        "Customer",
        "Admin",
      ]);
      expect(view.ghostPersonEdges).toHaveLength(2);
    });

    it("excludes unconnected persons", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["Payment"]);

      // Payment has no person connections
      expect(view.ghostPersons).toHaveLength(0);
      expect(view.childNodes).toHaveLength(0); // Payment has no children
    });
  });

  describe("domain view (path length 2)", () => {
    it("returns domain's usecase children", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECommerce", "Order"]);

      expect(view.containerNode?.kind).toBe("domain");
      expect(view.childNodes.map((n) => n.id ?? n.label)).toEqual([
        "PlaceOrder",
        "CancelOrder",
      ]);
    });

    it("builds ancestor chain with system and service", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECommerce", "Order"]);

      expect(view.ancestorChain).toHaveLength(2);
      expect(view.ancestorChain[0].kind).toBe("system");
      expect(view.ancestorChain[1].kind).toBe("service");
    });

    it("does not include ghost persons at domain level", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECommerce", "Order"]);

      expect(view.ghostPersons).toHaveLength(0);
    });
  });

  describe("usecase view (path length 3)", () => {
    it("returns usecase's resource children", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECommerce", "Order", "PlaceOrder"]);

      expect(view.containerNode?.kind).toBe("usecase");
      expect(view.childNodes.map((n) => n.id ?? n.label)).toEqual([
        "OrderTable",
        "InventoryAPI",
      ]);
    });

    it("builds full ancestor chain", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECommerce", "Order", "PlaceOrder"]);

      expect(view.ancestorChain).toHaveLength(3);
      expect(view.ancestorChain.map((n) => n.kind)).toEqual([
        "system",
        "service",
        "domain",
      ]);
    });
  });

  describe("edge cases", () => {
    it("returns empty for invalid path", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["NonExistent"]);

      expect(view.containerNode).toBeNull();
      expect(view.childNodes).toHaveLength(0);
    });

    it("returns empty for empty systems", () => {
      const view = extractView([], []);

      expect(view.containerNode).toBeNull();
      expect(view.childNodes).toHaveLength(0);
    });

    it("handles empty container (no children)", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECommerce", "Order", "CancelOrder"]);

      expect(view.containerNode?.kind).toBe("usecase");
      expect(view.childNodes).toHaveLength(0);
      expect(view.childEdges).toHaveLength(0);
    });
  });
});
