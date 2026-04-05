import { describe, it, expect } from "vitest";
import { extractView } from "./view-extract.js";
import { Parser } from "../parser/parser.js";
import type { KrsNode } from "../types/ast.js";

function parseSystem(krs: string): KrsNode[] {
  return Parser.parse(krs).value.systems;
}

const FULL_KRS = `
system ECPlatform {
  label "ECプラットフォーム"

  user Customer {
    description "商品を購入する一般ユーザー"
  }
  user Admin {
    description "システムを運用する担当者"
  }

  service ECommerce {
    description "商品管理と注文処理"

    domain Order {
      usecase PlaceOrder {
        resource OrderTable
        resource InventoryAPI [external]
      }
      usecase CancelOrder
    }
    domain Shipping {
      usecase ShipOrder
    }
  }
  service Payment [external] {
    description "クレジットカード決済処理"
  }

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
      expect(view.childNodes.map((n) => n.id)).toEqual([
        "Customer",
        "Admin",
        "ECommerce",
        "Payment",
      ]);
      expect(view.ancestorChain).toHaveLength(0);
      expect(view.ghostUsers).toHaveLength(0);
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
      expect(view.childNodes.map((n) => n.id)).toEqual(["Order", "Shipping"]);
    });

    it("builds ancestor chain with system", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECommerce"]);

      expect(view.ancestorChain).toHaveLength(1);
      expect(view.ancestorChain[0].kind).toBe("system");
    });

    it("includes ghost users connected to the service", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECommerce"]);

      expect(view.ghostUsers.map((n) => n.id)).toEqual(["Customer", "Admin"]);
      expect(view.ghostUserEdges).toHaveLength(2);
    });

    it("excludes unconnected users", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["Payment"]);

      // Payment has no user connections
      expect(view.ghostUsers).toHaveLength(0);
      expect(view.childNodes).toHaveLength(0); // Payment has no children
    });
  });

  describe("domain view (path length 2)", () => {
    it("returns domain's usecase children", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECommerce", "Order"]);

      expect(view.containerNode?.kind).toBe("domain");
      expect(view.childNodes.map((n) => n.id)).toEqual(["PlaceOrder", "CancelOrder"]);
    });

    it("builds ancestor chain with system and service", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECommerce", "Order"]);

      expect(view.ancestorChain).toHaveLength(2);
      expect(view.ancestorChain[0].kind).toBe("system");
      expect(view.ancestorChain[1].kind).toBe("service");
    });

    it("does not include ghost users at domain level", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECommerce", "Order"]);

      expect(view.ghostUsers).toHaveLength(0);
    });
  });

  describe("usecase view (path length 3)", () => {
    it("returns usecase's resource children", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECommerce", "Order", "PlaceOrder"]);

      expect(view.containerNode?.kind).toBe("usecase");
      expect(view.childNodes.map((n) => n.id)).toEqual(["OrderTable", "InventoryAPI"]);
    });

    it("builds full ancestor chain", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECommerce", "Order", "PlaceOrder"]);

      expect(view.ancestorChain).toHaveLength(3);
      expect(view.ancestorChain.map((n) => n.kind)).toEqual(["system", "service", "domain"]);
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

  describe("unassigned domains in system view", () => {
    it("includes unassigned domains in system view childNodes", () => {
      const krs = `
domain Payment { label "決済" }
domain Inventory { label "在庫" }

system ECPlatform {
  service ECommerce {}
}
      `;
      const result = Parser.parse(krs);
      const view = extractView(result.value.systems, [], result.value.domains);

      // system has 1 child (ECommerce) + 2 unassigned domains
      expect(view.childNodes).toHaveLength(3);
      expect(view.childNodes.map((n) => n.id)).toContain("Payment");
      expect(view.childNodes.map((n) => n.id)).toContain("Inventory");
      expect(view.childNodes.map((n) => n.id)).toContain("ECommerce");
    });

    it("drills into unassigned domain with children", () => {
      const krs = `
domain Payment {
  label "決済"
  usecase ProcessPayment { label "支払い処理" }
}

system ECPlatform {
  service ECommerce {}
}
      `;
      const result = Parser.parse(krs);
      const view = extractView(result.value.systems, ["Payment"], result.value.domains);

      expect(view.containerNode).not.toBeNull();
      expect(view.containerNode?.id).toBe("Payment");
      expect(view.childNodes).toHaveLength(1);
      expect(view.childNodes[0].id).toBe("ProcessPayment");
    });

    it("does not include unassigned domains in service view", () => {
      const krs = `
domain Payment { label "決済" }

system ECPlatform {
  service ECommerce {
    domain Order {}
  }
}
      `;
      const result = Parser.parse(krs);
      const view = extractView(result.value.systems, ["ECommerce"], result.value.domains);

      // service view shows only ECommerce's children (Order), not unassigned Payment
      expect(view.childNodes).toHaveLength(1);
      expect(view.childNodes[0].id).toBe("Order");
    });
  });

  describe("cross-system references", () => {
    it("cross-system edge target is stored in AST but not rendered in system view", () => {
      const krs = `
system ECPlatform {
  service OrderService {}
  OrderService -> PaymentGateway.PaymentService "決済を依頼する"
}
system PaymentGateway {
  service PaymentService {}
}
`;
      const result = Parser.parse(krs);
      // Edge is stored in AST with qualified target
      const edge = result.value.systems[0].edges[0];
      expect(edge.to).toBe("PaymentGateway.PaymentService");

      // view-extract filters it out (ghost system rendering is deferred)
      const view = extractView(result.value.systems, []);
      expect(view.childEdges.find((e) => e.to === "PaymentGateway.PaymentService")).toBeUndefined();
    });
  });
});
