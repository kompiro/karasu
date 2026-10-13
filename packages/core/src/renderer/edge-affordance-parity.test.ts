import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAllLayersSvg,
  buildAllViewsSvgProject,
  buildDrillDownSvg,
  compile,
  InMemoryFileSystemProvider,
} from "../index.js";

// The edge hover affordance is a property of every drawn edge, not of an
// edge's identity (#2632).
//
// - Hover and hit: every `.krs-edge` group carries exactly one transparent
//   hit-line, on every render surface. `preview.css` keys the hover highlight
//   and the peer dim on `.krs-edge`, so the hit-line is what makes an edge
//   with no canonical id (a deploy edge, a ghost edge, an edge whose id a
//   base collision cleared) followable at all.
// - Right-click: `krs-edge--interactive` stays the advertisement for the
//   direction menu, so it appears exactly where `data-edge-canonical-id` does.
//
// Asserted per surface rather than once (TPL-1983, TPL-219): `renderEdge` is
// the one path the surfaces share today, and this file is what notices when a
// surface stops going through it.

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");
const EXAMPLES = join(REPO_ROOT, "examples/en");

/** Each edge group of an SVG: its opening tag, and its content up to the matching `</g>`. */
function edgeGroups(svg: string): { tag: string; body: string }[] {
  return [...svg.matchAll(/<g data-edge-from="[^"]*" data-edge-to="[^"]*"[^>]*>/g)].map((m) => {
    // Walk the nesting: an edge group may hold a group of its own (the
    // aggregated-edge click target), so the first `</g>` is not always its end.
    const token = /<g\b|<\/g>/g;
    token.lastIndex = m.index;
    let depth = 0;
    let end = svg.length;
    for (let t = token.exec(svg); t; t = token.exec(svg)) {
      depth += t[0] === "</g>" ? -1 : 1;
      if (depth === 0) {
        end = t.index;
        break;
      }
    }
    return { tag: m[0], body: svg.slice(m.index + m[0].length, end) };
  });
}

const classOf = (tag: string): string[] => (/ class="([^"]*)"/.exec(tag)?.[1] ?? "").split(" ");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.krs(\.style)?$/.test(name)) out.push(path);
  }
  return out;
}

const files = walk(EXAMPLES);
const entries = files.filter((f) => f.endsWith(".krs"));

/** One render surface over one example file. `null` when the surface draws nothing for it. */
type Surface = { name: string; render: (file: string) => Promise<string | null> | string | null };

const source = (file: string) => readFileSync(file, "utf8");
const svgOrNull = (svg: string) => (svg.includes("krs-edge") ? svg : null);

const fs = new InMemoryFileSystemProvider();

const SURFACES: readonly Surface[] = [
  { name: "system view", render: (f) => svgOrNull(compile(source(f)).svg) },
  {
    name: "deploy view",
    render: (f) => svgOrNull(compile(source(f), { diagramType: "deploy" }).svg),
  },
  { name: "drill-down bundle", render: (f) => svgOrNull(buildDrillDownSvg(source(f)).svg) },
  { name: "all-layers", render: (f) => svgOrNull(buildAllLayersSvg(source(f)).svg) },
  {
    // The project entry point resolves imports, so it is also where the
    // multi-file projects (`multi-file-system`) are drawn whole.
    name: "all-views bundle (project)",
    render: async (f) =>
      svgOrNull((await buildAllViewsSvgProject(f.slice(REPO_ROOT.length), fs)).svg),
  },
];

beforeAll(async () => {
  for (const file of files) await fs.writeFile(file.slice(REPO_ROOT.length), source(file));
});

describe.each(SURFACES)("$name (#2632)", ({ render }) => {
  /** Every edge group the surface draws across the corpus, labelled by file. */
  async function census() {
    const groups: { file: string; tag: string; body: string }[] = [];
    for (const file of entries) {
      const svg = await render(file);
      if (svg === null) continue;
      for (const g of edgeGroups(svg)) groups.push({ file: file.slice(EXAMPLES.length), ...g });
    }
    return groups;
  }

  it("gives every drawn edge exactly one hit-line, with or without a canonical id", async () => {
    const groups = await census();
    expect(groups.length).toBeGreaterThan(0);
    const offenders = groups
      .filter((g) => (g.body.match(/class="krs-edge__hitline"/g) ?? []).length !== 1)
      .map((g) => `${g.file}: ${g.tag}`);
    expect(offenders).toEqual([]);
  });

  it("advertises the right-click menu exactly where the edge is addressable", async () => {
    const groups = await census();
    const offenders = groups
      .filter((g) => {
        const interactive = classOf(g.tag).includes("krs-edge--interactive");
        const addressable = g.tag.includes(" data-edge-canonical-id=");
        return interactive !== addressable;
      })
      .map((g) => `${g.file}: ${g.tag}`);
    expect(offenders).toEqual([]);
  });
});

describe("the corpus reaches the edges this fix is for (#2632)", () => {
  // Without these, the per-surface assertions above could pass on a corpus
  // whose every edge has a canonical id, which is the case that already worked.
  it("the deploy view draws edges, none of them addressable", async () => {
    const tags: string[] = [];
    for (const file of entries) {
      const svg = compile(source(file), { diagramType: "deploy" }).svg;
      tags.push(...edgeGroups(svg).map((g) => g.tag));
    }
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.filter((t) => t.includes(" data-edge-canonical-id="))).toEqual([]);
  });

  it("the system view draws edges without a canonical id", () => {
    const unaddressed = entries.flatMap((file) =>
      edgeGroups(compile(source(file)).svg).filter(
        (g) => !g.tag.includes(" data-edge-canonical-id="),
      ),
    );
    expect(unaddressed.length).toBeGreaterThan(0);
  });
});
