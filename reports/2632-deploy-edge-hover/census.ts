/**
 * Spike census for #2632 — how many drawn edges carry each of the three
 * capabilities `renderEdge` currently derives from one flag, per render
 * surface, on the real models rather than synthetic fixtures.
 *
 *   hit-line      → the wide transparent click target
 *   --interactive → the right-click advertisement (cursor: context-menu)
 *   canonical id  → addressability (`edge#<id>` selectors, context menu)
 *
 * Models are the built-in `ExampleProject`s — what the app actually opens —
 * plus the reverse-engineered dify model when `DIFY=<dir>` is set. Reading
 * `examples/` off disk was tried first and rejected: concatenating every file
 * under `examples/ja/ec-platform/` merges seven separate projects into one
 * multi-system root that no user ever sees.
 *
 * Run: pnpm exec tsx reports/2632-deploy-edge-hover/census.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { compile } from "../../packages/core/src/index.js";
import {
  GETTING_STARTED_PROJECT,
  EC_PLATFORM_PROJECTS,
  FEATURE_SAMPLES_PROJECT,
  MULTI_FILE_SYSTEM_PROJECT,
  FACET_STYLING_PROJECT,
  CLIENT_MCP_PROJECT,
  DEPLOY_ONLY_PROJECT,
  type ExampleProject,
} from "../../packages/core/src/builtins/examples.js";

interface Census {
  edges: number;
  hitline: number;
  interactive: number;
  canonical: number;
  bytes: number;
}

function census(svg: string): Census {
  const n = (re: RegExp) => (svg.match(re) ?? []).length;
  return {
    edges: n(/class="krs-edge(?:[" ])/g),
    hitline: n(/class="krs-edge__hitline"/g),
    interactive: n(/krs-edge--interactive/g),
    canonical: n(/data-edge-canonical-id=/g),
    bytes: Buffer.byteLength(svg, "utf8"),
  };
}

const srcOf = (p: ExampleProject): string =>
  p.files
    .filter((f) => f.path.endsWith(".krs"))
    .map((f) => f.content)
    .join("\n");

const projects: { name: string; src: string }[] = [
  { name: "getting-started", src: srcOf(GETTING_STARTED_PROJECT) },
  ...EC_PLATFORM_PROJECTS.map((p) => ({ name: p.name, src: srcOf(p) })),
  { name: FEATURE_SAMPLES_PROJECT.name, src: srcOf(FEATURE_SAMPLES_PROJECT) },
  { name: MULTI_FILE_SYSTEM_PROJECT.name, src: srcOf(MULTI_FILE_SYSTEM_PROJECT) },
  { name: FACET_STYLING_PROJECT.name, src: srcOf(FACET_STYLING_PROJECT) },
  { name: CLIENT_MCP_PROJECT.name, src: srcOf(CLIENT_MCP_PROJECT) },
  { name: DEPLOY_ONLY_PROJECT.name, src: srcOf(DEPLOY_ONLY_PROJECT) },
];

const difyDir = process.env.DIFY;
if (difyDir !== undefined) {
  const parts: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".krs")) parts.push(readFileSync(p, "utf8"));
    }
  };
  walk(difyDir);
  projects.push({ name: "dify", src: parts.join("\n") });
}

const rows: (Census & { model: string; surface: string })[] = [];

for (const { name, src } of projects) {
  for (const diagramType of ["system", "deploy"] as const) {
    const r = compile(src, { diagramType, interactive: true, nodeControls: true });
    if (!r.svg) continue;
    const c = census(r.svg);
    if (c.edges === 0) continue;
    rows.push({ model: name, surface: diagramType, ...c });
  }

  // Drill-down onto every top-level node that has one, so the surface a reader
  // reaches by clicking a card is measured too.
  const root = compile(src, { diagramType: "system", interactive: true });
  for (const m of (root.svg ?? "").matchAll(/data-node-id="([^"]+)"/g)) {
    const id = m[1];
    const drill = compile(src, { diagramType: "system", viewPath: [id], interactive: true });
    if (!drill.svg) continue;
    const c = census(drill.svg);
    if (c.edges === 0) continue;
    rows.push({ model: name, surface: `drill:${id}`, ...c });
  }
}

const head = ["model", "surface", "edges", "hitline", "interactive", "canonical", "bytes"];
const cells = rows.map((r) => [
  r.model,
  r.surface,
  String(r.edges),
  String(r.hitline),
  String(r.interactive),
  String(r.canonical),
  String(r.bytes),
]);
const w = head.map((h) => h.length);
for (const row of cells) row.forEach((c, i) => (w[i] = Math.max(w[i], c.length)));
const line = (cs: string[]) => cs.map((c, i) => c.padEnd(w[i])).join("  ");
console.log(line(head));
console.log(w.map((n) => "-".repeat(n)).join("  "));
for (const row of cells) console.log(line(row));

const tot = rows.reduce(
  (a, r) => ({
    edges: a.edges + r.edges,
    hitline: a.hitline + r.hitline,
    interactive: a.interactive + r.interactive,
    canonical: a.canonical + r.canonical,
    bytes: a.bytes + r.bytes,
  }),
  { edges: 0, hitline: 0, interactive: 0, canonical: 0, bytes: 0 },
);
console.log(w.map((n) => "-".repeat(n)).join("  "));
console.log(
  line([
    "TOTAL",
    `${rows.length} surfaces`,
    String(tot.edges),
    String(tot.hitline),
    String(tot.interactive),
    String(tot.canonical),
    String(tot.bytes),
  ]),
);
console.log(
  `\nedges with no hover affordance today: ${tot.edges - tot.interactive} / ${tot.edges} ` +
    `(${((100 * (tot.edges - tot.interactive)) / tot.edges).toFixed(1)}%)`,
);
