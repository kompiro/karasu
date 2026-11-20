// #2823: every domain (entity view) and service (drill-down) in a corpus:
// ghost counts and the canvas aspect of the rendered view.
import { readFileSync } from "node:fs";
import { compile, renderEntityView } from "../../packages/core/src/index.js";
import { Parser } from "../../packages/core/src/parser/parser.js";
import { extractEntityView } from "../../packages/core/src/view/entity-relations.js";
import { extractView } from "../../packages/core/src/view/view-extract.js";
import type { KrsNode } from "../../packages/core/src/types/ast.js";

const src = readFileSync(process.argv[2]!, "utf8");
const file = Parser.parse(src).value;
const dims = (svg: string) => {
  const m = svg.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/);
  return m ? [+m[1], +m[2]] : [0, 0];
};
const rows: string[] = [];
let outside = { entity: 0, service: 0 }, total = { entity: 0, service: 0 };
const walk = (n: KrsNode, path: string[]) => {
  const p = [...path, n.id];
  if (n.kind === "service") {
    const s = extractView(file.systems, p);
    if (s.ghostDomains.length > 0) {
      const [w, h] = dims(compile(src, { viewPath: p }).svg);
      total.service++;
      if (w / h > 16 / 9) outside.service++;
      rows.push(`service\t${p.join(".")}\tghosts=${s.ghostDomains.length}\tedges=${s.ghostDomainEdges.length}\t${Math.round(w)}x${Math.round(h)}\t${(w / h).toFixed(2)}`);
    }
  }
  if (n.kind === "domain") {
    const s = extractEntityView(file.systems, p);
    if (s.ghostEntities.length > 0) {
      const [w, h] = dims(renderEntityView(src, p).svg);
      total.entity++;
      if (w / h > 16 / 9) outside.entity++;
      rows.push(`entity\t${p.join(".")}\tghosts=${s.ghostEntities.length}\tedges=${s.ghostEntityEdges.length}\t${Math.round(w)}x${Math.round(h)}\t${(w / h).toFixed(2)}`);
    }
  }
  for (const c of n.children) if (c.kind === "service" || c.kind === "domain") walk(c, p);
};
for (const sys of file.systems) walk(sys, []);
rows.sort((a, b) => +b.split("\t")[5] - +a.split("\t")[5]);
console.log(rows.slice(0, 15).join("\n"));
console.log(`views with ghosts: entity=${total.entity} service=${total.service}; aspect > 16:9: entity=${outside.entity} service=${outside.service}`);
