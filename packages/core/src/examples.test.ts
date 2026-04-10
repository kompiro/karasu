/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { Parser } from "./parser/parser.js";
import { analyze } from "./resolver/warnings.js";
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
