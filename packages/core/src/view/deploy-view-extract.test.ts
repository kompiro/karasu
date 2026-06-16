import { describe, it, expect } from "vitest";
import { extractDeployView } from "./deploy-view-extract.js";
import { withUnassignedSystem } from "./unassigned-system.js";
import { Parser } from "../parser/parser.js";
import type { DeployBlock, SystemNode } from "../types/ast.js";

const LOC = { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } };

function makeSystem(edges: { from: string; to: string; label?: string }[] = []): SystemNode {
  return {
    kind: "system",
    id: "EC",
    label: "EC",
    tags: [],
    annotations: [],
    properties: { links: [] },
    children: [
      {
        kind: "service",
        id: "ECommerce",
        label: "ECサイト",
        tags: [],
        annotations: [],
        properties: { links: [] },
        children: [],
        edges: [],
        loc: LOC,
      },
      {
        kind: "service",
        id: "Payment",
        label: "決済サービス",
        tags: [],
        annotations: [],
        properties: { links: [] },
        children: [],
        edges: [],
        loc: LOC,
      },
    ],
    edges: edges.map((e) => ({
      from: e.from,
      to: e.to,
      label: e.label,
      kind: "sync" as const,
      tags: [],
      loc: LOC,
    })),
    loc: LOC,
  };
}

function makeDeployBlock(
  nodes: Array<{
    kind: "oci" | "jar" | "war" | "lambda" | "function" | "assets" | "job" | "artifact";
    id: string;
    label?: string;
    realizes?: string | string[];
    runtime?: string;
  }>,
  opts: { id?: string; label?: string } = {},
): DeployBlock {
  return {
    id: opts.id ?? "Production",
    label: "label" in opts ? opts.label : "本番環境",
    nodes: nodes.map((n) => ({
      kind: n.kind,
      id: n.id,
      label: n.label,
      properties: {
        realizes:
          n.realizes === undefined
            ? undefined
            : Array.isArray(n.realizes)
              ? n.realizes
              : [n.realizes],
        runtime: n.runtime,
      },
      loc: LOC,
    })),
    loc: LOC,
  };
}

describe("extractDeployView", () => {
  it("returns empty slice when deploys is empty", () => {
    const result = extractDeployView([], []);
    expect(result.containers).toHaveLength(0);
    expect(result.unclassifiedUnits).toHaveLength(0);
    expect(result.ghostEdges).toHaveLength(0);
    expect(result.deployLabel).toBe("");
  });

  it("groups units by realizes service", () => {
    const deploy = makeDeployBlock([
      { kind: "oci", id: "order-api", realizes: "ECommerce" },
      { kind: "oci", id: "order-worker", realizes: "ECommerce" },
      { kind: "oci", id: "payment-svc", realizes: "Payment" },
    ]);
    const result = extractDeployView([deploy], [makeSystem()]);

    expect(result.containers).toHaveLength(2);
    const ecommerce = result.containers.find((c) => c.serviceId === "ECommerce")!;
    expect(ecommerce).toBeDefined();
    expect(ecommerce.serviceLabel).toBe("ECサイト");
    expect(ecommerce.units).toHaveLength(2);

    const payment = result.containers.find((c) => c.serviceId === "Payment")!;
    expect(payment.units).toHaveLength(1);
  });

  it("collects units without realizes into unclassifiedUnits", () => {
    const deploy = makeDeployBlock([
      { kind: "oci", id: "order-api", realizes: "ECommerce" },
      { kind: "job", id: "migration" },
    ]);
    const result = extractDeployView([deploy], [makeSystem()]);

    expect(result.containers).toHaveLength(1);
    expect(result.unclassifiedUnits).toHaveLength(1);
    expect(result.unclassifiedUnits[0].id).toBe("migration");
  });

  it("derives ghost edges from system edges between realized services", () => {
    const deploy = makeDeployBlock([
      { kind: "oci", id: "order-api", realizes: "ECommerce" },
      { kind: "oci", id: "payment-svc", realizes: "Payment" },
    ]);
    const system = makeSystem([{ from: "ECommerce", to: "Payment", label: "決済する" }]);
    const result = extractDeployView([deploy], [system]);

    expect(result.ghostEdges).toHaveLength(1);
    expect(result.ghostEdges[0].from).toBe("ECommerce");
    expect(result.ghostEdges[0].to).toBe("Payment");
    expect(result.ghostEdges[0].label).toBe("決済する");
  });

  it("omits system edges where one side is not realized", () => {
    const deploy = makeDeployBlock([
      { kind: "oci", id: "order-api", realizes: "ECommerce" },
      // Payment is NOT in deploy
    ]);
    const system = makeSystem([{ from: "ECommerce", to: "Payment" }]);
    const result = extractDeployView([deploy], [system]);

    expect(result.ghostEdges).toHaveLength(0);
  });

  it("places a unit in multiple containers when it realizes multiple services", () => {
    const deploy = makeDeployBlock([
      { kind: "oci", id: "monolith", realizes: ["ECommerce", "Payment"] },
      { kind: "oci", id: "payment-svc", realizes: "Payment" },
    ]);
    const result = extractDeployView([deploy], [makeSystem()]);

    expect(result.containers).toHaveLength(2);
    const ecommerce = result.containers.find((c) => c.serviceId === "ECommerce")!;
    expect(ecommerce.units).toHaveLength(1);
    expect(ecommerce.units[0].id).toBe("monolith");

    const payment = result.containers.find((c) => c.serviceId === "Payment")!;
    expect(payment.units).toHaveLength(2);
    expect(payment.units.map((u) => u.id)).toContain("monolith");
    expect(payment.units.map((u) => u.id)).toContain("payment-svc");
  });

  it("falls back to serviceId as label when service is not in system", () => {
    const deploy = makeDeployBlock([
      { kind: "oci", id: "unknown-svc", realizes: "UnknownService" },
    ]);
    const result = extractDeployView([deploy], [makeSystem()]);

    expect(result.containers[0].serviceLabel).toBe("UnknownService");
  });

  it("resolves the container label from a synthesized Unassigned system's children (#1260)", () => {
    // `withUnassignedSystem(krsFile)` wraps top-level (orphan) services in a
    // synthetic "__unassigned__" pseudo-system. extractDeployView must read
    // those children so a `realizes` pointing at an orphan service gets the
    // declared label, not the bare id. Distinct from the "not in system" case
    // above: there the target is undeclared everywhere; here it is declared,
    // just at the top level.
    const unassigned: SystemNode = {
      kind: "system",
      id: "__unassigned__",
      label: "Unassigned",
      tags: [],
      annotations: [],
      properties: { links: [] },
      children: [
        {
          kind: "service",
          id: "OrderService",
          label: "注文サービス",
          tags: [],
          annotations: [],
          properties: { links: [] },
          children: [],
          edges: [],
          loc: LOC,
        },
      ],
      edges: [],
      loc: LOC,
    };
    const deploy = makeDeployBlock([{ kind: "oci", id: "order-app", realizes: "OrderService" }]);
    const result = extractDeployView([deploy], [makeSystem(), unassigned]);
    const container = result.containers.find((c) => c.serviceId === "OrderService");
    expect(container).toBeDefined();
    expect(container!.serviceLabel).toBe("注文サービス");
  });

  it("uses the deploy block label", () => {
    const deploy = makeDeployBlock([{ kind: "oci", id: "api", realizes: "ECommerce" }]);
    const result = extractDeployView([deploy], [makeSystem()]);
    expect(result.deployLabel).toBe("本番環境");
  });

  it("falls back to deploy block id when label is absent", () => {
    const deploy = makeDeployBlock([{ kind: "oci", id: "api", realizes: "ECommerce" }], {
      id: "Production",
      label: undefined,
    });
    const result = extractDeployView([deploy], [makeSystem()]);
    expect(result.deployLabel).toBe("Production");
  });

  describe("selectedId", () => {
    it("selects first block by default when no selectedId given (multiple blocks)", () => {
      const prod = makeDeployBlock([{ kind: "oci", id: "prod-api", realizes: "ECommerce" }], {
        id: "prod",
        label: "本番環境",
      });
      const staging = makeDeployBlock([{ kind: "oci", id: "staging-api", realizes: "ECommerce" }], {
        id: "staging",
        label: "ステージング",
      });
      const result = extractDeployView([prod, staging], [makeSystem()]);
      expect(result.deployLabel).toBe("本番環境");
      expect(result.containers[0].units[0].id).toBe("prod-api");
    });

    it("selects block by id when selectedId matches", () => {
      const prod = makeDeployBlock([{ kind: "oci", id: "prod-api", realizes: "ECommerce" }], {
        id: "prod",
        label: "本番環境",
      });
      const staging = makeDeployBlock([{ kind: "oci", id: "staging-api", realizes: "ECommerce" }], {
        id: "staging",
        label: "ステージング",
      });
      const result = extractDeployView([prod, staging], [makeSystem()], "staging");
      expect(result.deployLabel).toBe("ステージング");
      expect(result.containers[0].units[0].id).toBe("staging-api");
    });

    it("falls back to first block when selectedId not found", () => {
      const prod = makeDeployBlock([{ kind: "oci", id: "prod-api", realizes: "ECommerce" }], {
        id: "prod",
        label: "本番環境",
      });
      const result = extractDeployView([prod], [makeSystem()], "nonexistent");
      expect(result.deployLabel).toBe("本番環境");
      expect(result.containers[0].units[0].id).toBe("prod-api");
    });
  });

  describe("infra realize targets (store kind)", () => {
    it("forms a container for a `store` realizing a system-nested database, with the label resolved", () => {
      const krs = `
system EC {
  database OrderDB { label "注文DB" }
}
deploy Prod {
  store orderStore {
    type "Aurora PostgreSQL 15"
    realizes OrderDB
  }
}
`;
      const file = Parser.parse(krs).value;
      const slice = extractDeployView(file.deploys, withUnassignedSystem(file));
      const container = slice.containers.find((c) => c.serviceId === "OrderDB");
      expect(container).toBeDefined();
      expect(container!.serviceLabel).toBe("注文DB");
      expect(container!.units.map((u) => u.id)).toEqual(["orderStore"]);
    });

    it("resolves the label of a top-level (unassigned) infra realize target", () => {
      const krs = `
database OrderDB { label "注文DB" }
deploy Prod {
  store orderStore {
    type "Aurora PostgreSQL 15"
    realizes OrderDB
  }
}
`;
      const file = Parser.parse(krs).value;
      const slice = extractDeployView(file.deploys, withUnassignedSystem(file));
      const container = slice.containers.find((c) => c.serviceId === "OrderDB");
      expect(container).toBeDefined();
      expect(container!.serviceLabel).toBe("注文DB");
    });

    it("emits a service→infra ghost edge when both the service and the store are realized (#1658)", () => {
      const krs = `
system EC {
  service ECommerce {
    domain Order {
      usecase PlaceOrder {
        resource OrderDB.OrderTable
      }
    }
  }
  database OrderDB {
    table OrderTable {}
  }
}
deploy Prod {
  oci ecommerceApp {
    runtime "Node.js 20"
    realizes ECommerce
  }
  store orderStore {
    type "Aurora PostgreSQL 15"
    realizes OrderDB
  }
}
`;
      const file = Parser.parse(krs).value;
      const slice = extractDeployView(file.deploys, withUnassignedSystem(file));
      const edge = slice.ghostEdges.find((e) => e.from === "ECommerce" && e.to === "OrderDB");
      expect(edge).toBeDefined();
    });

    it("does not emit the service→infra edge when the depending service is not realized", () => {
      const krs = `
system EC {
  service ECommerce {
    domain Order {
      usecase PlaceOrder {
        resource OrderDB.OrderTable
      }
    }
  }
  database OrderDB {
    table OrderTable {}
  }
}
deploy Prod {
  store orderStore {
    type "Aurora PostgreSQL 15"
    realizes OrderDB
  }
}
`;
      const file = Parser.parse(krs).value;
      const slice = extractDeployView(file.deploys, withUnassignedSystem(file));
      // OrderDB is realized but ECommerce is not, so no ghost edge into the store.
      expect(slice.ghostEdges.filter((e) => e.to === "OrderDB")).toHaveLength(0);
    });
  });
});
