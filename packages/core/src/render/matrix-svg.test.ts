import { describe, it, expect } from "vitest";
import { extractCrudMatrix } from "../view/crud-matrix-extract.js";
import { renderMatrixAsSvg } from "./matrix-svg.js";
import { Parser } from "../parser/parser.js";

const KRS = `
system EC {
  database OrderDB { table OrderTable { label "Order table" } }
  service Svc {
    domain D {
      usecase PlaceOrder { resource OrderDB.OrderTable { operations create, read } }
      usecase Search { resource OrderDB.OrderTable { operations read, list } }
    }
  }
}
`;

describe("renderMatrixAsSvg", () => {
  it("emits an SVG containing column header, cell labels, and totals", () => {
    const m = extractCrudMatrix(Parser.parse(KRS).value.systems);
    const svg = renderMatrixAsSvg(m);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("Order table");
    expect(svg).toContain(">CR<");
    expect(svg).toContain(">R?<");
    expect(svg).toContain(">ΣC<");
    expect(svg).toContain("unrecognized verbs (?): list");
  });

  it("hides totals when showTotals=false", () => {
    const m = extractCrudMatrix(Parser.parse(KRS).value.systems);
    const svg = renderMatrixAsSvg(m, { showTotals: false });
    expect(svg).not.toContain(">ΣC<");
  });
});
