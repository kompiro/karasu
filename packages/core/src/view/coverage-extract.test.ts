import { describe, it, expect } from "vitest";
import { extractCoverage } from "./coverage-extract.js";
import { Parser } from "../parser/parser.js";
import type { SystemNode } from "../types/ast.js";

function parseSystems(krs: string): SystemNode[] {
  return Parser.parse(krs).value.systems;
}

const KRS = `
system EC {
  database OrderDB {
    table OrderTable { label "Order table" }
  }
  service OrderService {
    domain Order {
      usecase PlaceOrder {
        resource OrderDB.OrderTable { operations create, read }
      }
      usecase CancelOrder {
        resource OrderDB.OrderTable { operations update, delete }
      }
      entity OrderEntity
    }
    domain Thin {
      usecase Noop
    }
  }
}
`;

describe("extractCoverage", () => {
  it("reports every domain with per-domain counts", () => {
    const report = extractCoverage(parseSystems(KRS));
    const ids = report.domains.map((d) => d.domainId).sort();
    expect(ids).toEqual(["Order", "Thin"]);

    const order = report.domains.find((d) => d.domainId === "Order")!;
    expect(order.usecases).toBe(2);
    expect(order.entities).toBe(1);
    expect(order.resourceRefs).toBe(1); // both usecases touch the same OrderDB.OrderTable
    expect(order.serviceId).toBe("OrderService");
    expect(order.systemId).toBe("EC");
  });

  it("flags the relatively thin domain, not the rich one", () => {
    const report = extractCoverage(parseSystems(KRS));
    const order = report.domains.find((d) => d.domainId === "Order")!;
    const thin = report.domains.find((d) => d.domainId === "Thin")!;
    expect(order.thin).toBe(false);
    expect(thin.thin).toBe(true);
    expect(thin.score).toBeLessThan(order.score);
  });

  it("does not drop domains even when empty (surfaces, not filters)", () => {
    const report = extractCoverage(parseSystems(KRS));
    // Thin has 0 entities / 0 resources but is still present.
    const thin = report.domains.find((d) => d.domainId === "Thin")!;
    expect(thin.entities).toBe(0);
    expect(thin.resourceRefs).toBe(0);
  });

  it("honors an explicit threshold override", () => {
    const report = extractCoverage(parseSystems(KRS), { threshold: 1.1 });
    // Every score < 1.1 → all thin.
    expect(report.domains.every((d) => d.thin)).toBe(true);
    expect(report.threshold).toBe(1.1);
  });

  it("returns an empty report for a model with no domains", () => {
    const report = extractCoverage(parseSystems(`system S { }`));
    expect(report.domains).toEqual([]);
  });
});

/**
 * Physical-layer recovery (#2078). Measured from the **declaration** side —
 * counting outward from the logical model can only find leaves something
 * already points at, which is how #1991's reverse run measured clean while
 * missing 9 of 35 real tables.
 */
describe("extractCoverage physical section", () => {
  const HATO = `
system Hato {
  database HatoDB {
    table goals
    table goal_proposals
    table daily_usage
    table sessions
  }
  service Api {
    domain Goals {
      usecase ListGoals { resource HatoDB.goals { operations read } }
      usecase ListProposals { resource HatoDB.goal_proposals { operations read } }
      entity Goal
      entity GoalProposal { table HatoDB.goal_proposals }
    }
    domain Sessions {
      entity Session { table HatoDB.sessions }
    }
  }
}
`;

  it("splits the two drop shapes apart", () => {
    const { physical } = extractCoverage(parseSystems(HATO));
    const db = physical.infra.find((i) => i.infraId === "HatoDB")!;
    expect(db.kind).toBe("database");
    expect(db.leaves).toBe(4);

    // `goals` is touched by a usecase but no entity maps it — the entity was
    // written and its `table` line dropped. Mechanically repairable.
    expect(db.unmappedButReferenced).toEqual(["goals"]);
    // `daily_usage` has neither a mapping nor a reference: nothing in the
    // logical model represents it, so its domain was never dug. Different
    // repair, so it must not be folded in with the above (TPL-999).
    expect(db.unreferenced).toEqual(["daily_usage"]);
    // `sessions` is mapped but untouched by any usecase — represented, so
    // reported in neither list.
    expect(db.mappedByEntity).toBe(2);
    expect(db.referencedByResource).toBe(2);
  });

  it("lists tableless entities as a fact, with their domain", () => {
    const { physical } = extractCoverage(parseSystems(HATO));
    expect(physical.tablelessEntities).toEqual([{ entityId: "Goal", domainId: "Goals" }]);
  });

  it("counts a leaf reached through the canonical bare-resource form", () => {
    // `resource Order` → `entity Order` → `table OrderDB.orders` (ADR-1870).
    // Reading only `res.ref` would report a fully-modeled table as untouched.
    const { physical } = extractCoverage(
      parseSystems(`
system EC {
  database OrderDB {
    table orders
  }
  service Svc {
    domain Order {
      usecase PlaceOrder { resource Order { operations create } }
      entity Order { table OrderDB.orders }
    }
  }
}
`),
    );
    const db = physical.infra[0];
    expect(db.referencedByResource).toBe(1);
    expect(db.unmappedButReferenced).toEqual([]);
    expect(db.unreferenced).toEqual([]);
  });

  it("covers queue and storage leaves, not just database tables", () => {
    const { physical } = extractCoverage(
      parseSystems(`
system S {
  queue Jobs {
    queue reindex
  }
  storage Assets {
    bucket avatars
  }
  service Svc {
    domain D {
      usecase Reindex { resource Jobs.reindex { operations create } }
    }
  }
}
`),
    );
    const byId = Object.fromEntries(physical.infra.map((i) => [i.infraId, i]));
    expect(byId.Jobs.kind).toBe("queue");
    expect(byId.Jobs.unmappedButReferenced).toEqual(["reindex"]);
    expect(byId.Assets.kind).toBe("storage");
    expect(byId.Assets.unreferenced).toEqual(["avatars"]);
  });

  it("is empty for a model that declares no physical layer", () => {
    // Not a measurement of zero: there is no physical layer to have recovered,
    // and a tableless entity carries no information without one.
    const { physical } = extractCoverage(
      parseSystems(`
system S {
  service Svc {
    domain D {
      usecase U
      entity E
    }
  }
}
`),
    );
    expect(physical.infra).toEqual([]);
    expect(physical.tablelessEntities).toEqual([]);
  });

  it("leaves the per-domain scores untouched", () => {
    // The physical dimension is deliberately not folded into `score`: the score
    // is normalized across domains, so a new dimension would move every
    // existing `thin` verdict (ADR-1895).
    const report = extractCoverage(parseSystems(KRS));
    const order = report.domains.find((d) => d.domainId === "Order")!;
    const thin = report.domains.find((d) => d.domainId === "Thin")!;
    expect(order.score).toBe(0.75); // 2/2 usecases + 1/1 entities + 1/1 resources + 0/1 edges
    expect(thin.score).toBe(0.125); // 1/2 usecases only
    expect(report.threshold).toBe(0.5 * ((0.75 + 0.125) / 2));
  });
});
