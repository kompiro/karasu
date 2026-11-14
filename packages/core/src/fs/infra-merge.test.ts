import { describe, it, expect } from "vitest";
import { InMemoryFileSystemProvider } from "./in-memory-provider";
import { ImportResolver } from "./import-resolver";
import { INFRA_MERGE_POLICY, type InfraNode } from "./infra-merge";
import { Parser } from "../parser/parser";
import type { KrsFile } from "../types/ast";

// Every field of a reopened infra block follows its rule in
// `INFRA_MERGE_POLICY`, through both paths that reopen one (TPL-1385). The
// policy is typed over the node's own keys, so a new field cannot be left
// unclassified, and each field is checked here against a fixture that the
// test first proves sets it differently in the two declarations: a new field
// the fixture does not exercise goes red until it does.

/** One infra block, with every field set, in a form two files can each declare. */
function database(v: string, leaf: string, flag: string): string {
  return `database DB [${v}Tag] @${flag} @migration_target(from: ${v}Old) {
  label "${v}"
  description "${v} description"
  link "https://${v}.example" "${v}"
  facets ${v}Facet
  table shared
  table ${leaf}
  shared -> ${leaf}
  boundary ${v}Scope {
    label "${v} scope"
    contains ${leaf}
  }
}
`;
}

const ROOT = database("root", "rootLeaf", "deprecated");
const OTHER = database("other", "otherLeaf", "planned");

/** The two paths that reach `mergeInfraBody`, with where they leave the block. */
const PATHS = {
  "top-level block": {
    wrap: (body: string) => body,
    find: (f: KrsFile) => f.databases.find((d) => d.id === "DB"),
  },
  "block inside a reopened system": {
    wrap: (body: string) => `system S {\n${body}}\n`,
    find: (f: KrsFile) =>
      f.systems.find((s) => s.id === "S")?.children.find((c) => c.id === "DB") as
        | InfraNode
        | undefined,
  },
};

/** How the elements of a `union` field are told apart. */
function identities(value: unknown): string[] {
  return ((value ?? []) as { id?: string; from?: string; to?: string }[])
    .map((e) => e.id ?? `${e.from}->${e.to}`)
    .sort();
}

const FIELDS = Object.entries(INFRA_MERGE_POLICY) as [keyof InfraNode, string][];

describe.each(Object.entries(PATHS))("an infra block reopened as a %s (TPL-1385)", (_n, path) => {
  const entry = `import "b.krs"\n${path.wrap(ROOT)}`;
  const parsedRoot = path.find(Parser.parse(entry, "/p/index.krs").value);
  const parsedOther = path.find(Parser.parse(path.wrap(OTHER), "/p/b.krs").value);

  async function merged() {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/p/index.krs", entry);
    await fs.writeFile("/p/b.krs", path.wrap(OTHER));
    const result = await new ImportResolver(fs).resolve("/p/index.krs");
    return { block: path.find(result.krsFile), diagnostics: result.diagnostics };
  }

  const byRule = (rule: string) => FIELDS.filter(([, r]) => r === rule).map(([f]) => f);

  it.each(byRule("identity"))("%s is the same in both declarations (identity)", async (field) => {
    const { block } = await merged();
    expect(parsedOther?.[field]).toEqual(parsedRoot?.[field]);
    expect(block?.[field]).toEqual(parsedRoot?.[field]);
  });

  // The fixture must set each remaining field, and set it differently in the
  // two files, or the rule is not being tested.
  it.each(byRule("root-wins"))("%s keeps the entry's value (root-wins)", async (field) => {
    const { block } = await merged();
    expect(parsedRoot?.[field]).toBeDefined();
    expect(parsedOther?.[field]).not.toEqual(parsedRoot?.[field]);
    expect(block?.[field]).toEqual(parsedRoot?.[field]);
  });

  it.each(byRule("union"))("%s holds both declarations' entries (union)", async (field) => {
    const { block } = await merged();
    const root = identities(parsedRoot?.[field]);
    const other = identities(parsedOther?.[field]);
    expect(root.length).toBeGreaterThan(0);
    expect(other).not.toEqual(root);
    expect(identities(block?.[field])).toEqual([...new Set([...root, ...other])].sort());
  });

  it("every rule in the policy is one of the three tested above", () => {
    expect(FIELDS.filter(([, r]) => !["identity", "root-wins", "union"].includes(r))).toEqual([]);
  });

  it("reports the reopen and the leaf both declare as info, and nothing louder", async () => {
    const { diagnostics } = await merged();
    expect(diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
    expect(
      diagnostics.filter((d) => d.code === "infra-leaf-redeclared-silently").map((d) => d.params),
    ).toEqual([expect.objectContaining({ leafId: "shared" })]);
  });
});
