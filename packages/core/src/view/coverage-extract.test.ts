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
