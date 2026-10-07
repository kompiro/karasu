import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "../index.js";
import { Parser } from "../parser/parser.js";
import { StyleParser } from "../parser/style-parser.js";
import { analyze } from "../resolver/warnings.js";
import { flattenSheetsInCascadeOrder } from "../style/cascade.js";
import { getBuiltinStyleSheet } from "./default-style.js";
import { getIconThemeStyleSheet } from "./icon-theme.js";
import { INFRA_SUB_KIND_TO_TAG } from "../resolver/style-resolver.js";
import {
  TOOL_ANNOTATIONS,
  TOOL_TAGS,
  nearestToolAnnotation,
  selectorUsesToolVocabularyOnly,
} from "./tool-vocabulary.js";

// `.krs language v2.0` closes the tag / annotation registers (#2677). A rule
// that names a foreign name matches nothing, decided once in the cascade, so
// these cases pin the cascade and the two places that have to agree with it:
// the vocabulary the tool itself stamps, and the builtin theme that styles it.

describe("the cascade drops rules outside the tool vocabulary (#2677)", () => {
  it("keeps builtin and system-assigned names and drops the rest, rule by rule", () => {
    const sheet = StyleParser.parse(`
[external] { color: #111111; }
[pci] { color: #222222; }
service[pci] { color: #333333; }
@deprecated { opacity: 0.5; }
@team_alpha { opacity: 0.4; }
edge[delivers] { color: #444444; }
`).value;
    const kept = flattenSheetsInCascadeOrder([sheet]).map((r) => r.properties["color"] ?? "");
    expect(kept).toEqual(["#111111", "", "#444444"]);
  });

  it("keeps the declaration order of the rules that remain", () => {
    const sheet = StyleParser.parse(`
[external] { color: #111111; }
[pci] { color: #222222; }
[external] { color: #333333; }
`).value;
    const indices = flattenSheetsInCascadeOrder([sheet]).map((r) => r.sourceIndex);
    // The dropped rule still consumes its index, so "later wins" is unchanged.
    expect(indices).toEqual([0, 2]);
  });

  it("drops a compound rule as a whole instead of widening it", () => {
    const selector = StyleParser.parse(`service[external][pci] { color: red; }`).value.rules[0]
      .selector;
    expect(selectorUsesToolVocabularyOnly(selector)).toBe(false);
  });
});

describe("what the tool stamps and styles is in its own vocabulary (#2677)", () => {
  // Every sheet the tool injects as a system sheet goes through the same
  // cascade filter, so a rule on a name outside the vocabulary would silently
  // stop applying there.
  it.each([
    ["dark builtin theme", () => getBuiltinStyleSheet("dark")],
    ["light builtin theme", () => getBuiltinStyleSheet("light")],
    ["icon theme", () => getIconThemeStyleSheet()],
  ] as const)("every rule of the %s survives the closure", (_name, load) => {
    const sheet = load();
    expect(sheet.rules.length).toBeGreaterThan(0);
    const outside = sheet.rules
      .filter((r) => !selectorUsesToolVocabularyOnly(r.selector))
      .map((r) => [...r.selector.tags, ...r.selector.annotations.map((a) => `@${a}`)]);
    expect(outside).toEqual([]);
  });

  it("every shape tag the style resolver infers from an infra sub-kind is a tool tag", () => {
    // `resource OrderDB.OrdersTable` is styled as `resource[table]` without the
    // tag ever being written; the inferred tag has to survive the closure too.
    const inferred = Object.values(INFRA_SUB_KIND_TO_TAG);
    expect(inferred.length).toBeGreaterThan(0);
    expect(inferred.filter((t) => !TOOL_TAGS.has(t))).toEqual([]);
  });

  it("every tag literal the source stamps on an element is a tool tag", () => {
    // `delivers` was missing from the system-assigned tags: view-extract stamps
    // it and the builtin theme styles it, and the closure would have silently
    // unstyled every delivers edge. Scan the source so the next such tag fails.
    const here = dirname(fileURLToPath(import.meta.url));
    const root = join(here, "..");
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) files.push(path);
      }
    };
    walk(root);
    const stamped = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(/\btags:\s*\[\s*"([a-z-]+)"/g)) stamped.add(m[1]);
      for (const m of source.matchAll(/\b\w*[Tt]ags\.push\("([a-z-]+)"\)/g)) stamped.add(m[1]);
    }
    expect(stamped.size).toBeGreaterThan(0);
    expect([...stamped].filter((t) => !TOOL_TAGS.has(t))).toEqual([]);
  });

  it("styles delivers edges with the builtin theme", () => {
    const result = compile(`system S {\n  service Api { delivers Web }\n  client Web\n}\n`, {
      theme: "light",
    });
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(result.svg.toLowerCase()).toContain("#7c3aed");
  });
});

describe("the indexes that read stylesheets agree with the cascade (#2677)", () => {
  it("a legend ref resolves no longer through a rule on a non-builtin name", () => {
    const file = Parser.parse(`
system S { service Api }
legend {
  ref [pci]
}
`).value;
    const sheets = [getBuiltinStyleSheet(), StyleParser.parse(`[pci] { color: red; }`).value];
    const unresolved = analyze(file, sheets).filter((w) => w.kind === "legend-ref-unresolved");
    expect(unresolved).toHaveLength(1);
  });

  it("two sheets declaring the same dead rule do not conflict over anything", () => {
    const file = Parser.parse(`system S { service Api }`).value;
    const sheets = [
      getBuiltinStyleSheet(),
      StyleParser.parse(`[pci] { color: red; }`).value,
      StyleParser.parse(`[pci] { color: blue; }`).value,
    ];
    expect(analyze(file, sheets).filter((w) => w.kind === "style-conflict")).toEqual([]);
  });
});

describe("nearestToolAnnotation", () => {
  it("is undefined for every builtin name", () => {
    expect([...TOOL_ANNOTATIONS].map(nearestToolAnnotation)).toEqual(
      [...TOOL_ANNOTATIONS].map(() => undefined),
    );
  });
});
