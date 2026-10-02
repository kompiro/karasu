import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAllLayersSvg,
  buildAllViewsSvg,
  buildAllViewsSvgProject,
  buildDrillDownSvg,
  compile,
  InMemoryFileSystemProvider,
} from "../index.js";
import { displayEdgeLabel } from "../renderer/edge-label-disclosure.js";

// The canvas tier of edge-label disclosure (#3022), seen from the outside: what
// each render surface emits when the canvas shows less than the author wrote.
//
// Three perspectives hold this file together.
//
// - TPL-3022: whatever the canvas withholds must stay reachable in full on that
//   same surface. A static SVG has no viewer around it, so the route there is a
//   `<title>`.
// - TPL-2174: a canvas that withholds nothing carries none of the markers. An
//   equality test alone cannot see an attribute stamped on every edge (it shows
//   up on both sides), so the markers are also enumerated by name.
// - TPL-219 / TPL-1983: the tier lives in `renderEdge`, the one path every
//   surface shares, and each surface is checked rather than assumed.

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");

/** Everything this tier can add to an edge group. Absent when nothing is withheld. */
const MARKERS = ["data-edge-label-withheld", "<title>"] as const;

/** The behaviour before the two properties existed. */
const BEFORE = "edge { label-max-chars: none; label-display: always; }";

const LONG_LABEL = "authorizes every request through the permissions module and the request parser";

const model = (label: string) => `
system S {
  service A {}
  service B {}
  A -> B "${label}"
}
`;

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

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(` ${name}="([^"]*)"`).exec(tag)?.[1];

/** The four static surfaces plus the live compile, over one source and style. */
const SURFACES: readonly { name: string; render: (krs: string, style?: string) => string }[] = [
  { name: "compile", render: (krs, style) => compile(krs, { styleSource: style }).svg },
  { name: "buildDrillDownSvg", render: (krs, style) => buildDrillDownSvg(krs, style).svg },
  { name: "buildAllLayersSvg", render: (krs, style) => buildAllLayersSvg(krs, style).svg },
  { name: "buildAllViewsSvg", render: (krs, style) => buildAllViewsSvg(krs, style).svg },
];

describe("a label longer than `label-max-chars` is drawn truncated", () => {
  it.each(SURFACES)("$name keeps the authored text on the edge and in a <title>", ({ render }) => {
    const [edge] = edgeGroups(render(model(LONG_LABEL)));
    const shown = displayEdgeLabel(LONG_LABEL, 40);
    expect(shown).not.toBe(LONG_LABEL);

    // The canvas draws the short form…
    expect(edge.body).toContain(`>${shown}</text>`);
    expect(edge.body).not.toContain(`>${LONG_LABEL}</text>`);
    // …and says that it did, and what the author wrote.
    expect(attr(edge.tag, "data-edge-label-withheld")).toBe("truncated");
    expect(attr(edge.tag, "data-edge-label")).toBe(LONG_LABEL);
    expect(edge.body).toContain(`<title>${LONG_LABEL}</title>`);
  });

  it("`label-max-chars: none` draws the label whole", () => {
    const svg = compile(model(LONG_LABEL), {
      styleSource: "edge { label-max-chars: none; }",
    }).svg;
    const [edge] = edgeGroups(svg);
    expect(edge.body).toContain(`>${LONG_LABEL}</text>`);
    for (const marker of MARKERS) expect(svg).not.toContain(marker);
  });

  it("takes the budget from the style sheet", () => {
    const svg = compile(model(LONG_LABEL), { styleSource: "edge { label-max-chars: 20; }" }).svg;
    expect(edgeGroups(svg)[0].body).toContain(`>${displayEdgeLabel(LONG_LABEL, 20)}</text>`);
  });

  it("ignores a value that is not a positive whole number", () => {
    const byDefault = compile(model(LONG_LABEL)).svg;
    for (const bad of ["0", "2.5", "banana"]) {
      const svg = compile(model(LONG_LABEL), {
        styleSource: `edge { label-max-chars: ${bad}; }`,
      }).svg;
      expect(svg).toBe(byDefault);
    }
  });
});

describe("a canvas that withholds nothing is unchanged (TPL-2174)", () => {
  it.each(SURFACES)("$name is byte-identical to the behaviour before", ({ render }) => {
    const krs = model("calls");
    expect(render(krs)).toBe(render(krs, BEFORE));
  });

  it.each(SURFACES)("$name carries none of the markers", ({ render }) => {
    // Named, not just compared: a marker stamped on every edge would appear on
    // both sides of the equality above and cancel out.
    const svg = render(model("calls"));
    for (const marker of MARKERS) expect(svg).not.toContain(marker);
  });
});

describe("`label-display: hover` leaves the label off the canvas", () => {
  it.each(SURFACES)("$name draws no label text and keeps it reachable", ({ render }) => {
    const [edge] = edgeGroups(render(model("calls"), "edge { label-display: hover; }"));
    expect(edge.body).not.toContain("<text");
    expect(attr(edge.tag, "data-edge-label-withheld")).toBe("deferred");
    expect(attr(edge.tag, "data-edge-label")).toBe("calls");
    expect(edge.body).toContain("<title>calls</title>");
  });

  it("ignores an unknown value", () => {
    const krs = model("calls");
    expect(compile(krs, { styleSource: "edge { label-display: sometimes; }" }).svg).toBe(
      compile(krs).svg,
    );
  });
});

describe("a synthetic label is never withheld (TPL-3022)", () => {
  // The W / R markers on usecase → resource edges are not authored text, so
  // they are not on the edge as `data-edge-label` (ADR-1554). A viewer would
  // have nothing to disclose them from.
  const krs = readFileSync(
    join(REPO_ROOT, "examples/en/feature-samples/resource-operations.krs"),
    "utf8",
  );
  const domainLevel = (style?: string) =>
    compile(krs, { viewPath: ["Demo", "Backend", "Order"], styleSource: style }).svg;

  it("the fixture view does draw synthetic markers", () => {
    const markers = edgeGroups(domainLevel()).filter((e) => />(?:R|W|RW)<\/text>/.test(e.body));
    expect(markers.length).toBeGreaterThan(0);
    for (const m of markers) expect(attr(m.tag, "data-edge-label")).toBeUndefined();
  });

  it("stays drawn, with no marker, under `label-display: hover`", () => {
    const before = edgeGroups(domainLevel()).filter((e) => />(?:R|W|RW)<\/text>/.test(e.body));
    const hidden = edgeGroups(domainLevel("edge { label-display: hover; }")).filter((e) =>
      />(?:R|W|RW)<\/text>/.test(e.body),
    );
    expect(hidden).toHaveLength(before.length);
    for (const m of hidden) {
      expect(attr(m.tag, "data-edge-label-withheld")).toBeUndefined();
      expect(m.body).not.toContain("<title>");
    }
  });
});

describe("dense canvas: what `auto` leaves off stays reachable on every surface (TPL-3022)", () => {
  const dense = readFileSync(
    resolve(__dirname, "../renderer/fixtures/dense-domain-canvas.krs"),
    "utf8",
  );

  /** Every withheld edge group must carry its authored text twice: attribute and <title>. */
  function expectReachable(svg: string): { deferred: number; truncated: number } {
    const withheld = edgeGroups(svg).filter((e) => attr(e.tag, "data-edge-label-withheld"));
    for (const e of withheld) {
      const label = attr(e.tag, "data-edge-label");
      expect(label).toBeDefined();
      // Both are XML-escaped the same way, so they compare as written.
      expect(e.body).toContain(`<title>${label}</title>`);
    }
    const kind = (k: string) =>
      withheld.filter((e) => attr(e.tag, "data-edge-label-withheld") === k).length;
    return { deferred: kind("deferred"), truncated: kind("truncated") };
  }

  it("the UmamiApp drill-down leaves most labels off and truncates the rest", () => {
    const svg = compile(dense, { viewPath: ["Umami", "UmamiApp"] }).svg;
    const edges = edgeGroups(svg);
    expect(edges).toHaveLength(41);
    const { deferred, truncated } = expectReachable(svg);
    expect(deferred).toBeGreaterThan(20);
    expect(truncated).toBeGreaterThanOrEqual(8);
    // A deferred edge draws no label; every other one does.
    expect(edges.filter((e) => !e.body.includes("<text"))).toHaveLength(deferred);
  });

  it("under `always` and no budget, all 41 labels are drawn in full with no marker", () => {
    const svg = compile(dense, { viewPath: ["Umami", "UmamiApp"], styleSource: BEFORE }).svg;
    expect(edgeGroups(svg).every((e) => e.body.includes("<text"))).toBe(true);
    for (const marker of MARKERS) expect(svg).not.toContain(marker);
  });

  it.each(SURFACES.filter((s) => s.name !== "compile"))(
    "$name: every withheld label in the bundle is reachable",
    ({ render }) => {
      const { deferred } = expectReachable(render(dense));
      expect(deferred).toBeGreaterThan(20);
    },
  );
});

describe("examples corpus: the defaults withhold nothing (#3022)", () => {
  // Every authored label in `examples/` is within the budget, and none collide
  // beyond what a nudge clears. If this starts failing, either an example grew
  // a label the canvas now cuts, or a default moved.
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, out);
      else if (/\.krs(\.style)?$/.test(name)) out.push(path);
    }
    return out;
  }

  it("no example's all-views bundle carries a withheld label", async () => {
    const files = walk(join(REPO_ROOT, "examples"));
    const fs = new InMemoryFileSystemProvider();
    for (const file of files) {
      await fs.writeFile(file.slice(REPO_ROOT.length), readFileSync(file, "utf8"));
    }
    const entries = files.filter((f) => f.endsWith(".krs")).map((f) => f.slice(REPO_ROOT.length));
    expect(entries.length).toBeGreaterThan(50);

    const withheld: string[] = [];
    for (const entry of entries) {
      const { svg } = await buildAllViewsSvgProject(entry, fs);
      for (const e of edgeGroups(svg)) {
        const kind = attr(e.tag, "data-edge-label-withheld");
        if (kind) withheld.push(`${entry}: ${kind} "${attr(e.tag, "data-edge-label")}"`);
      }
    }
    expect(withheld).toEqual([]);
  });
});
