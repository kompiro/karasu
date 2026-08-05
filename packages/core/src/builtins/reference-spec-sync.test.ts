/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getReference } from "./reference.js";
import { PROPERTY_SCHEMAS } from "../style/property-schema.js";

// Reference-data ↔ spec-doc agreement smoke test.
//
// The in-app Reference panel is fed by `getReference()` (this file's
// sibling `reference.ts`) — a hand-maintained copy of what the spec docs
// (`docs/spec/*.md`) describe. The two drift silently: a new style
// property / shape / tag / annotation / node-kind lands in the spec doc
// without a matching entry here, and the panel quietly goes stale.
//
// This test pins `getReference()` to the spec docs in one direction:
// every keyword the docs document must be present in the reference data.
// (The reverse — every reference entry is documented — is intentionally
// NOT asserted; the reference may carry entries the prose docs have not
// caught up on yet, and that is a separate, doc-side gap.)
//
// Exception: for the *validator* schema (`PROPERTY_SCHEMAS`) the reverse
// direction IS asserted. A schema entry the spec does not document means
// the validator silently accepts input no documentation explains and no
// resolver may consume — exactly the `stroke-style` ghost-property bug
// (#1492). Reference data may lead the docs; the validator must not.
//
// See docs/test-perspectives/TPL-1296-spec-doc-reference-data-sync.md.

const __dirname = dirname(fileURLToPath(import.meta.url));
const specDir = resolve(__dirname, "../../../../docs/spec");
const readSpec = (name: string) => readFileSync(resolve(specDir, name), "utf8");

/** Body of every fenced code block whose info string is exactly `lang`. */
function fencedBlocks(markdown: string, lang: string): string[] {
  const lines = markdown.split("\n");
  const blocks: string[] = [];
  let body: string[] | null = null;
  for (const line of lines) {
    if (body) {
      if (/^```\s*$/.test(line)) {
        blocks.push(body.join("\n"));
        body = null;
      } else {
        body.push(line);
      }
    } else if (new RegExp(`^\`\`\`${lang}\\s*$`).test(line)) {
      body = [];
    }
  }
  return blocks;
}

/**
 * Lines of `markdown` that fall under the heading matched by `startHeading`,
 * up to (but not including) the next heading at the same or a higher level.
 */
function sectionLines(markdown: string, startHeading: RegExp): string[] {
  const lines = markdown.split("\n");
  const startIdx = lines.findIndex((l) => startHeading.test(l));
  if (startIdx === -1) throw new Error(`heading not found: ${startHeading}`);
  const level = (lines[startIdx].match(/^#+/) ?? ["#"])[0].length;
  const out: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) break;
    out.push(lines[i]);
  }
  return out;
}

/** First-column code-spans (`` `foo` ``) of every markdown table row. */
function tableFirstColumn(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\|\s*`([^`]+)`/);
    if (m) out.push(m[1]);
  }
  return out;
}

describe("Reference data ↔ docs/spec agreement (TPL-1296)", () => {
  const ref = getReference();

  it("style.md: every documented style property is in getReference().styleProperties", () => {
    const styleMd = readSpec("style.md");
    const documented = new Set<string>();
    for (const block of fencedBlocks(styleMd, "css")) {
      for (const m of block.matchAll(/(^|[\s{;])([a-z][a-z-]+)\s*:/g)) {
        documented.add(m[2]);
      }
    }
    // sanity: the extractor actually found the declaration block
    expect(documented).toContain("background-color");
    expect(documented).toContain("label-offset");
    expect(documented.size).toBeGreaterThan(8);

    const known = new Set(ref.styleProperties.map((p) => p.name));
    const missing = [...documented].filter((p) => !known.has(p)).sort();
    expect(missing).toEqual([]);
  });

  it("style.md: every PROPERTY_SCHEMAS entry is documented in the spec (#1492)", () => {
    const styleMd = readSpec("style.md");
    const documented = new Set<string>();
    for (const block of fencedBlocks(styleMd, "css")) {
      for (const m of block.matchAll(/(^|[\s{;])([a-z][a-z-]+)\s*:/g)) {
        documented.add(m[2]);
      }
    }
    const undocumented = Object.keys(PROPERTY_SCHEMAS)
      .filter((p) => !documented.has(p))
      .sort();
    expect(undocumented).toEqual([]);
  });

  it("style.md: every documented shape keyword is in getReference().shapes", () => {
    const styleMd = readSpec("style.md");
    const documented = tableFirstColumn(sectionLines(styleMd, /^## shape property/));
    expect(documented).toContain("box");
    expect(documented.length).toBeGreaterThanOrEqual(5);

    const known = new Set(ref.shapes.map((s) => s.name));
    const missing = documented.filter((s) => !known.has(s)).sort();
    expect(missing).toEqual([]);
  });

  it("tags-annotations.md: every documented author tag is in getReference().tags", () => {
    const md = readSpec("tags-annotations.md");
    // `## Tags (...)` covers the author-writable tags; the later
    // `## System-assigned tags` section lists resolver-synthesized tags
    // (`[implicit]`, `[cyclic]`, `[write]`, `[read]`) which are styling
    // targets, not things an author types — intentionally out of scope here.
    const rows = tableFirstColumn(sectionLines(md, /^## Tags \(/));
    const documented = rows
      .map((c) => c.match(/^\[([a-z][a-z-]*)\]$/)?.[1])
      .filter((x): x is string => Boolean(x));
    expect(documented).toContain("external");
    expect(documented.length).toBeGreaterThanOrEqual(7);

    const known = new Set(ref.tags.map((t) => t.name));
    const missing = documented.filter((t) => !known.has(t)).sort();
    expect(missing).toEqual([]);
  });

  it("tags-annotations.md: every documented annotation is in getReference().annotations", () => {
    const md = readSpec("tags-annotations.md");
    const rows = tableFirstColumn(sectionLines(md, /^## Annotations \(/));
    const documented = rows
      .map((c) => c.match(/^@([a-z][a-z_-]*)$/)?.[1])
      .filter((x): x is string => Boolean(x));
    expect(documented).toContain("deprecated");
    expect(documented.length).toBeGreaterThanOrEqual(3);

    const known = new Set(ref.annotations.map((a) => a.name));
    const missing = documented.filter((a) => !known.has(a)).sort();
    expect(missing).toEqual([]);
  });

  it("syntax.md: every logical-structure node kind is in getReference().nodeKinds", () => {
    const syntaxMd = readSpec("syntax.md");
    const documented = tableFirstColumn(sectionLines(syntaxMd, /^### Logical structure/)).filter(
      (k) => /^[a-z]+$/.test(k),
    );
    expect(documented).toContain("system");
    expect(documented.length).toBeGreaterThanOrEqual(5);

    const known = new Set(ref.nodeKinds.map((k) => k.kind));
    const missing = documented.filter((k) => !known.has(k)).sort();
    expect(missing).toEqual([]);
  });

  it("syntax.md: every Infra layer keyword (blocks + leaf sub-resources) is in getReference().nodeKinds", () => {
    const syntaxMd = readSpec("syntax.md");
    const documented = tableFirstColumn(sectionLines(syntaxMd, /^### Infra layer/)).filter((k) =>
      /^[a-z][a-z-]*$/.test(k),
    );
    // 3 system-level infra blocks + their 3 leaf sub-resources
    for (const k of ["database", "queue", "storage", "table", "queue-item", "bucket"]) {
      expect(documented).toContain(k);
    }
    const known = new Set(ref.nodeKinds.map((k) => k.kind));
    const missing = documented.filter((k) => !known.has(k)).sort();
    expect(missing).toEqual([]);
  });

  it("tags-annotations.md: every resolver-synthesized edge tag is documented", () => {
    const md = readSpec("tags-annotations.md");
    const rows = tableFirstColumn(sectionLines(md, /^## System-assigned tags/));
    const documented = new Set(
      rows.map((c) => c.match(/^\[([a-z][a-z-]*)\]$/)?.[1]).filter((x): x is string => Boolean(x)),
    );
    for (const t of ["implicit", "cyclic", "write", "read"]) {
      expect(documented).toContain(t);
    }
  });

  // The Reference panel's Syntax / Styles snippets moved out of the app into
  // this payload (#1586). They are illustrative — so the reverse direction
  // (every spec keyword appears in a snippet) is NOT asserted — but a snippet
  // referencing a property/selector the spec has dropped IS a drift, so the
  // two checks below fence the moved data forward to the docs.

  it("every CSS property used in styleSelectorExamplesByView is a known style property (#1586)", () => {
    const known = new Set(ref.styleProperties.map((p) => p.name));
    const used = new Set<string>();
    for (const example of Object.values(ref.styleSelectorExamplesByView)) {
      // strip /* … */ comments so commented-out hints aren't mistaken for declarations
      const code = example.replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of code.matchAll(/([a-z][a-z-]+)\s*:/g)) used.add(m[1]);
    }
    // sanity: the extractor actually found the declarations
    expect(used).toContain("background-color");
    expect(used.size).toBeGreaterThan(3);

    const unknown = [...used].filter((p) => !known.has(p)).sort();
    expect(unknown).toEqual([]);
  });

  // `groupingConstructs` (#2316) is deliberately NOT generated into
  // `docs/spec/syntax.md`. `boundary` and `facet` each already own a long
  // hand-written section there, and a generated table beside that prose would
  // make the check below circular — the failure mode TPL-2158 names. So the
  // spec stays the independent source and the catalog is fenced against it, in
  // the same forward direction as the rest of this file.

  it("syntax.md: every grouping construct has its own section, and the section agrees on experimental", () => {
    const syntaxMd = readSpec("syntax.md");
    for (const g of ref.groupingConstructs) {
      // e.g. "## Grouping the system view (`boundary`) — experimental"
      const heading = syntaxMd
        .split("\n")
        .find((l) => /^##\s/.test(l) && l.includes(`\`${g.construct}\``));
      // A missing heading fails here as `undefined`, naming the construct via
      // the `for` loop's `it` context.
      expect({ construct: g.construct, hasSection: heading !== undefined }).toEqual({
        construct: g.construct,
        hasSection: true,
      });
      expect({ construct: g.construct, experimental: /experimental/i.test(heading!) }).toEqual({
        construct: g.construct,
        experimental: g.experimental,
      });
    }
  });

  it("syntax.md: every documented grouping-construct property is in the catalog", () => {
    const syntaxMd = readSpec("syntax.md");
    for (const g of ref.groupingConstructs) {
      const section = sectionLines(syntaxMd, new RegExp(`^##\\s.*\`${g.construct}\``));
      // The properties the section's `krs` snippets actually write directly
      // inside a top-level `<construct> <id> { … }` block — `label "x"`,
      // `contains Id`, `link "u" "l"`. Nested declarations (a `service` inside
      // a `system`, a scoped `boundary` inside a node) sit at deeper indent and
      // are not this construct's properties.
      const written = new Set<string>();
      for (const block of fencedBlocks(section.join("\n"), "krs")) {
        const lines = block.split("\n");
        let inside = false;
        for (const line of lines) {
          if (!inside) {
            if (new RegExp(`^${g.construct}\\s+\\S+\\s*\\{`).test(line)) inside = true;
            continue;
          }
          if (/^}/.test(line)) {
            inside = false;
            continue;
          }
          const m = line.match(/^ {2}([a-z]+)\s/);
          if (m) written.add(m[1]);
        }
      }
      // sanity: the extractor actually found something to check
      expect({ construct: g.construct, extracted: written.size > 0 }).toEqual({
        construct: g.construct,
        extracted: true,
      });

      const undocumented = [...written].filter((p) => !g.properties.includes(p));
      expect({ construct: g.construct, undocumented }).toEqual({
        construct: g.construct,
        undocumented: [],
      });
    }
  });

  // The `## Specificity rules (cascade)` table is now GENERATED from
  // `SELECTOR_SPECIFICITY` (#1610) via `scripts/reference/gen-docs.ts`, so a
  // doc↔data parse-and-compare here would be circular. The two stronger guards
  // that replace it: `pnpm gen:reference --check` (doc == data, run in CI +
  // pre-push) and the `computeSpecificity` lock in `reference-data.test.ts`
  // (data == implementation).
});
