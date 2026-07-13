import { describe, it, expect } from "vitest";
import { Parser } from "../parser/parser.js";
import { buildEntityResolver } from "./resource-entity.js";
import type { KrsFile, ResourceNode } from "../types/ast.js";

function roots(file: KrsFile) {
  return [...file.systems, ...file.services, ...file.domains];
}

/** Find the single resource with the given id anywhere in the model. */
function findResource(file: KrsFile, id: string): ResourceNode {
  let found: ResourceNode | undefined;
  const visit = (node: { kind: string; id: string; children: unknown[] }) => {
    if (node.kind === "resource" && node.id === id) found = node as unknown as ResourceNode;
    for (const child of node.children) visit(child as never);
  };
  for (const node of [...file.systems, ...file.services, ...file.domains]) visit(node as never);
  if (!found) throw new Error(`resource ${id} not found`);
  return found;
}

describe("buildEntityResolver", () => {
  it("resolves physical dot-notation directly to the infra parent", () => {
    const file = Parser.parse(`
system EC {
  service OrderService {
    domain Ordering {
      usecase PlaceOrder {
        resource OrderDB.orders
      }
    }
  }
  database OrderDB { table orders }
}
    `).value;
    const resolver = buildEntityResolver(roots(file));
    const r = resolver.resolve(findResource(file, "OrderDB.orders"));
    expect(r).toEqual({ infraParentId: "OrderDB", ambiguous: false });
  });

  it("resolves a bare id to a unique entity and its physical mapping", () => {
    const file = Parser.parse(`
system EC {
  service OrderService {
    domain Ordering {
      entity Order { table OrderDB.orders }
      usecase PlaceOrder {
        resource Order
      }
    }
  }
  database OrderDB { table orders }
}
    `).value;
    const resolver = buildEntityResolver(roots(file));
    const r = resolver.resolve(findResource(file, "Order"));
    expect(r).toEqual({ entityId: "Order", infraParentId: "OrderDB", ambiguous: false });
  });

  it("resolves an entity across domain/service boundaries (flat id namespace)", () => {
    const file = Parser.parse(`
system EC {
  service OrderService {
    domain Ordering {
      usecase PlaceOrder {
        resource Customer
      }
    }
  }
  service CustomerService {
    domain Customers {
      entity Customer { table CustomerDB.customers }
    }
  }
  database CustomerDB { table customers }
}
    `).value;
    const resolver = buildEntityResolver(roots(file));
    const r = resolver.resolve(findResource(file, "Customer"));
    expect(r).toEqual({ entityId: "Customer", infraParentId: "CustomerDB", ambiguous: false });
  });

  it("resolves logically but yields no infra parent when the entity has no table mapping", () => {
    const file = Parser.parse(`
system EC {
  service OrderService {
    domain Ordering {
      entity Order {}
      usecase PlaceOrder {
        resource Order
      }
    }
  }
}
    `).value;
    const resolver = buildEntityResolver(roots(file));
    const r = resolver.resolve(findResource(file, "Order"));
    expect(r).toEqual({ entityId: "Order", infraParentId: undefined, ambiguous: false });
  });

  it("marks a bare id matching more than one entity as ambiguous (no resolution)", () => {
    const file = Parser.parse(`
system EC {
  service OrderService {
    domain Ordering {
      entity Order { table OrderDB.orders }
      usecase PlaceOrder {
        resource Order
      }
    }
  }
  service ArchiveService {
    domain Archive {
      entity Order { table ArchiveDB.orders }
    }
  }
  database OrderDB { table orders }
  database ArchiveDB { table orders }
}
    `).value;
    const resolver = buildEntityResolver(roots(file));
    const r = resolver.resolve(findResource(file, "Order"));
    expect(r).toEqual({ ambiguous: true });
  });

  it("does not resolve a bare id with no matching entity", () => {
    const file = Parser.parse(`
system EC {
  service OrderService {
    domain Ordering {
      usecase PlaceOrder {
        resource Order
      }
    }
  }
}
    `).value;
    const resolver = buildEntityResolver(roots(file));
    const r = resolver.resolve(findResource(file, "Order"));
    expect(r).toEqual({ ambiguous: false });
    expect(r.entityId).toBeUndefined();
    expect(r.infraParentId).toBeUndefined();
  });
});
