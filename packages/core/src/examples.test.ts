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

describe("feature-samples: domain-drift.krs triggers drift warning", () => {
  it("emits exactly 1 domain-dispersal warning", () => {
    const src = readFileSync(resolve(dir, "domain-drift.krs"), "utf8");
    const result = Parser.parse(src);
    const warnings = analyze(result.value, []);
    const drift = warnings.filter((w) => w.kind === "domain-dispersal");
    expect(drift).toHaveLength(1);
  });
});
