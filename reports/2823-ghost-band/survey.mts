// SPIKE #2823: aspect survey + SVG dump for a given checkout.
// Run: pnpm exec tsx reports/2823-ghost-band/survey.ts <repoRoot> <outDir> <corpus.krs>...
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const [root, outDir, ...corpora] = process.argv.slice(2);
const core = await import(join(root!, "packages/core/src/index.ts"));
const { Parser } = await import(join(root!, "packages/core/src/parser/parser.ts"));
const { extractEntityView } = await import(join(root!, "packages/core/src/view/entity-relations.ts"));
const { extractView } = await import(join(root!, "packages/core/src/view/view-extract.ts"));

const dims = (svg: string) => {
  const m = svg.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/);
  return m ? [+m[1], +m[2]] : [0, 0];
};
const inBand = (w: number, h: number) => w / h <= 16 / 9 && w / h >= 9 / 16;
mkdirSync(outDir!, { recursive: true });
const rows: Record<string, unknown>[] = [];
for (const corpus of corpora) {
  const name = basename(dirname(corpus));
  const src = readFileSync(corpus, "utf8");
  const file = Parser.parse(src).value;
  // deno-lint-ignore no-explicit-any
  const walk = (n: any, path: string[]) => {
    const p = [...path, n.id];
    const emit = (kind: string, ghosts: number, edges: number, svg: string) => {
      const [w, h] = dims(svg);
      const id = `${name}.${kind}.${p.join(".")}`;
      writeFileSync(join(outDir!, `${id}.svg`), svg);
      rows.push({ id, corpus: name, kind, path: p.join("."), ghosts, edges, w: Math.round(w), h: Math.round(h), inBand: inBand(w, h) });
    };
    if (n.kind === "service") {
      const s = extractView(file.systems, p);
      if (s.ghostDomains.length > 0)
        emit("service", s.ghostDomains.length, s.ghostDomainEdges.length, core.compile(src, { viewPath: p }).svg);
    }
    if (n.kind === "domain") {
      const s = extractEntityView(file.systems, p);
      if (s.ghostEntities.length > 0)
        emit("entity", s.ghostEntities.length, s.ghostEntityEdges.length, core.renderEntityView(src, p).svg);
    }
    for (const c of n.children) if (c.kind === "service" || c.kind === "domain") walk(c, p);
  };
  for (const sys of file.systems) walk(sys, []);
}
writeFileSync(join(outDir!, "survey.json"), JSON.stringify(rows, null, 1));
const out = rows.filter((r) => !r.inBand).length;
console.log(`views with ghosts: ${rows.length}; outside 16:9..9:16: ${out}`);
