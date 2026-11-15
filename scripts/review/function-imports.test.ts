import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkImports, type ImportPolicy, readImports } from "./function-imports.ts";

// A repo with a boundary (`functions/`, `lib/`) and a module off it (`other/`).
const ROOT = mkdtempSync(join(tmpdir(), "function-imports-"));
for (const file of [
  "lib/a.ts",
  "lib/b.tsx",
  "lib/c.ts",
  "lib/dir/index.ts",
  "lib/plain.js",
  "lib/j.ts",
  "lib/data.json",
  "lib/z.ts",
  "lib/z.tsx",
  "lib/a.test.ts",
  "other/x.ts",
]) {
  mkdirSync(dirname(join(ROOT, file)), { recursive: true });
  writeFileSync(join(ROOT, file), "export const x = 1;\n");
}
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const POLICY: ImportPolicy = { packages: new Set(["@resvg/resvg-wasm"]), builtins: new Set() };

/** The problems the guard reports for one function holding `source`. */
const check = (source: string, file = "functions/f.ts", policy = POLICY) =>
  checkImports({
    root: ROOT,
    files: [file],
    read: () => source,
    policy,
    onBoundary: (path) =>
      (path.startsWith("functions/") || path.startsWith("lib/")) && !path.includes(".test."),
  });

describe("checkImports: what it must catch", () => {
  // Declined #16 / #20 in PR #3824, reopened by kompiro.
  it.each([
    ['const m = await import("" + name);'],
    ["const m = await import(name);"],
    ["const m = await import(`../lib/${name}.js`);"],
    ['const m = require("" + name);'],
    ["const m = require(name);"],
    ["const m = require(`../lib/${name}`);"],
  ])("fails on a computed specifier: %s", (source) => {
    expect(check(source).problems).toEqual(["functions/f.ts:1: computed import specifier"]);
  });

  // Declined #21 in PR #3824, reopened by kompiro.
  it.each([
    ['import { readFileSync } from "node:fs";', "node:fs"],
    ['import fs from "fs";', "node:fs"],
    ['import { readFile } from "fs/promises";', "node:fs/promises"],
    ['const path = require("node:path");', "node:path"],
    ['const c = await import("node:crypto");', "node:crypto"],
  ])("fails on a Node built-in that is not allowed: %s", (source, name) => {
    expect(check(source).problems).toEqual([
      `functions/f.ts:1: Node built-in "${name}" is not allowed`,
    ]);
  });

  it.each([
    ['import { x } from "../other/x.js";', "functions/f.ts:1: other/x.ts is off the boundary"],
    [
      'import { x } from "../lib/a.test.js";',
      "functions/f.ts:1: lib/a.test.ts is off the boundary",
    ],
    [
      'import { x } from "../lib/missing.js";',
      'functions/f.ts:1: "../lib/missing.js" does not resolve',
    ],
    [
      'import { parse } from "@karasu-tools/core";',
      'functions/f.ts:1: package "@karasu-tools/core" is not allowed',
    ],
    ['export { x } from "../other/x.js";', "functions/f.ts:1: other/x.ts is off the boundary"],
    ['export * from "../other/x.js";', "functions/f.ts:1: other/x.ts is off the boundary"],
    ['import "../other/x.js";', "functions/f.ts:1: other/x.ts is off the boundary"],
    ['import type { X } from "../other/x.js";', "functions/f.ts:1: other/x.ts is off the boundary"],
    ['import x = require("../other/x.js");', "functions/f.ts:1: other/x.ts is off the boundary"],
    // The regex forms review found, read from the tree instead (#17, #18).
    [
      'import /* c */ { x } from /* c */ "../other/x.js";',
      "functions/f.ts:1: other/x.ts is off the boundary",
    ],
    [
      'const m = await import( "../other/x.js");',
      "functions/f.ts:1: other/x.ts is off the boundary",
    ],
    [
      "const m = await import(`../other/x.js`);",
      "functions/f.ts:1: other/x.ts is off the boundary",
    ],
    ['const m = require("../other/x.js");', "functions/f.ts:1: other/x.ts is off the boundary"],
  ])("fails on %s", (source, problem) => {
    expect(check(source).problems).toEqual([problem]);
  });

  // CodeRabbit CLI on 244bcded: `require` behind `?.`, a type assertion or `(0, …)`.
  it.each([
    ['const m = require?.("../other/x.js");'],
    ['const m = (require as typeof require)("../other/x.js");'],
    ['const m = require!("../other/x.js");'],
    ['const m = (require satisfies NodeJS.Require)("../other/x.js");'],
    ['const m = (0, require)("../other/x.js");'],
  ])("fails on a wrapped require: %s", (source) => {
    expect(check(source).problems).toEqual(["functions/f.ts:1: other/x.ts is off the boundary"]);
  });

  it("fails on a wrapped require with a computed specifier", () => {
    expect(check("const m = require?.(name);").problems).toEqual([
      "functions/f.ts:1: computed import specifier",
    ]);
  });

  it("fails on an allowed package's specifier that climbs out of it", () => {
    expect(check('import { x } from "@resvg/resvg-wasm/../../other/x.ts";').problems).toEqual([
      'functions/f.ts:1: "@resvg/resvg-wasm/../../other/x.ts" leaves the package',
    ]);
  });

  it("fails on a function off the boundary", () => {
    expect(check("export const x = 1;", "other/f.ts").problems).toEqual([
      "other/f.ts: off the boundary",
    ]);
  });

  it("fails on a source that does not parse, naming it", () => {
    const { problems } = check("const = ;", "functions/f.js");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^functions\/f\.js: does not parse: /);
  });

  it("reads a .mts and a .cts source instead of skipping them", () => {
    for (const file of ["functions/f.mts", "functions/f.cts"]) {
      expect(check('import { x } from "../other/x.js";', file).problems).toEqual([
        `${file}:1: other/x.ts is off the boundary`,
      ]);
    }
  });
});

describe("checkImports: what it must not fail on", () => {
  // Declined #5 in PR #3824, reopened by kompiro.
  it.each([
    ['import { x } from "../lib/b.js";', "lib/b.tsx"],
    ['import { x } from "../lib/b";', "lib/b.tsx"],
    ['import { x } from "../lib/c";', "lib/c.ts"],
    ['import { x } from "../lib/c.ts";', "lib/c.ts"],
    ['import { x } from "../lib/dir";', "lib/dir/index.ts"],
    ['import { x } from "../lib/dir/";', "lib/dir/index.ts"],
    ['import { x } from "../lib/j.jsx";', "lib/j.ts"],
    ['import data from "../lib/data";', "lib/data.json"],
    // esbuild tries `.tsx` before `.ts`: the guard checks the file it bundles.
    ['import { x } from "../lib/z";', "lib/z.tsx"],
    ['import { x } from "../lib/plain.js";', "lib/plain.js"],
  ])("resolves %s", (source, target) => {
    expect(check(source)).toEqual({ problems: [], imported: [target] });
  });

  // Declined #11 in PR #3824, reopened by kompiro.
  it.each([
    ['// Answers as described from "the spec".\nexport const x = 1;'],
    ['/* import x from "../other/x.js"; */\nexport const x = 1;'],
    ["const s = 'import { x } from \"../other/x.js\"';"],
    ['const s = `require("../other/x.js")`;'],
    ['const b = Buffer.from("hello");'],
    ['const d = Array.from(["../other/x.js"]);'],
    ['const r = obj.require("../other/x.js");'],
    ['const r = obj.require?.("../other/x.js");'],
  ])("reads no import from %s", (source) => {
    expect(check(source)).toEqual({ problems: [], imported: [] });
  });

  // Declined #13 in PR #3824, reopened by kompiro: a built-in is checked
  // against its own list, never as a package.
  it("passes a Node built-in on the allowed list, with or without node:", () => {
    const policy = { ...POLICY, builtins: new Set(["node:buffer"]) };
    expect(
      check('import { Buffer } from "node:buffer";', "functions/f.ts", policy).problems,
    ).toEqual([]);
    expect(check('import { Buffer } from "buffer";', "functions/f.ts", policy).problems).toEqual(
      [],
    );
  });

  // Declined #28 in PR #3824, reopened by kompiro.
  it("passes a function with no imports whose comment and string say import and require", () => {
    const source =
      '// We import nothing and require nothing.\nexport const note = "import or require";\n';
    expect(check(source)).toEqual({ problems: [], imported: [] });
  });

  // Declined #29 in PR #3824, reopened by kompiro.
  it("passes a function whose only import is an allowed Node built-in", () => {
    const policy = { ...POLICY, builtins: new Set(["node:buffer"]) };
    const source = 'import { Buffer } from "node:buffer";\nexport const b = Buffer.from("x");\n';
    expect(check(source, "functions/f.ts", policy)).toEqual({ problems: [], imported: [] });
  });

  it("passes an allowed package and its subpath", () => {
    const source =
      'import { Resvg } from "@resvg/resvg-wasm";\nimport wasm from "@resvg/resvg-wasm/index_bg.wasm";\n';
    expect(check(source)).toEqual({ problems: [], imported: [] });
  });

  it.each([
    ["@dec class A {}"],
    ["class A { @dec m() {} }"],
    ["class A { accessor x = 1; }"],
    ['import data from "../lib/data.json" assert { type: "json" };'],
    ['import data from "../lib/data.json" with { type: "json" };'],
  ])("parses what esbuild builds: %s", (source) => {
    expect(check(source).problems).toEqual([]);
  });

  it("reads JSX in a .tsx function", () => {
    const source = 'import { x } from "../lib/a.js";\nexport const el = <div>{x}</div>;\n';
    expect(check(source, "functions/f.tsx")).toEqual({ problems: [], imported: ["lib/a.ts"] });
  });
});

describe("readImports", () => {
  it("gives the line of each import", () => {
    expect(readImports("f.ts", 'export const a = 1;\nimport "./b.js";\n')).toEqual({
      imports: [{ line: 2, specifier: "./b.js" }],
    });
  });

  it("reads an import() type", () => {
    expect(readImports("f.ts", 'type T = typeof import("./b.js");')).toEqual({
      imports: [{ line: 1, specifier: "./b.js" }],
    });
  });
});
