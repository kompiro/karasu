import { describe, it, expect } from "vitest";
import { compile } from "../index.js";

// #3429: a read / write edge is the synthetic usecase→resource edge a domain
// drill-down derives from `operations`; no `.krs` source writes it. These tests
// start from source and read the SVG, so they cover the derivation, the hand-off
// to `resolveStyles` as `extraEdges`, the cascade and the renderer together.
// `resolver/style-resolver.test.ts` pins the same widths on hand-built edges.

const MODEL = `
system S {
  service Api {
    domain Orders {
      usecase PlaceOrder {
        resource OrderDB.Orders { operations insert:create }
        PlaceOrder -> ListOrders
      }
      usecase ListOrders {
        resource OrderDB.Items { operations select:read }
      }
    }
  }
  database OrderDB {
    table Orders
    table Items
  }
}
`;

interface Rendered {
  svg: string;
  errors: string[];
}

function render(styleSource?: string): Rendered {
  const result = compile(MODEL, {
    viewPath: ["S", "Api", "Orders"],
    ...(styleSource === undefined ? {} : { styleSource }),
  });
  return {
    svg: result.svg,
    errors: result.diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
  };
}

/** The drawn `stroke-width` of the edge `from -> to`, skipping its wide transparent hit line. */
function edgeWidth(svg: string, from: string, to: string): number {
  const open = `<g data-edge-from="${from}" data-edge-to="${to}"`;
  const start = svg.indexOf(open);
  if (start < 0) throw new Error(`no edge ${from} -> ${to}`);
  const group = svg.slice(start, svg.indexOf("</g>", start));
  const line =
    /<(?:line|path|polyline)\b(?![^>]*krs-edge__hitline)[^>]*\bstroke-width="([\d.]+)"/.exec(group);
  if (!line) throw new Error(`no drawn line for ${from} -> ${to}`);
  return Number(line[1]);
}

describe("read / write edges derived in a domain drill-down (#3429)", () => {
  it("draws a write access wider than a read access with the builtin theme", () => {
    const { svg, errors } = render();
    expect(errors).toEqual([]);
    expect(edgeWidth(svg, "PlaceOrder", "OrderDB.Orders")).toBe(2);
    expect(edgeWidth(svg, "ListOrders", "OrderDB.Items")).toBe(1.5);
  });

  it("keeps read narrower than write when a user sheet sets a width on every edge", () => {
    // A bare `edge` rule is less specific than the builtin `edge[read]` /
    // `edge[write]` rules, so it must not flatten the two widths into one.
    const { svg, errors } = render("edge { stroke-width: 3px; }");
    expect(errors).toEqual([]);
    // The plain usecase edge takes the user width, so the sheet did apply.
    expect(edgeWidth(svg, "PlaceOrder", "ListOrders")).toBe(3);
    expect(edgeWidth(svg, "PlaceOrder", "OrderDB.Orders")).toBe(2);
    expect(edgeWidth(svg, "ListOrders", "OrderDB.Items")).toBe(1.5);
  });
});
