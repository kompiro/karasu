/**
 * Why an edge has no canonical id — and therefore, today, no hover affordance.
 *
 * The census counts the gap; this attributes it. Every drawn edge is bucketed
 * by the reason `renderEdge` saw `canonicalId === undefined`, so the design
 * can answer "which pipelines fail to assign one" rather than "the deploy view
 * does not".
 *
 * Run: DIFY=/workspaces/dify pnpm exec tsx reports/2632-deploy-edge-hover/classify.ts
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

/** Split the SVG into the ghost-edge group and everything else. */
function ghostSpan(svg: string): [number, number] | undefined {
  const open = svg.indexOf('<g class="ghost-edges"');
  if (open === -1) return undefined;
  // The group is emitted as one `el()` call, so its close is the matching </g>
  // at depth 0 from `open`.
  let depth = 0;
  const tag = /<(\/?)g\b/g;
  tag.lastIndex = open;
  for (let m = tag.exec(svg); m !== null; m = tag.exec(svg)) {
    depth += m[1] === "/" ? -1 : 1;
    if (depth === 0) return [open, m.index];
  }
  return undefined;
}

type Bucket = "ghost" | "aggregated" | "base-collision" | "no-id-pass" | "has-id";
const totals = new Map<Bucket, number>();
const bump = (b: Bucket, n = 1) => totals.set(b, (totals.get(b) ?? 0) + n);
const examples = new Map<Bucket, string[]>();
const note = (b: Bucket, s: string) => {
  const xs = examples.get(b) ?? [];
  if (xs.length < 3) xs.push(s);
  examples.set(b, xs);
};

function scan(model: string, surface: string, svg: string, ambiguous: number): void {
  const span = ghostSpan(svg);
  for (const m of svg.matchAll(/<g ([^>]*class="krs-edge[^"]*"[^>]*)>/g)) {
    const attrs = m[1];
    const get = (k: string) => new RegExp(`${k}="([^"]*)"`).exec(attrs)?.[1];
    const where = `${model}/${surface}: ${get("data-edge-from")}→${get("data-edge-to")}`;
    if (get("data-edge-canonical-id") !== undefined) {
      bump("has-id");
      continue;
    }
    if (span && m.index > span[0] && m.index < span[1]) {
      bump("ghost");
      note("ghost", where);
    } else if (/data-domain-edges=/.test(svg.slice(m.index, m.index + 4000))) {
      bump("aggregated");
      note("aggregated", where);
    } else if (ambiguous > 0) {
      bump("base-collision");
      note("base-collision", where);
    } else {
      bump("no-id-pass");
      note("no-id-pass", where);
    }
  }
}

for (const { name, src } of projects) {
  for (const diagramType of ["system", "deploy"] as const) {
    const r = compile(src, { diagramType, interactive: true });
    if (!r.svg) continue;
    const amb = (r.diagnostics ?? []).filter((d) => d.code === "ambiguous-edge-base").length;
    scan(name, diagramType, r.svg, amb);
  }
  const root = compile(src, { diagramType: "system", interactive: true });
  for (const m of (root.svg ?? "").matchAll(/data-node-id="([^"]+)"/g)) {
    const drill = compile(src, { diagramType: "system", viewPath: [m[1]], interactive: true });
    if (!drill.svg) continue;
    const amb = (drill.diagnostics ?? []).filter((d) => d.code === "ambiguous-edge-base").length;
    scan(name, `drill:${m[1]}`, drill.svg, amb);
  }
}

console.log("drawn edges by why they do (not) carry a canonical id:\n");
for (const [b, n] of [...totals].sort((a, x) => x[1] - a[1])) {
  console.log(`  ${b.padEnd(16)} ${String(n).padStart(5)}`);
  for (const e of examples.get(b) ?? []) console.log(`      e.g. ${e}`);
}
