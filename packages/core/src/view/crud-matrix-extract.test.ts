import { describe, it, expect } from "vitest";
import { extractCrudMatrix, formatCell, cellKey } from "./crud-matrix-extract.js";
import { Parser } from "../parser/parser.js";
import { withUnassignedSystem } from "./unassigned-system.js";
import type { SystemNode } from "../types/ast.js";

function parseSystems(krs: string): SystemNode[] {
  return Parser.parse(krs).value.systems;
}

function parseSystemsWithUnassigned(krs: string): SystemNode[] {
  return withUnassignedSystem(Parser.parse(krs).value);
}

const KRS = `
system EC {
  database OrderDB {
    table OrderTable { label "Order table" }
    table InventoryTable { label "Inventory table" }
  }
  queue EventBus {
    queue OrderCreated { label "Order created" }
  }

  service OrderService {
    domain Order {
      usecase PlaceOrder {
        resource OrderDB.OrderTable {
          operations create, read
        }
        resource EventBus.OrderCreated {
          operations create
        }
      }
      usecase CancelOrder {
        resource OrderDB.OrderTable {
          operations update, delete
        }
      }
      usecase SearchOrders {
        resource OrderDB.OrderTable {
          operations read, list
        }
      }
      usecase OpaqueOrders {
        resource OrderDB.InventoryTable
      }
    }
  }
  service ReportService {
    domain Report {
      usecase ExportReport {
        resource OrderDB.OrderTable {
          operations read
        }
      }
    }
  }
}
`;

describe("extractCrudMatrix", () => {
  it("collects rows, columns, and cells with CRUD verbs", () => {
    const m = extractCrudMatrix(parseSystems(KRS));
    expect(m.rows.map((r) => r.usecaseId)).toEqual([
      "CancelOrder",
      "OpaqueOrders",
      "PlaceOrder",
      "SearchOrders",
      "ExportReport",
    ]);
    expect(m.columns.map((c) => c.resourceId)).toEqual([
      "OrderDB.InventoryTable",
      "OrderDB.OrderTable",
      "EventBus.OrderCreated",
    ]);
    const place = m.cells.get(cellKey("PlaceOrder", "OrderDB.OrderTable"))!;
    expect(formatCell(place)).toBe("CR");
    expect(place.isWrite).toBe(true);
    const cancel = m.cells.get(cellKey("CancelOrder", "OrderDB.OrderTable"))!;
    expect(formatCell(cancel)).toBe("UD");
    const search = m.cells.get(cellKey("SearchOrders", "OrderDB.OrderTable"))!;
    expect(formatCell(search)).toBe("R?");
    expect(search.unknownVerbs).toEqual(["list"]);
    const opaque = m.cells.get(cellKey("OpaqueOrders", "OrderDB.InventoryTable"))!;
    expect(formatCell(opaque)).toBe("?");
    expect(opaque.declared).toBe(false);
  });

  it("computes row and column totals", () => {
    const m = extractCrudMatrix(parseSystems(KRS));
    expect(m.rowTotals.get("PlaceOrder")).toEqual({ create: 2, read: 1, update: 0, delete: 0 });
    expect(m.columnTotals.get("OrderDB.OrderTable")).toEqual({
      create: 1,
      read: 3,
      update: 1,
      delete: 1,
    });
  });

  it("filters by service", () => {
    const m = extractCrudMatrix(parseSystems(KRS), { serviceFilter: ["ReportService"] });
    expect(m.rows.map((r) => r.usecaseId)).toEqual(["ExportReport"]);
  });

  it("filters by infra kind", () => {
    const m = extractCrudMatrix(parseSystems(KRS), { infraFilter: ["queue"] });
    expect(m.columns.map((c) => c.resourceId)).toEqual(["EventBus.OrderCreated"]);
  });

  it("filters writes-only", () => {
    const m = extractCrudMatrix(parseSystems(KRS), { writesOnly: true });
    expect(m.rows.map((r) => r.usecaseId).sort()).toEqual(["CancelOrder", "PlaceOrder"]);
  });

  it("default keeps empty rows/columns; --omit-empty drops them", () => {
    const empty = `
system S {
  database DB { table A }
  service Svc {
    domain D {
      usecase Touched { resource DB.A { operations read } }
      usecase Untouched
    }
  }
}`;
    const shown = extractCrudMatrix(parseSystems(empty));
    expect(shown.rows.map((r) => r.usecaseId)).toContain("Untouched");
    const omitted = extractCrudMatrix(parseSystems(empty), { omitEmpty: true });
    expect(omitted.rows.map((r) => r.usecaseId)).not.toContain("Untouched");
    expect(omitted.omitted.rows).toBe(1);
  });

  it("decorated verb (list:read) contributes to recognized set without ? suffix", () => {
    const krs = `
system S {
  database DB { table T { label "T" } }
  service Svc {
    domain D {
      usecase U {
        resource DB.T { operations list:read }
      }
    }
  }
}`;
    const m = extractCrudMatrix(parseSystems(krs));
    const cell = m.cells.get(cellKey("U", "DB.T"))!;
    expect(formatCell(cell)).toBe("R");
    expect(cell.hasUnknown).toBe(false);
    expect(cell.isWrite).toBe(false);
  });

  it("decorated 1:N (replace:create,delete) contributes to both ΣC and ΣD as a write", () => {
    const krs = `
system S {
  database DB { table T { label "T" } }
  service Svc {
    domain D {
      usecase U {
        resource DB.T { operations replace:create,delete }
      }
    }
  }
}`;
    const m = extractCrudMatrix(parseSystems(krs));
    const cell = m.cells.get(cellKey("U", "DB.T"))!;
    expect(formatCell(cell)).toBe("CD");
    expect(cell.isWrite).toBe(true);
    expect(m.columnTotals.get("DB.T")).toEqual({ create: 1, read: 0, update: 0, delete: 1 });
  });

  it("marks external resources via tag on usecase resource declaration", () => {
    const ext = `
system S {
  service Svc {
    domain D {
      usecase U {
        resource ExternalAPI [external] { operations read }
      }
    }
  }
}`;
    const m = extractCrudMatrix(parseSystems(ext));
    expect(m.columns[0].external).toBe(true);
  });
});

describe("extractCrudMatrix — top-level (unassigned) blocks via withUnassignedSystem", () => {
  // Mirrors the shape produced by `karasu translate --from db ... --emit-bindings`,
  // which emits `database` and `service` at the top level (no enclosing
  // `system { ... }`). Without `withUnassignedSystem` wrapping, these orphans
  // were invisible to extractCrudMatrix and the matrix came out empty.
  const ORPHAN_KRS = `
database OrderDB {
  table OrdersTable { label "orders" }
  table PaymentsTable { label "payments" }
}

service OrderDBService {
  usecase ManageOrders {
    resource OrderDB.OrdersTable {
      operations select:read, insert:create, update, delete
    }
  }
  usecase ManagePayments {
    resource OrderDB.PaymentsTable {
      operations select:read, insert:create, update, delete
    }
  }
}
`;

  it("collects rows and columns from top-level blocks when wrapped", () => {
    const m = extractCrudMatrix(parseSystemsWithUnassigned(ORPHAN_KRS));
    expect(m.rows.map((r) => r.usecaseId)).toEqual(["ManageOrders", "ManagePayments"]);
    expect(m.columns.map((c) => c.resourceId)).toEqual([
      "OrderDB.OrdersTable",
      "OrderDB.PaymentsTable",
    ]);
  });

  it("resolves CRUD decoration on orphan-block usecases without `?` suffix", () => {
    const m = extractCrudMatrix(parseSystemsWithUnassigned(ORPHAN_KRS));
    const cell = m.cells.get(cellKey("ManageOrders", "OrderDB.OrdersTable"))!;
    expect(formatCell(cell)).toBe("CRUD");
    expect(cell.isWrite).toBe(true);
  });

  it("returns empty matrix without wrapping (regression guard)", () => {
    // Documents the prior bug: without withUnassignedSystem the matrix is empty
    // because parseSystems returns krsFile.systems which excludes top-level
    // orphans. compileProject now wraps internally, so consumers reading
    // result.systems do not have to.
    const m = extractCrudMatrix(parseSystems(ORPHAN_KRS));
    expect(m.rows).toEqual([]);
    expect(m.columns).toEqual([]);
  });
});
