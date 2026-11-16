import { describe, it, expect } from "vitest";
import { InMemoryFileSystemProvider } from "./in-memory-provider";
import { ImportResolver, type ResolvedProject } from "./import-resolver";
import { Parser } from "../parser/parser";
import { createEmptyKrsFile } from "../types/ast";
import type { DiagnosticParamsByCode, KrsFile } from "../types/ast";

// Exhaustiveness guards for the resolver's merge, keyed by sets the code owns
// rather than by lists kept beside it (ADR-3038 D4).
//
// 1. Every top-level array of `KrsFile` reaches the importer (TPL-1383,
//    TPL-2169). `mergeWildcardResolved` and the own-content merge in
//    `resolveKrsFromMap` copy the arrays one by one, so an array added to
//    `KrsFile` and left out of either parses and then vanishes from every
//    multi-file model. `TOP_LEVEL` must have a case for each array key, so the
//    new array does not typecheck until it has one, and its case runs through
//    every import shape below.
// 2. Every block kind the resolver reopens across files follows S3 / S4
//    (TPL-2168). The kinds are the ones `system-property-conflict` can name,
//    and a test below derives from `TOP_LEVEL` which arrays actually merge by
//    id, so a block kind that starts reopening without joining `REOPEN` goes
//    red too.
//
// The import shapes are a list kept here: the resolver has no closed set of
// them to enumerate. What is closed is the set of `KrsFile` arrays.

type ArrayKeys<T> = {
  // An optional array counts too; the key check below then needs createEmptyKrsFile to set it.
  [K in keyof T]-?: NonNullable<T[K]> extends readonly unknown[] ? K : never;
}[keyof T];
type TopLevelKey = ArrayKeys<KrsFile>;

type TopLevelCase =
  | {
      /** Declares at least one element of the keyed array, and nothing it needs from elsewhere. */
      src: string;
      /** Files beside the declaring file, by name. */
      files?: Record<string, string>;
    }
  | { skip: string };

/**
 * One case per array-valued `KrsFile` key. `satisfies` (not an annotation) is
 * what makes a new key fail to compile until it is listed.
 */
const TOP_LEVEL = {
  styleImports: {
    src: `@import "lib.krs.style"\n`,
    files: { "lib.krs.style": `service {\n  background-color: #1D4ED8;\n}\n` },
  },
  nodeImports: {
    skip:
      "An import is consumed by the merge: what it imports arrives through the other arrays. " +
      "The resolved project's `nodeImports` is not populated, not even with the entry's own.",
  },
  systems: { src: `system Shop {\n  service Orders\n}\n` },
  services: { src: `service Billing {\n  label "Billing"\n}\n` },
  clients: { src: `client Browser [web] {\n  label "Browser"\n}\n` },
  domains: { src: `domain Pricing {\n  label "Pricing"\n}\n` },
  databases: { src: `database ShopDB {\n  table Orders\n}\n` },
  queues: { src: `queue Events {\n  label "Events"\n}\n` },
  storages: { src: `storage Assets {\n  label "Assets"\n}\n` },
  deploys: {
    src: `deploy Prod {\n  oci api {\n    runtime "Docker"\n  }\n}\n`,
  },
  organizations: {
    src: `organization Co {\n  team platform { label "Platform" }\n}\n`,
  },
  boundaries: {
    src: `system Shop {\n  service Orders\n}\nboundary money {\n  label "Money"\n  contains Orders\n}\n`,
  },
  facets: { src: `facet pii {\n  label "PII"\n}\n` },
  legends: { src: `legend system "Colors" {\n  swatch #ff0000 "hot"\n}\n` },
} satisfies Record<TopLevelKey, TopLevelCase>;

function arrayKeysOfEmptyKrsFile(): string[] {
  const empty = createEmptyKrsFile() as unknown as Record<string, unknown>;
  return Object.keys(empty).filter((key) => Array.isArray(empty[key]));
}

type SourceCase = Extract<TopLevelCase, { src: string }>;

const CASES: (readonly [TopLevelKey, SourceCase])[] = Object.entries(
  TOP_LEVEL as Record<TopLevelKey, TopLevelCase>,
).flatMap(([key, c]) => ("src" in c ? [[key as TopLevelKey, c] as const] : []));

/** Every lib carries one nameable node, so the named-import shapes have something to name. */
const ANCHOR = `system Anchor {\n  service AnchorSvc {\n    domain AnchorDomain {}\n  }\n}\n`;

/** How an element of a top-level array is told apart from its siblings. */
function identity(element: unknown): string {
  if (typeof element === "string") return element;
  const e = element as { kind?: string; id?: string; label?: string };
  return `${e.kind ?? ""}#${e.id ?? e.label ?? JSON.stringify(element)}`;
}

function identities(file: KrsFile, key: TopLevelKey): string[] {
  return (file[key] as readonly unknown[]).map(identity).sort();
}

function errors(result: ResolvedProject): string[] {
  return result.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}

/**
 * The ways a file's content can reach the entry. `lib` is where the case's
 * source sits; `files` are the other files, with the entry at `index.krs`.
 * The shapes that reach `lib.krs` twice answer the second reach from the
 * resolver's per-file cache (`resolvedCache`), which exercises TPL-1383 items
 * 2 and 3 for that cache.
 */
const SHAPES: Record<string, { lib: string; files: Record<string, string> }> = {
  "whole-file import": {
    lib: "lib.krs",
    files: { "index.krs": `import "lib.krs"\n` },
  },
  "directory import": {
    lib: "lib/one.krs",
    files: { "index.krs": `import "lib/"\n` },
  },
  "named, then whole-file import of the same file": {
    lib: "lib.krs",
    files: {
      "index.krs": `import { Anchor } from "lib.krs"\nimport "lib.krs"\n`,
    },
  },
  "whole-file, then named import of the same file": {
    lib: "lib.krs",
    files: {
      "index.krs": `import "lib.krs"\nimport { Anchor } from "lib.krs"\n`,
    },
  },
  // A path import stubs the chain down to the named node; the whole
  // declaration arriving afterwards fills the stubs rather than colliding.
  "path import, then whole-file import of the same file": {
    lib: "lib.krs",
    files: {
      "index.krs": `import { Anchor.AnchorSvc.AnchorDomain } from "lib.krs"\nimport "lib.krs"\n`,
    },
  },
  "diamond: a named branch, then a whole-file branch (cached re-reach)": {
    lib: "lib.krs",
    files: {
      "index.krs": `import "a.krs"\nimport "b.krs"\n`,
      "a.krs": `import { Anchor } from "lib.krs"\n`,
      "b.krs": `import "lib.krs"\n`,
    },
  },
  "diamond: two whole-file branches (cached re-reach)": {
    lib: "lib.krs",
    files: {
      "index.krs": `import "a.krs"\nimport "b.krs"\n`,
      "a.krs": `import "lib.krs"\n`,
      "b.krs": `import "lib.krs"\n`,
    },
  },
};

/**
 * Rows that fail on main, each with its Issue. A row listed here is asserted to
 * still fail, so the entry has to go when the fix lands.
 */
const KNOWN_GAPS: Record<string, { issue: string; actual: string[] }> = {};

function dirOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash + 1);
}

async function project(files: Record<string, string>): Promise<InMemoryFileSystemProvider> {
  const fs = new InMemoryFileSystemProvider();
  for (const [path, content] of Object.entries(files)) await fs.writeFile(`/p/${path}`, content);
  return fs;
}

async function resolveShape(
  c: SourceCase,
  shape: { lib: string; files: Record<string, string> },
): Promise<{ alone: ResolvedProject; merged: ResolvedProject }> {
  const beside = Object.fromEntries(
    Object.entries(c.files ?? {}).map(([name, content]) => [`${dirOf(shape.lib)}${name}`, content]),
  );
  const fs = await project({
    ...shape.files,
    ...beside,
    [shape.lib]: `${c.src}${ANCHOR}`,
  });
  return {
    alone: await new ImportResolver(fs).resolve(`/p/${shape.lib}`),
    merged: await new ImportResolver(fs).resolve("/p/index.krs"),
  };
}

describe("every top-level KrsFile array reaches the importer (TPL-1383, TPL-2169)", () => {
  // `skip` is an escape hatch the type cannot narrow, so the skipped keys are
  // pinned here: a new array cannot opt out of the rows below unnoticed.
  it("skips only nodeImports", () => {
    const skipped = Object.entries(TOP_LEVEL as Record<TopLevelKey, TopLevelCase>).flatMap(
      ([key, c]) => ("skip" in c ? [key] : []),
    );
    expect(skipped).toEqual(["nodeImports"]);
  });

  it("has a case for every array-valued KrsFile key", () => {
    expect(Object.keys(TOP_LEVEL).sort()).toEqual(arrayKeysOfEmptyKrsFile().sort());
  });

  // A case that stopped declaring its construct would pass every row below.
  it.each(CASES)("the %s case declares what it is named for", (key, c) => {
    const parsed = Parser.parse(c.src);
    expect(parsed.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(parsed.value[key].length).toBeGreaterThan(0);
  });

  const rows = Object.entries(SHAPES).flatMap(([shapeName, shape]) =>
    CASES.map(([key, c]) => ({ name: `${shapeName} / ${key}`, shape, key, c })),
  );

  it.each(rows.filter((r) => !KNOWN_GAPS[r.name]))("$name", async ({ shape, key, c }) => {
    const { alone, merged } = await resolveShape(c, shape);
    expect(errors(merged)).toEqual([]);
    // The importer holds exactly what the file holds on its own: nothing
    // dropped, and a cached re-reach adds no second copy.
    expect(identities(merged.krsFile, key)).toEqual(identities(alone.krsFile, key));
    expect(identities(alone.krsFile, key).length).toBeGreaterThan(0);
  });

  it("every KNOWN_GAPS entry names a row", () => {
    const names = new Set(rows.map((r) => r.name));
    expect(Object.keys(KNOWN_GAPS).filter((name) => !names.has(name))).toEqual([]);
  });

  it.each(rows.filter((r) => KNOWN_GAPS[r.name]))(
    "$name still differs (known gap, remove from KNOWN_GAPS when fixed)",
    async ({ name, shape, key, c }) => {
      const { merged } = await resolveShape(c, shape);
      expect(identities(merged.krsFile, key)).toEqual(KNOWN_GAPS[name].actual);
    },
  );

  // `styleImports` reaching the merged model is half of item 4: the sheet must
  // also be loaded into the cascade. Named imports carry the file's sheets too,
  // though they carry only the named nodes.
  const styleShapes = {
    ...SHAPES,
    "named import only": {
      lib: "lib.krs",
      files: { "index.krs": `import { Anchor } from "lib.krs"\n` },
    },
  };
  it.each(Object.entries(styleShapes))(
    "%s: a sheet the imported file @imports is in the cascade, once",
    async (_name, shape) => {
      const { merged } = await resolveShape(TOP_LEVEL.styleImports, shape);
      expect(merged.diagnostics.filter((d) => d.code === "style-file-not-found")).toEqual([]);
      expect(merged.styleSheets.map((s) => s.sheetId)).toEqual([
        `/p/${dirOf(shape.lib)}lib.krs.style`,
      ]);
    },
  );
});

// ─── S3 / S4: reopening a block across files (TPL-2168) ──────────────────────

type ReopenKind = DiagnosticParamsByCode["system-property-conflict"]["blockKind"];
type ReopenProperty = DiagnosticParamsByCode["system-property-conflict"]["property"];

interface ReopenCase {
  /** The `KrsFile` array the kind's blocks live in. */
  key: TopLevelKey;
  /**
   * Every property `system-property-conflict` can name: reconciled for this
   * kind, or the reason the kind does not have it.
   */
  properties: Record<ReopenProperty, true | { absent: string }>;
  /** The error two same-id children of this kind's block draw. */
  collision: string;
  /** Block `B` with the given properties and one child per id. */
  block(props: Partial<Record<ReopenProperty, string>>, children: readonly string[]): string;
  read(file: KrsFile, property: ReopenProperty): string | undefined;
  children(file: KrsFile): string[];
}

function propLines(props: Partial<Record<ReopenProperty, string>>): string {
  return Object.entries(props)
    .map(([p, v]) => `  ${p} "${v}"\n`)
    .join("");
}

function blockB<T extends { id: string }>(blocks: readonly T[]): T | undefined {
  return blocks.find((b) => b.id === "B");
}

/**
 * Every block kind `system-property-conflict` can name. `satisfies` over the
 * diagnostic's own union makes a kind added there fail to compile until it has
 * a row, and the derivation test below makes a kind that reopens without
 * joining the union go red.
 */
const REOPEN = {
  system: {
    key: "systems",
    properties: { label: true, description: true },
    collision: "duplicate-node-in-system",
    block: (props, children) =>
      `system B {\n${propLines(props)}${children.map((c) => `  service ${c}\n`).join("")}}\n`,
    read: (f, p) => {
      const b = blockB(f.systems);
      return p === "label" ? b?.label : b?.properties.description;
    },
    children: (f) => (blockB(f.systems)?.children ?? []).map((c) => c.id),
  },
  deploy: {
    key: "deploys",
    properties: { label: true, description: { absent: "`DeployBlock` has no description" } },
    collision: "duplicate-node-in-deploy",
    block: (props, children) =>
      `deploy B {\n${propLines(props)}${children
        .map((c) => `  oci ${c} {\n    runtime "Docker"\n  }\n`)
        .join("")}}\n`,
    read: (f) => blockB(f.deploys)?.label,
    children: (f) => (blockB(f.deploys)?.nodes ?? []).map((n) => n.id),
  },
  organization: {
    key: "organizations",
    properties: { label: true, description: true },
    collision: "duplicate-team-in-organization",
    block: (props, children) =>
      `organization B {\n${propLines(props)}${children.map((c) => `  team ${c} { label "${c}" }\n`).join("")}}\n`,
    read: (f, p) => {
      const b = blockB(f.organizations);
      return p === "label" ? b?.label : b?.properties.description;
    },
    children: (f) => (blockB(f.organizations)?.teams ?? []).map((t) => t.id),
  },
} satisfies Record<ReopenKind, ReopenCase>;

/**
 * Arrays whose blocks merge by id across files but whose properties S3 does
 * not reconcile, each with the rule that applies instead. An entry here must
 * keep merging by id (asserted below), so the list cannot outlive the fact.
 */
const MERGED_WITHOUT_S3: Partial<Record<TopLevelKey, string>> = {
  databases:
    "S4.5: shared infra merges its body with an `infra-redeclared-across-files` info; " +
    "the root entry's label wins silently (TPL-1385).",
  queues: "S4.5, as for databases.",
  storages: "S4.5, as for databases.",
};

const REOPEN_ROWS = Object.entries(REOPEN) as [ReopenKind, ReopenCase][];

/** Which arrays merge two same-id blocks from two files into one. */
async function arraysThatMergeById(): Promise<TopLevelKey[]> {
  const merging: TopLevelKey[] = [];
  for (const [key, c] of CASES) {
    const fs = await project({
      "index.krs": `import "a.krs"\nimport "b.krs"\n`,
      "a.krs": c.src,
      "b.krs": c.src,
      ...(c.files ?? {}),
    });
    const merged = (await new ImportResolver(fs).resolve("/p/index.krs")).krsFile;
    const ids = (merged[key] as readonly unknown[]).flatMap((e) =>
      typeof e === "object" && e !== null && "id" in e ? [(e as { id: string }).id] : [],
    );
    const declared = (Parser.parse(c.src).value[key] as readonly unknown[]).filter(
      (e) => typeof e === "object" && e !== null && "id" in e,
    ).length;
    // Declared once in each of two files: two entries if they stay apart.
    if (declared > 0 && ids.length < declared * 2) merging.push(key);
  }
  return merging.sort();
}

describe("every block kind reopened across files follows S3 / S4 (TPL-2168)", () => {
  it("the kinds that merge by id are exactly the S3 kinds plus the listed exceptions", async () => {
    const expected = [...REOPEN_ROWS.map(([, c]) => c.key), ...Object.keys(MERGED_WITHOUT_S3)];
    expect(await arraysThatMergeById()).toEqual(expected.sort());
  });

  describe.each(REOPEN_ROWS)("%s", (kind, c) => {
    const reconciled = (Object.keys(c.properties) as ReopenProperty[]).filter(
      (property) => c.properties[property] === true,
    );
    for (const property of reconciled) {
      // Item 1 and 2: y.krs carries a value from two levels down, x.krs one
      // from a single level down. x is closer and wins in either order, and
      // the warning names both values and points at the losing declaration.
      it.each(["y-first", "x-first"] as const)(
        `${property}: the value closest to the entry wins (%s)`,
        async (order) => {
          const imports = order === "y-first" ? ["y.krs", "x.krs"] : ["x.krs", "y.krs"];
          const fs = await project({
            "index.krs": imports.map((f) => `import "${f}"\n`).join(""),
            "y.krs": `import "z.krs"\n${c.block({}, ["FromY"])}`,
            "z.krs": c.block({ [property]: "FromZ" }, ["FromZChild"]),
            "x.krs": c.block({ [property]: "FromX" }, ["FromXChild"]),
          });
          const result = await new ImportResolver(fs).resolve("/p/index.krs");
          expect(c.read(result.krsFile, property)).toBe("FromX");
          const conflicts = result.diagnostics.filter((d) => d.code === "system-property-conflict");
          expect(conflicts.map((d) => [d.params, d.loc?.file])).toEqual([
            [
              {
                blockId: "B",
                blockKind: kind,
                property,
                chosen: "FromX",
                ignored: "FromZ",
              },
              "/p/z.krs",
            ],
          ]);
        },
      );

      // Item 4: which value is adopted follows the entry, so swapping the
      // entry and the file it imports swaps the value.
      it(`${property}: swapping the entry and its import swaps the adopted value`, async () => {
        const adopted = async (entry: "a" | "b") => {
          const other = entry === "a" ? "b" : "a";
          const fs = await project({
            [`${entry}.krs`]: `import "${other}.krs"\n${c.block({ [property]: entry }, [`${entry}C`])}`,
            [`${other}.krs`]: c.block({ [property]: other }, [`${other}C`]),
          });
          return c.read(
            (await new ImportResolver(fs).resolve(`/p/${entry}.krs`)).krsFile,
            property,
          );
        };
        expect([await adopted("a"), await adopted("b")]).toEqual(["a", "b"]);
      });
    }

    // Item 3: children are unioned by id, whatever the import order. q and r
    // both declare Shared, so every order reports the same collision.
    it("the merged children and the collision errors do not depend on the import order", async () => {
      const files = {
        "p.krs": c.block({}, ["P"]),
        "q.krs": c.block({}, ["Q", "Shared"]),
        "r.krs": c.block({}, ["R", "Shared"]),
      };
      const orders = [
        ["p", "q", "r"],
        ["p", "r", "q"],
        ["q", "p", "r"],
        ["q", "r", "p"],
        ["r", "p", "q"],
        ["r", "q", "p"],
      ];
      const outcomes = await Promise.all(
        orders.map(async (order) => {
          const fs = await project({
            ...files,
            "index.krs": order.map((f) => `import "${f}.krs"\n`).join(""),
          });
          const result = await new ImportResolver(fs).resolve("/p/index.krs");
          return {
            children: c.children(result.krsFile).sort(),
            errors: errors(result).sort(),
          };
        }),
      );
      expect(outcomes[0].children).toEqual(["P", "Q", "R", "Shared"]);
      expect(outcomes[0].errors).toEqual([c.collision]);
      for (const outcome of outcomes) expect(outcome).toEqual(outcomes[0]);
    });
  });
});
