import { describe, it, expect } from "vitest";
import { compile } from "../index.js";

// #3493: an `[implicit]` edge is the synthetic service→service edge the system
// view derives from a cross-service domain edge; no `.krs` source writes it.
// These tests start from source and read the SVG, so they cover the derivation,
// the hand-off to `resolveStyles` as `extraEdges`, the cascade and the renderer
// together. `resolver/style-resolver.test.ts` pins the same styles on hand-built
// edges; `at-0053-domain-to-domain-edges.spec.ts` pins the builtin colour in the
// browser but not a user rule (AT-0053 Case 6).

const MODEL = `
system S {
  service Orders {
    domain Checkout {
      Checkout -> Charge
      Checkout --> Record
    }
  }
  service Billing {
    domain Charge
  }
  service Audit {
    domain Record
  }
}
`;

interface DrawnEdge {
  stroke: string;
  dash: string | undefined;
}

function render(styleSource?: string) {
  // The root view: it derives the implicit edges, as the system frames show them.
  const result = compile(MODEL, styleSource === undefined ? {} : { styleSource });
  return {
    svg: result.svg,
    errors: result.diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
  };
}

/** The drawn line of the edge `from -> to`, skipping its wide transparent hit line. */
function drawnEdge(svg: string, from: string, to: string): DrawnEdge {
  const open = `<g data-edge-from="${from}" data-edge-to="${to}"`;
  const start = svg.indexOf(open);
  if (start < 0) throw new Error(`no edge ${from} -> ${to}`);
  const group = svg.slice(start, svg.indexOf("</g>", start));
  const line = /<(?:line|path|polyline)\b(?![^>]*krs-edge__hitline)[^>]*>/.exec(group)?.[0];
  if (!line) throw new Error(`no drawn line for ${from} -> ${to}`);
  const attr = (name: string) => new RegExp(`\\b${name}="([^"]+)"`).exec(line)?.[1];
  return { stroke: attr("stroke") ?? "", dash: attr("stroke-dasharray") };
}

describe("[implicit] edges derived on the system view (#3493)", () => {
  it("draws both amber, and only the async one dashed, with the builtin theme", () => {
    const { svg, errors } = render();
    expect(errors).toEqual([]);
    expect(drawnEdge(svg, "Orders", "Billing")).toEqual({ stroke: "#F59E0B", dash: undefined });
    expect(drawnEdge(svg, "Orders", "Audit")).toEqual({ stroke: "#F59E0B", dash: "8 4" });
  });

  it("lets a user edge[implicit] rule replace the builtin colour and line style", () => {
    const { svg, errors } = render("edge[implicit] { color: #A855F7; border-style: dotted; }");
    expect(errors).toEqual([]);
    expect(drawnEdge(svg, "Orders", "Billing")).toEqual({ stroke: "#A855F7", dash: "2 2" });
  });
});
