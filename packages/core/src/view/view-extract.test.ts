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

const INFRA_KRS = `
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
        resource EventBus.OrderCreated
      }
    }
  }
  service MediaService {
    domain Media {
      usecase UploadImage {
        resource MediaStorage.ImageBucket
        resource OrderDB.InventoryTable
      }
    }
  }
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

  describe("service view (path length 2: [systemId, serviceId])", () => {
    it("returns service's domain children", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECPlatform", "ECommerce"]);

      expect(view.containerNode?.kind).toBe("service");
      expect(view.containerNode?.id).toBe("ECommerce");
      expect(view.childNodes.map((n) => n.id)).toEqual(["Order", "Shipping"]);
    });

    it("builds ancestor chain with system", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECPlatform", "ECommerce"]);

      expect(view.ancestorChain).toHaveLength(1);
      expect(view.ancestorChain[0].kind).toBe("system");
    });

    it("includes ghost users connected to the service", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECPlatform", "ECommerce"]);

      expect(view.ghostUsers.map((n) => n.id)).toEqual(["Customer", "Admin"]);
      expect(view.ghostUserEdges).toHaveLength(2);
    });

    it("excludes unconnected users", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECPlatform", "Payment"]);

      // Payment has no user connections
      expect(view.ghostUsers).toHaveLength(0);
      expect(view.childNodes).toHaveLength(0); // Payment has no children
    });

    it("selects the correct system when multiple systems exist", () => {
      const krs = `
system SysA {
  service ServiceA {}
}
system SysB {
  service ServiceB {}
}
`;
      const systems = parseSystem(krs);
      const viewA = extractView(systems, ["SysA", "ServiceA"]);
      expect(viewA.containerNode?.id).toBe("ServiceA");

      const viewB = extractView(systems, ["SysB", "ServiceB"]);
      expect(viewB.containerNode?.id).toBe("ServiceB");
    });
  });

  describe("domain view (path length 3: [systemId, serviceId, domainId])", () => {
    it("returns domain's usecase children", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECPlatform", "ECommerce", "Order"]);

      expect(view.containerNode?.kind).toBe("domain");
      expect(view.childNodes.map((n) => n.id)).toEqual(["PlaceOrder", "CancelOrder"]);
    });

    it("builds ancestor chain with system and service", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECPlatform", "ECommerce", "Order"]);

      expect(view.ancestorChain).toHaveLength(2);
      expect(view.ancestorChain[0].kind).toBe("system");
      expect(view.ancestorChain[1].kind).toBe("service");
    });

    it("does not include ghost users at domain level", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECPlatform", "ECommerce", "Order"]);

      expect(view.ghostUsers).toHaveLength(0);
    });
  });

  describe("usecase view (path length 4: [systemId, serviceId, domainId, usecaseId])", () => {
    it("returns usecase's resource children", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECPlatform", "ECommerce", "Order", "PlaceOrder"]);

      expect(view.containerNode?.kind).toBe("usecase");
      expect(view.childNodes.map((n) => n.id)).toEqual(["OrderTable", "InventoryAPI"]);
    });

    it("builds full ancestor chain", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECPlatform", "ECommerce", "Order", "PlaceOrder"]);

      expect(view.ancestorChain).toHaveLength(3);
      expect(view.ancestorChain.map((n) => n.kind)).toEqual(["system", "service", "domain"]);
    });
  });

  describe("edge cases", () => {
    it("returns empty for invalid service in valid system", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, ["ECPlatform", "NonExistent"]);

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
      const view = extractView(systems, ["ECPlatform", "ECommerce", "Order", "CancelOrder"]);

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
      const view = extractView(
        result.value.systems,
        ["ECPlatform", "ECommerce"],
        result.value.domains,
      );

      // service view shows only ECommerce's children (Order), not unassigned Payment
      expect(view.childNodes).toHaveLength(1);
      expect(view.childNodes[0].id).toBe("Order");
    });
  });

  describe("cross-system references", () => {
    const CROSS_SYSTEM_KRS = `
system ECPlatform {
  service OrderService {}
  OrderService -> PaymentGateway.PaymentService "決済を依頼する"
}
system PaymentGateway {
  service PaymentService {}
}
`;

    it("cross-system edge target is stored in AST but not rendered in childEdges", () => {
      const result = Parser.parse(CROSS_SYSTEM_KRS);
      const edge = result.value.systems[0].edges[0];
      expect(edge.to).toBe("PaymentGateway.PaymentService");

      const view = extractView(result.value.systems, []);
      expect(view.childEdges.find((e) => e.to === "PaymentGateway.PaymentService")).toBeUndefined();
    });

    describe("root view (path = [])", () => {
      it("populates systems with all systems", () => {
        const result = Parser.parse(CROSS_SYSTEM_KRS);
        const view = extractView(result.value.systems, []);

        expect(view.systems).toHaveLength(2);
        expect(view.systems.map((s) => s.id)).toEqual(["ECPlatform", "PaymentGateway"]);
      });

      it("populates crossSystemEdges with qualified-target edges", () => {
        const result = Parser.parse(CROSS_SYSTEM_KRS);
        const view = extractView(result.value.systems, []);

        expect(view.crossSystemEdges).toHaveLength(1);
        expect(view.crossSystemEdges[0].from).toBe("OrderService");
        expect(view.crossSystemEdges[0].to).toBe("PaymentGateway.PaymentService");
      });

      it("excludes crossSystemEdges where target system is not found", () => {
        const krs = `
system ECPlatform {
  service OrderService {}
  OrderService -> UnknownSystem.SomeService "依頼する"
}
`;
        const result = Parser.parse(krs);
        const view = extractView(result.value.systems, []);

        expect(view.crossSystemEdges).toHaveLength(0);
      });

      it("has empty ghostSystems and ghostSystemEdges", () => {
        const result = Parser.parse(CROSS_SYSTEM_KRS);
        const view = extractView(result.value.systems, []);

        expect(view.ghostSystems).toHaveLength(0);
        expect(view.ghostSystemEdges).toHaveLength(0);
      });
    });

    describe("service view (path length 2: [systemId, serviceId])", () => {
      it("populates ghostSystems for cross-system edges from the service", () => {
        const result = Parser.parse(CROSS_SYSTEM_KRS);
        const view = extractView(result.value.systems, ["ECPlatform", "OrderService"]);

        expect(view.ghostSystems).toHaveLength(1);
        expect(view.ghostSystems[0].systemNode.id).toBe("PaymentGateway");
        expect(view.ghostSystems[0].visibleServices).toHaveLength(1);
        expect(view.ghostSystems[0].visibleServices[0].id).toBe("PaymentService");
      });

      it("populates ghostSystemEdges", () => {
        const result = Parser.parse(CROSS_SYSTEM_KRS);
        const view = extractView(result.value.systems, ["ECPlatform", "OrderService"]);

        expect(view.ghostSystemEdges).toHaveLength(1);
        expect(view.ghostSystemEdges[0].from).toBe("OrderService");
        expect(view.ghostSystemEdges[0].to).toBe("PaymentGateway.PaymentService");
      });

      it("deduplicates visibleServices when multiple edges target the same service", () => {
        const krs = `
system ECPlatform {
  service OrderService {}
  OrderService -> PaymentGateway.PaymentService "決済する"
  OrderService -> PaymentGateway.PaymentService "再試行する"
}
system PaymentGateway {
  service PaymentService {}
}
`;
        const result = Parser.parse(krs);
        const view = extractView(result.value.systems, ["ECPlatform", "OrderService"]);

        expect(view.ghostSystems).toHaveLength(1);
        expect(view.ghostSystems[0].visibleServices).toHaveLength(1);
      });

      it("collects multiple visibleServices from the same ghost system", () => {
        const krs = `
system ECPlatform {
  service OrderService {}
  OrderService -> PaymentGateway.PaymentService "決済する"
  OrderService -> PaymentGateway.FraudService "不正検知する"
}
system PaymentGateway {
  service PaymentService {}
  service FraudService {}
}
`;
        const result = Parser.parse(krs);
        const view = extractView(result.value.systems, ["ECPlatform", "OrderService"]);

        expect(view.ghostSystems).toHaveLength(1);
        expect(view.ghostSystems[0].visibleServices.map((s) => s.id)).toEqual([
          "PaymentService",
          "FraudService",
        ]);
      });

      it("ignores cross-system edges where target system is not in the systems list", () => {
        const krs = `
system ECPlatform {
  service OrderService {}
  OrderService -> UnknownSystem.SomeService "依頼する"
}
`;
        const result = Parser.parse(krs);
        const view = extractView(result.value.systems, ["ECPlatform", "OrderService"]);

        expect(view.ghostSystems).toHaveLength(0);
        expect(view.ghostSystemEdges).toHaveLength(0);
      });

      it("has empty systems and crossSystemEdges", () => {
        const result = Parser.parse(CROSS_SYSTEM_KRS);
        const view = extractView(result.value.systems, ["ECPlatform", "OrderService"]);

        expect(view.systems).toHaveLength(0);
        expect(view.crossSystemEdges).toHaveLength(0);
      });

      it("has no ghostSystems when service has no cross-system edges", () => {
        const result = Parser.parse(CROSS_SYSTEM_KRS);
        const view = extractView(result.value.systems, ["PaymentGateway", "PaymentService"]);

        expect(view.ghostSystems).toHaveLength(0);
        expect(view.ghostSystemEdges).toHaveLength(0);
      });

      it("populates callerGhostSystems when another service calls into this service", () => {
        const result = Parser.parse(CROSS_SYSTEM_KRS);
        // PaymentService is called by OrderService in ECPlatform
        const view = extractView(result.value.systems, ["PaymentGateway", "PaymentService"]);

        expect(view.callerGhostSystems).toHaveLength(1);
        expect(view.callerGhostSystems[0].systemNode.id).toBe("ECPlatform");
        expect(view.callerGhostSystems[0].visibleServices).toHaveLength(1);
        expect(view.callerGhostSystems[0].visibleServices[0].id).toBe("OrderService");
      });

      it("populates callerGhostSystemEdges with qualified from-ID", () => {
        const result = Parser.parse(CROSS_SYSTEM_KRS);
        const view = extractView(result.value.systems, ["PaymentGateway", "PaymentService"]);

        expect(view.callerGhostSystemEdges).toHaveLength(1);
        expect(view.callerGhostSystemEdges[0].from).toBe("ECPlatform.OrderService");
        expect(view.callerGhostSystemEdges[0].to).toBe("PaymentService");
      });

      it("has empty callerGhostSystems when no other service calls into this service", () => {
        const result = Parser.parse(CROSS_SYSTEM_KRS);
        // OrderService calls others but is not called by any cross-system edge
        const view = extractView(result.value.systems, ["ECPlatform", "OrderService"]);

        expect(view.callerGhostSystems).toHaveLength(0);
        expect(view.callerGhostSystemEdges).toHaveLength(0);
      });

      it("deduplicates callerGhostSystems visibleServices for multiple edges from same caller", () => {
        const krs = `
system ECPlatform {
  service OrderService {}
  OrderService -> PaymentGateway.PaymentService "決済する"
  OrderService -> PaymentGateway.PaymentService "再試行する"
}
system PaymentGateway {
  service PaymentService {}
}
`;
        const result = Parser.parse(krs);
        const view = extractView(result.value.systems, ["PaymentGateway", "PaymentService"]);

        expect(view.callerGhostSystems).toHaveLength(1);
        expect(view.callerGhostSystems[0].visibleServices).toHaveLength(1);
      });
    });
  });

  describe("infra nodes in system view", () => {
    it("includes database/queue/storage as childNodes in system view", () => {
      const systems = parseSystem(INFRA_KRS);
      const view = extractView(systems, []);

      const kinds = view.childNodes.map((n) => n.kind);
      expect(kinds).toContain("database");
      expect(kinds).toContain("queue");
      expect(kinds).toContain("storage");
    });

    it("derives service→database edge from resource dot-notation reference", () => {
      const systems = parseSystem(INFRA_KRS);
      const view = extractView(systems, []);

      const edge = view.childEdges.find((e) => e.from === "OrderService" && e.to === "OrderDB");
      expect(edge).toBeDefined();
    });

    it("derives service→queue edge", () => {
      const systems = parseSystem(INFRA_KRS);
      const view = extractView(systems, []);

      const edge = view.childEdges.find((e) => e.from === "OrderService" && e.to === "EventBus");
      expect(edge).toBeDefined();
    });

    it("derives service→storage edge", () => {
      const systems = parseSystem(INFRA_KRS);
      const view = extractView(systems, []);

      const edge = view.childEdges.find(
        (e) => e.from === "MediaService" && e.to === "MediaStorage",
      );
      expect(edge).toBeDefined();
    });

    it("deduplicates edges when multiple usecases reference the same infra node", () => {
      const systems = parseSystem(INFRA_KRS);
      const view = extractView(systems, []);

      const dbEdges = view.childEdges.filter(
        (e) => e.from === "MediaService" && e.to === "OrderDB",
      );
      expect(dbEdges).toHaveLength(1);
    });

    it("does not derive edges for resources without dot-notation ref", () => {
      const krs = `
system ECPlatform {
  database OrderDB {
    table OrderTable {}
  }
  service OrderService {
    domain Order {
      usecase PlaceOrder {
        resource UnassignedResource
      }
    }
  }
}
`;
      const systems = parseSystem(krs);
      const view = extractView(systems, []);

      const edge = view.childEdges.find(
        (e) => e.from === "OrderService" && e.to === "UnassignedResource",
      );
      expect(edge).toBeUndefined();
    });

    it("does not override explicitly declared edges with derived ones", () => {
      const krs = `
system ECPlatform {
  database OrderDB {
    table OrderTable {}
  }
  service OrderService {
    domain Order {
      usecase PlaceOrder {
        resource OrderDB.OrderTable
      }
    }
  }
  OrderService -> OrderDB "明示的エッジ"
}
`;
      const systems = parseSystem(krs);
      const view = extractView(systems, []);

      const edges = view.childEdges.filter((e) => e.from === "OrderService" && e.to === "OrderDB");
      expect(edges).toHaveLength(1);
    });

    it("produces no derived edges when no infra nodes exist", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, []);

      // FULL_KRS has no database/queue/storage nodes
      const infraEdges = view.childEdges.filter((e) =>
        view.childNodes.some(
          (n) => n.id === e.to && ["database", "queue", "storage"].includes(n.kind),
        ),
      );
      expect(infraEdges).toHaveLength(0);
    });
  });

  describe("resourceLabelMap", () => {
    it("maps dot-notation resource IDs to infra sub-resource labels", () => {
      const systems = parseSystem(INFRA_KRS);
      const view = extractView(systems, []);

      expect(view.resourceLabelMap.get("OrderDB.OrderTable")).toBe("注文テーブル");
      expect(view.resourceLabelMap.get("OrderDB.InventoryTable")).toBe("在庫テーブル");
      expect(view.resourceLabelMap.get("EventBus.OrderCreated")).toBe("注文作成イベント");
      expect(view.resourceLabelMap.get("MediaStorage.ImageBucket")).toBe("商品画像バケット");
    });

    it("falls back to sub-resource ID when no label is set", () => {
      const krs = `
system ECPlatform {
  database OrderDB {
    table OrderTable
  }
  service OrderService {
    domain Order {
      usecase PlaceOrder {
        resource OrderDB.OrderTable
      }
    }
  }
}
`;
      const systems = parseSystem(krs);
      const view = extractView(systems, []);

      expect(view.resourceLabelMap.get("OrderDB.OrderTable")).toBe("OrderTable");
    });

    it("is empty when no infra nodes exist", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, []);

      expect(view.resourceLabelMap.size).toBe(0);
    });
  });

  describe("resourceInferredTagsMap", () => {
    it("maps dot-notation IDs to inferred tags for table/queue-item/bucket sub-resources", () => {
      const systems = parseSystem(INFRA_KRS);
      const view = extractView(systems, []);

      expect(view.resourceInferredTagsMap.get("OrderDB.OrderTable")).toBe("table");
      expect(view.resourceInferredTagsMap.get("OrderDB.InventoryTable")).toBe("table");
      expect(view.resourceInferredTagsMap.get("EventBus.OrderCreated")).toBe("queue");
      expect(view.resourceInferredTagsMap.get("MediaStorage.ImageBucket")).toBe("storage");
    });

    it("is empty when no infra nodes exist", () => {
      const systems = parseSystem(FULL_KRS);
      const view = extractView(systems, []);

      expect(view.resourceInferredTagsMap.size).toBe(0);
    });
  });

  describe("applyInferredTags via childNodes", () => {
    it("injects inferred tag into resource nodes with dot-notation ref and no explicit tags", () => {
      const systems = parseSystem(INFRA_KRS);
      const view = extractView(systems, ["ECPlatform", "OrderService"]);

      const domainNode = view.childNodes.find((n) => n.id === "Order");
      expect(domainNode).toBeDefined();
      const usecaseNode = domainNode!.children.find((n) => n.id === "PlaceOrder");
      expect(usecaseNode).toBeDefined();
      const tableResource = usecaseNode!.children.find((n) => n.id === "OrderDB.OrderTable");
      expect(tableResource).toBeDefined();
      expect(tableResource!.tags).toContain("table");

      const queueResource = usecaseNode!.children.find((n) => n.id === "EventBus.OrderCreated");
      expect(queueResource).toBeDefined();
      expect(queueResource!.tags).toContain("queue");
    });

    it("does not override explicit tags on resource nodes", () => {
      const krs = `
system ECPlatform {
  database OrderDB {
    table OrderTable { label "注文テーブル" }
  }
  service OrderService {
    domain Order {
      usecase PlaceOrder {
        resource OrderDB.OrderTable [custom]
      }
    }
  }
}
`;
      const systems = parseSystem(krs);
      const view = extractView(systems, ["ECPlatform", "OrderService"]);

      const domainNode = view.childNodes.find((n) => n.id === "Order");
      const usecaseNode = domainNode!.children.find((n) => n.id === "PlaceOrder");
      const tableResource = usecaseNode!.children.find((n) => n.id === "OrderDB.OrderTable");
      expect(tableResource).toBeDefined();
      // explicit tag "custom" must be preserved, not replaced
      expect(tableResource!.tags).toEqual(["custom"]);
    });
  });
});
