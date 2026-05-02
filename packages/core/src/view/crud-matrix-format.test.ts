import { describe, it, expect } from "vitest";
import { extractCrudMatrix } from "./crud-matrix-extract.js";
import { formatMatrixAsMarkdown, formatMatrixAsCsv } from "./crud-matrix-format.js";
import { Parser } from "../parser/parser.js";

const KRS = `
system EC {
  database OrderDB {
    table OrderTable { label "Order table" }
  }
  service Svc {
    domain D {
      usecase PlaceOrder {
        resource OrderDB.OrderTable { operations create, read }
      }
      usecase SearchOrders {
        resource OrderDB.OrderTable { operations read, list }
      }
    }
  }
}
`;

describe("formatMatrixAsMarkdown", () => {
  it("renders a header, rows, totals, and unknown-verbs footnote", () => {
    const matrix = extractCrudMatrix(Parser.parse(KRS).value.systems);
    const md = formatMatrixAsMarkdown(matrix);
    expect(md).toContain("| usecase \\ resource | Order table | ΣC | ΣR | ΣU | ΣD |");
    expect(md).toContain("| PlaceOrder | CR | 1 | 1 | 0 | 0 |");
    expect(md).toContain("| SearchOrders | R? | 0 | 1 | 0 | 0 |");
    expect(md).toContain("| ΣC | 1 |");
    expect(md).toContain("> unrecognized verbs (?): list");
  });

  it("hides totals when showTotals=false", () => {
    const matrix = extractCrudMatrix(Parser.parse(KRS).value.systems);
    const md = formatMatrixAsMarkdown(matrix, { showTotals: false });
    expect(md).not.toContain("ΣC");
  });
});

describe("formatMatrixAsCsv", () => {
  it("emits header, rows, totals, and unknown_verbs column", () => {
    const matrix = extractCrudMatrix(Parser.parse(KRS).value.systems);
    const csv = formatMatrixAsCsv(matrix);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("usecase,service,Order table,ΣC,ΣR,ΣU,ΣD,unknown_verbs");
    expect(lines).toContain("PlaceOrder,Svc,CR,1,1,0,0,");
    expect(lines).toContain("SearchOrders,Svc,R?,0,1,0,0,list");
  });
});
