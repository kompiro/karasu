/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { isDeepStrictEqual } from "util";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, dirname, join, relative } from "path";
import { fileURLToPath } from "url";
import { Parser } from "../parser/parser.js";
import type { KrsFile } from "../types/ast.js";
import { analyze } from "./warnings.js";
import { collectModelWarnings } from "./model-warnings.js";
import { getBuiltinStyleSheet } from "../builtins/default-style.js";
import {
  buildDrillDownSvg,
  buildAllViewsSvg,
  renderEntityView,
} from "../renderer/drill-down-svg.js";
import { buildAllLayersSvg } from "../renderer/all-layers-svg.js";
import { buildDrawio } from "../exporter/drawio/build-drawio-project.js";

// A pass handed a parsed `KrsFile` reads it and never writes to it (TPL-2791).
// `analyze()` used to stamp `edge.cyclic` onto the model, so the same file
// rendered differently before and after it ran (#2791). Every pass that takes
// a finished model belongs in this table; add a new one here.
const PASSES: Record<string, (file: KrsFile) => unknown> = {
  analyze: (file) => analyze(file, [getBuiltinStyleSheet()]),
  collectModelWarnings: (file) => collectModelWarnings(file, [getBuiltinStyleSheet()]),
  buildDrillDownSvg: (file) => buildDrillDownSvg(file),
  buildAllLayersSvg: (file) => buildAllLayersSvg(file),
  buildAllViewsSvg: (file) => buildAllViewsSvg(file),
  renderEntityView: (file) => renderEntityView(file, []),
  buildDrawio: (file) => buildDrawio(file),
};

const CYCLIC = `
system S {
  service A {}
  service B {}
  service C {}
  A -> B
  B -> A
  B -> C
  C -> C
}
`;

const examplesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../examples");
function krsFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return krsFilesUnder(path);
    return path.endsWith(".krs") ? [path] : [];
  });
}

const sources: [string, string][] = [
  ["cyclic fixture", CYCLIC],
  ...krsFilesUnder(examplesRoot).map((path): [string, string] => [
    relative(examplesRoot, path),
    readFileSync(path, "utf8"),
  ]),
];

describe("no pass writes to the KrsFile it is handed (#2791, TPL-2791)", () => {
  it.each(sources)("%s", (_name, src) => {
    const changed: string[] = [];
    for (const [pass, run] of Object.entries(PASSES)) {
      const file = Parser.parse(src).value;
      const snapshot = structuredClone(file);
      run(file);
      if (!isDeepStrictEqual(file, snapshot)) changed.push(pass);
    }
    expect(changed).toEqual([]);
  });
});

describe("a KrsFile renders the same before and after analyze() (#2791)", () => {
  it("drill-down SVG is identical on either side of an analyze() call", () => {
    const file = Parser.parse(CYCLIC).value;
    const before = buildDrillDownSvg(file).svg;
    analyze(file, [getBuiltinStyleSheet()]);
    expect(buildDrillDownSvg(file).svg).toBe(before);
  });

  it("the drill-down SVG draws the cycle the way compile does, without analyze()", () => {
    const svg = buildDrillDownSvg(Parser.parse(CYCLIC).value).svg;
    expect(svg).toContain('class="krs-edge--cyclic"');
    expect(svg).toContain("#EF4444");
  });
});
