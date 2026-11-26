import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkImports, type ImportPolicy, listFiles, readImports } from "./function-imports.ts";

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
  "lib/h.ts",
  "lib/h.js.ts",
  "lib/k.ts",
  "lib/k.js/index.ts",
  "other/x.ts",
  "lib/pkg-main/index.ts",
  "lib/pkg-browser/index.ts",
  "functions/helper.ts",
  "listed/f.ts",
  "listed/v1.js/index.ts",
]) {
  mkdirSync(dirname(join(ROOT, file)), { recursive: true });
  writeFileSync(join(ROOT, file), "export const x = 1;\n");
}
writeFileSync(join(ROOT, "lib/data.json"), "{}\n");
// The allowed package, installed as pnpm would.
for (const [file, text] of [
  [
    "node_modules/@resvg/resvg-wasm/package.json",
    '{ "name": "@resvg/resvg-wasm", "main": "index.js" }',
  ],
  ["node_modules/@resvg/resvg-wasm/index.js", "export const Resvg = 1;\n"],
  ["node_modules/@resvg/resvg-wasm/index_bg.wasm", ""],
  // Functions whose directory aliases the allowed package name to a repo file.
  [
    "functions/paths/tsconfig.json",
    '{ "compilerOptions": { "paths": { "@resvg/resvg-wasm": ["../../other/x.ts"] } } }',
  ],
  [
    "functions/browser-map/package.json",
    '{ "browser": { "@resvg/resvg-wasm": "../../other/x.ts" } }',
  ],
]) {
  mkdirSync(dirname(join(ROOT, file)), { recursive: true });
  writeFileSync(join(ROOT, file), text);
}
// Directories whose package.json names the entry, as esbuild reads it for `browser`.
writeFileSync(join(ROOT, "lib/pkg-main/package.json"), '{ "main": "./entry.ts" }');
writeFileSync(
  join(ROOT, "lib/pkg-browser/package.json"),
  '{ "browser": "./entry.ts", "main": "./index.ts" }',
);
// A source on the boundary whose sibling is a link off it.
mkdirSync(join(ROOT, "lib/real"), { recursive: true });
writeFileSync(
  join(ROOT, "lib/real/entry.ts"),
  'import { x } from "./helper.js";\nexport const use = [x];\n',
);
// Links whose own path is on the boundary and whose target is not.
for (const [link, target] of [
  ["lib/linked.ts", "../other/x.ts"],
  ["lib/linked-dir", "../other"],
  ["functions/linked.ts", "../other/x.ts"],
  ["listed/linked.ts", "../other/x.ts"],
  ["listed/linked-dir", "../other"],
  ["lib/pkg-main/entry.ts", "../../other/x.ts"],
  ["lib/pkg-browser/entry.ts", "../../other/x.ts"],
  ["lib/real/helper.ts", "../../other/x.ts"],
  ["functions/via-link.ts", "../lib/real/entry.ts"],
]) {
  mkdirSync(dirname(join(ROOT, link)), { recursive: true });
  symlinkSync(target, join(ROOT, link));
}
// The repo reached through a link, as /tmp is on macOS.
const LINKED_ROOT = `${ROOT}-link`;
symlinkSync(ROOT, LINKED_ROOT);
afterAll(() => {
  rmSync(LINKED_ROOT, { force: true });
  rmSync(ROOT, { recursive: true, force: true });
});

const POLICY: ImportPolicy = { packages: new Set(["@resvg/resvg-wasm"]), builtins: new Set() };

/** What the guard reports for the function at `file`, as it is on disk. */
const checkFile = (file: string, policy = POLICY, root = ROOT) =>
  checkImports({
    root,
    files: [file],
    policy,
    onBoundary: (path) =>
      (path.startsWith("functions/") || path.startsWith("lib/")) && !path.includes(".test."),
  });

/** What the guard reports for one function holding `source`. */
const check = (source: string, file = "functions/f.ts", policy = POLICY, root = ROOT) => {
  mkdirSync(dirname(join(ROOT, file)), { recursive: true });
  writeFileSync(join(ROOT, file), source);
  return checkFile(file, policy, root);
};

// Each source uses what it imports: esbuild drops an unused import from a `.ts`
// file, as the bundle does, and the guard then has nothing to check.
const problemsOf = async (source: string, file?: string) => (await check(source, file)).problems;

describe("checkImports: what it must catch", () => {
  // Declined #16 / #20 in PR #3824, reopened by kompiro.
  it.each([
    ['export const m = await import("" + name);'],
    ["export const m = await import(name);"],
    ['export const m = require("" + name);'],
    ["export const m = require(name);"],
  ])("fails on a computed specifier: %s", async (source) => {
    expect(await problemsOf(source)).toEqual(["functions/f.ts:1: computed import specifier"]);
  });

  // esbuild bundles each file such a template can name, past the resolver a
  // plugin sees, so the guard fails on the template itself. A file it expands
  // to that imports something is reported too, as read without a check.
  it.each([
    ["export const m = await import(`../other/${name}.ts`);"],
    ["export const m = require(`../lib/${name}`);"],
  ])("fails on a template specifier: %s", async (source) => {
    expect(await problemsOf(source)).toContain("functions/f.ts:1: computed import specifier");
  });

  // Declined #21 in PR #3824, reopened by kompiro.
  it.each([
    ['import { readFileSync } from "node:fs"; export const use = [readFileSync];', "node:fs"],
    ['import fs from "fs"; export const use = [fs];', "node:fs"],
    ['import { readFile } from "fs/promises"; export const use = [readFile];', "node:fs/promises"],
    ['export const path = require("node:path");', "node:path"],
    ['export const c = await import("node:crypto");', "node:crypto"],
  ])("fails on a Node built-in that is not allowed: %s", async (source, name) => {
    expect(await problemsOf(source)).toEqual([
      `functions/f.ts:1: Node built-in "${name}" is not allowed`,
    ]);
  });

  const OFF = "functions/f.ts:1: other/x.ts is off the boundary";
  it.each([
    ['import { x } from "../other/x.js"; export const use = [x];', OFF],
    [
      'import { x } from "../lib/a.test.js"; export const use = [x];',
      "functions/f.ts:1: lib/a.test.ts is off the boundary",
    ],
    [
      'import { x } from "../lib/missing.js"; export const use = [x];',
      'functions/f.ts:1: "../lib/missing.js" does not resolve',
    ],
    [
      'import { parse } from "@karasu-tools/core"; export const use = [parse];',
      'functions/f.ts:1: package "@karasu-tools/core" is not allowed',
    ],
    ['export { x } from "../other/x.js";', OFF],
    ['export * from "../other/x.js";', OFF],
    ['import "../other/x.js";', OFF],
    ['import x = require("../other/x.js"); export const use = [x];', OFF],
    // The regex forms review found, read from the tree instead (#17, #18).
    ['import /* c */ { x } from /* c */ "../other/x.js"; export const use = [x];', OFF],
    ['export const m = await import( "../other/x.js");', OFF],
    ["export const m = await import(`../other/x.js`);", OFF],
    ['export const m = require("../other/x.js");', OFF],
  ])("fails on %s", async (source, problem) => {
    expect(await problemsOf(source)).toEqual([problem]);
  });

  // CodeRabbit CLI on 244bcded: `require` behind `?.`, a type assertion or `(0, …)`.
  it.each([
    ['export const m = (require as typeof require)("../other/x.js");'],
    ['export const m = require!("../other/x.js");'],
    ['export const m = (require satisfies NodeJS.Require)("../other/x.js");'],
  ])("fails on a wrapped require: %s", async (source) => {
    expect(await problemsOf(source)).toEqual([OFF]);
  });

  // esbuild leaves these to run time instead of bundling what they name.
  it.each([
    ['export const m = require?.("../other/x.js");'],
    ['export const m = (0, require)("../other/x.js");'],
  ])("fails on a require the bundle leaves to run time: %s", async (source) => {
    expect(await problemsOf(source)).toEqual([
      'functions/f.ts:1: "../other/x.js" is loaded at run time, not bundled',
    ]);
  });

  it("fails on a wrapped require with a computed specifier", async () => {
    expect(await problemsOf("export const m = require?.(name);")).toEqual([
      "functions/f.ts:1: computed import specifier",
    ]);
  });

  it("fails on an allowed package's specifier that climbs out of it", async () => {
    expect(
      await problemsOf(
        'import { x } from "@resvg/resvg-wasm/../../other/x.ts"; export const use = [x];',
      ),
    ).toEqual(['functions/f.ts:1: "@resvg/resvg-wasm/../../other/x.ts" leaves the package']);
  });

  // CodeRabbit on a1ff9c99: a link is judged by the file wrangler bundles.
  it.each([
    ['import { x } from "../lib/linked.js"; export const use = [x];'],
    ['import { x } from "../lib/linked-dir/x.js"; export const use = [x];'],
  ])("fails on an import through a link that leaves the boundary: %s", async (source) => {
    expect(await problemsOf(source)).toEqual([OFF]);
  });

  it("fails on a function that links to a file off the boundary", async () => {
    expect((await checkFile("functions/linked.ts")).problems).toEqual([
      "functions/linked.ts: links to other/x.ts, off the boundary",
    ]);
  });

  // CodeRabbit on 95868cb6: a linked function's imports resolve beside its
  // target, where esbuild reads them, not beside the link.
  it("resolves a linked function's imports from the file it links to", async () => {
    expect(await checkFile("functions/via-link.ts")).toEqual({
      problems: ["functions/via-link.ts:1: other/x.ts is off the boundary"],
      imported: ["other/x.ts"],
    });
  });

  // CodeRabbit on 95868cb6: a directory's package.json names the file it loads,
  // with `browser` first since wrangler leaves esbuild's platform at `browser`.
  it.each([
    ['import { x } from "../lib/pkg-main"; export const use = [x];'],
    ['import { x } from "../lib/pkg-browser"; export const use = [x];'],
  ])(
    "fails on a directory whose package.json names a file off the boundary: %s",
    async (source) => {
      expect(await problemsOf(source)).toEqual([OFF]);
    },
  );

  // Review of 6601ffbe: an alias of an allowed package name is the file it names.
  it.each([["functions/paths/f.ts"], ["functions/browser-map/f.ts"]])(
    "fails on an allowed package name aliased to a file off the boundary: %s",
    async (file) => {
      const source = 'import { x } from "@resvg/resvg-wasm"; export const use = [x];';
      expect(await problemsOf(source, file)).toEqual([`${file}:1: other/x.ts is off the boundary`]);
    },
  );

  it("fails on an allowed package that does not resolve", async () => {
    const source = 'import { x } from "@resvg/resvg-wasm/missing.js"; export const use = [x];';
    expect(await problemsOf(source)).toEqual([
      'functions/f.ts:1: "@resvg/resvg-wasm/missing.js" does not resolve',
    ]);
  });

  // Review of 6601ffbe: the run-time call is reported even when a
  // declaration of the same specifier is bundled.
  it("fails on a run-time require beside a bundled import of the same file", async () => {
    const source =
      'import { x } from "../lib/a.js";\nexport const use = [x, require?.("../lib/a.js")];';
    expect(await problemsOf(source)).toEqual([
      'functions/f.ts:2: "../lib/a.js" is loaded at run time, not bundled',
    ]);
  });

  it("fails on a function off the boundary", async () => {
    expect(await problemsOf("export const x = 1;", "off/f.ts")).toEqual([
      "off/f.ts: off the boundary",
    ]);
  });

  it("fails on a source that does not parse, naming it", async () => {
    const problems = await problemsOf("const = ;", "functions/f.js");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^functions\/f\.js: does not parse: /);
  });

  it("fails on an import with `assert`, which Babel 8 no longer reads", async () => {
    const problems = await problemsOf(
      'import data from "./data.json" assert { type: "json" }; export const use = [data];',
      "functions/f.ts",
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^functions\/f\.ts: does not parse: /);
  });

  it("reads a .mts and a .cts source instead of skipping them", async () => {
    for (const file of ["functions/f.mts", "functions/f.cts"]) {
      expect(
        await problemsOf('import { x } from "../other/x.js"; export const use = [x];', file),
      ).toEqual([`${file}:1: other/x.ts is off the boundary`]);
    }
  });
});

describe("checkImports: what it must not fail on", () => {
  // Declined #5 in PR #3824, reopened by kompiro.
  it.each([
    ["../lib/b.js", "lib/b.tsx"],
    ["../lib/b", "lib/b.tsx"],
    ["../lib/c", "lib/c.ts"],
    ["../lib/c.ts", "lib/c.ts"],
    ["../lib/dir", "lib/dir/index.ts"],
    ["../lib/dir/", "lib/dir/index.ts"],
    ["../lib/j.jsx", "lib/j.ts"],
    // esbuild tries `.tsx` before `.ts`: the guard checks the file it bundles.
    ["../lib/z", "lib/z.tsx"],
    ["../lib/plain.js", "lib/plain.js"],
    // CodeRabbit on a1ff9c99: esbuild appends an extension before it rewrites
    // `.js`, and rewrites before it reads a directory's index.
    ["../lib/h.js", "lib/h.js.ts"],
    ["../lib/k.js", "lib/k.ts"],
  ])("resolves %s", async (specifier, target) => {
    expect(await check(`import { x } from "${specifier}"; export const use = [x];`)).toEqual({
      problems: [],
      imported: [target],
    });
  });

  it("resolves an extensionless .json", async () => {
    expect(await check('import data from "../lib/data"; export const use = [data];')).toEqual({
      problems: [],
      imported: ["lib/data.json"],
    });
  });

  // The bundle drops these, so they load nothing at run time.
  it.each([
    ['import type { X } from "../other/x.js"; export type Y = X;'],
    ['import { x } from "../other/x.js";'],
    ['export type T = typeof import("../other/x.js");'],
  ])("checks no import the bundle drops: %s", async (source) => {
    expect(await check(source)).toEqual({ problems: [], imported: [] });
  });

  // Declined #11 in PR #3824, reopened by kompiro.
  it.each([
    ['// Answers as described from "the spec".\nexport const x = 1;'],
    ['/* import x from "../other/x.js"; */\nexport const x = 1;'],
    ["export const s = 'import { x } from \"../other/x.js\"';"],
    ['export const s = `require("../other/x.js")`;'],
    ['export const b = Buffer.from("hello");'],
    ['export const d = Array.from(["../other/x.js"]);'],
    ['export const r = obj.require("../other/x.js");'],
    ['export const r = obj.require?.("../other/x.js");'],
  ])("reads no import from %s", async (source) => {
    expect(await check(source)).toEqual({ problems: [], imported: [] });
  });

  // Declined #13 in PR #3824, reopened by kompiro: a built-in is checked
  // against its own list, never as a package.
  it("passes a Node built-in on the allowed list, with or without node:", async () => {
    const policy = { ...POLICY, builtins: new Set(["node:buffer"]) };
    for (const name of ["node:buffer", "buffer"]) {
      const source = `import { Buffer } from "${name}"; export const use = [Buffer];`;
      expect((await check(source, "functions/f.ts", policy)).problems).toEqual([]);
    }
  });

  // Declined #28 in PR #3824, reopened by kompiro.
  it("passes a function with no imports whose comment and string say import and require", async () => {
    const source =
      '// We import nothing and require nothing.\nexport const note = "import or require";\n';
    expect(await check(source)).toEqual({ problems: [], imported: [] });
  });

  // Declined #29 in PR #3824, reopened by kompiro.
  it("passes a function whose only import is an allowed Node built-in", async () => {
    const policy = { ...POLICY, builtins: new Set(["node:buffer"]) };
    const source = 'import { Buffer } from "node:buffer";\nexport const b = Buffer.from("x");\n';
    expect(await check(source, "functions/f.ts", policy)).toEqual({ problems: [], imported: [] });
  });

  it("passes an allowed package and its subpath", async () => {
    const source =
      'import { Resvg } from "@resvg/resvg-wasm";\nimport wasm from "@resvg/resvg-wasm/index_bg.wasm";\nexport const use = [Resvg, wasm];\n';
    expect(await check(source)).toEqual({ problems: [], imported: [] });
  });

  it.each([
    ["export @dec class A {}"],
    ["export class A { @dec m() {} }"],
    ["export class A { accessor x = 1; }"],
    ['import data from "../lib/data.json" with { type: "json" }; export const use = [data];'],
  ])("parses what esbuild builds: %s", async (source) => {
    expect(await problemsOf(source)).toEqual([]);
  });

  it("resolves against a root reached through a link", async () => {
    await check('import { x } from "../lib/a.js"; export const use = [x];');
    expect(await checkFile("functions/f.ts", POLICY, LINKED_ROOT)).toEqual({
      problems: [],
      imported: ["lib/a.ts"],
    });
  });

  it("reads JSX in a .tsx function", async () => {
    const source = 'import { x } from "../lib/a.js";\nexport const el = <div>{x}</div>;\n';
    expect(await check(source, "functions/f.tsx")).toEqual({
      problems: [],
      imported: ["lib/a.ts"],
    });
  });
});

// CodeRabbit on a1ff9c99: a directory named like a source is not read as one.
describe("listFiles", () => {
  it("lists files and links to files, walks linked directories, and skips directories", () => {
    expect(listFiles(ROOT, "listed").sort()).toEqual([
      "listed/f.ts",
      "listed/linked-dir/x.ts",
      "listed/linked.ts",
      "listed/v1.js/index.ts",
    ]);
  });
});

describe("readImports", () => {
  it("gives the line of each import", () => {
    expect(readImports("f.ts", 'export const a = 1;\nimport "./b.js";\n')).toEqual({
      imports: [{ line: 2, specifier: "./b.js", call: false }],
    });
  });

  it("reads an import() type", () => {
    expect(readImports("f.ts", 'type T = typeof import("./b.js");')).toEqual({
      imports: [{ line: 1, specifier: "./b.js", call: false }],
    });
  });
});
