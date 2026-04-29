/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { Parser } from "./parser/parser.js";
import { compile } from "./index.js";
import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = resolve(__dirname, "../../../examples/feature-samples");

const files = readdirSync(dir).filter((f: string) => f.endsWith(".krs"));

describe("feature-samples: all files parse without errors", () => {
  it.each(files)("%s", (file) => {
    const src = readFileSync(resolve(dir, file), "utf8");
    const result = Parser.parse(src);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });
});

describe("feature-samples: domain-drift.krs demonstrates domain-to-domain edges", () => {
  it("parses without errors and has a domain edge", () => {
    const src = readFileSync(resolve(dir, "domain-drift.krs"), "utf8");
    const result = Parser.parse(src);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
    // OrderDomain should have an outgoing edge to PaymentDomain
    const system = result.value.systems[0];
    const orderService = system.children.find((c) => c.id === "OrderService");
    const orderDomain = orderService?.children.find((c) => c.id === "OrderDomain");
    expect(orderDomain?.edges.some((e) => e.to === "PaymentDomain")).toBe(true);
  });
});

// Regression guard for #969: getting-started ships with `service[external]
// { column: right; }`. The column hint must take effect end-to-end through
// compile() so that Payment / Inventory render to the right of Notification
// and the infra row. Without this, an accidental break in the resolver →
// renderer wiring (e.g. forgetting to pass `styles.layoutHints` into
// `layout()`) would silently fall back to declaration order, which is what
// the screenshot in #969 originally showed.
describe("getting-started: column hint affects rendered x positions (#969)", () => {
  function extractRectX(svg: string, nodeId: string): number {
    // Find the node's opening `<g>` and read the `x` attribute on the first
    // following `<rect ... x="..."`. Path-based shapes (cylinder, queue,
    // storage) anchor differently; this helper is used only on rect-shaped
    // services where x reflects the layer ordering.
    const tagIdx = svg.indexOf(`data-node-id="${nodeId}"`);
    if (tagIdx === -1) throw new Error(`No node tag for ${nodeId}`);
    const after = svg.slice(tagIdx);
    const m = after.match(/<rect\b[^>]*?\bx="(\d+(?:\.\d+)?)"/);
    if (!m) throw new Error(`No rect x found after ${nodeId}`);
    return parseFloat(m[1]);
  }

  it("places Payment / Inventory to the right of Notification", () => {
    const exampleDir = resolve(__dirname, "../../../examples/getting-started-en");
    let krs = readFileSync(resolve(exampleDir, "index.krs"), "utf8");
    const styleSrc = readFileSync(resolve(exampleDir, "default.krs.style"), "utf8");
    // Strip `@import` since compile() takes the style source directly.
    krs = krs.replace(/@import [^\n]*\n/, "");
    const result = compile(krs, { diagramType: "system", styleSource: styleSrc });

    const notificationX = extractRectX(result.svg, "Notification");
    const paymentX = extractRectX(result.svg, "Payment");
    const inventoryX = extractRectX(result.svg, "Inventory");
    expect(notificationX).toBeLessThan(paymentX);
    expect(notificationX).toBeLessThan(inventoryX);
  });
});
