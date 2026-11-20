// #2823: entity-view vs usecase-view canvas size per Dify domain, plus ghost counts.
// Run: pnpm exec tsx reports/2823/measure.ts /workspaces/dify/index.krs
import { readFileSync, writeFileSync } from "node:fs";
import { compile, renderEntityView } from "../../packages/core/src/index.js";
import { Parser } from "../../packages/core/src/parser/parser.js";
import { extractEntityView } from "../../packages/core/src/view/entity-relations.js";

const path = process.argv[2]!;
const src = readFileSync(path, "utf8");
const file = Parser.parse(src).value;
const size = (svg: string) => {
  const m = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/);
  return m ? `${Math.round(+m[3])} x ${Math.round(+m[4])}` : "?";
};
const domains = process.argv.slice(3).length ? process.argv.slice(3) : ["IdentityAccess", "AppManagement", "Workflow", "Knowledge", "Snippet"];
for (const d of domains) {
  const vp = ["Dify", "ApiBackend", d];
  const slice = extractEntityView(file.systems, vp);
  const foreignDomains = new Set(slice.ghostEntities.map((g) => g.parentDomainLabel));
  const ev = renderEntityView(src, vp);
  writeFileSync(`reports/2823/${d}.entity.svg`, ev.svg);
  const uc = compile(src, { viewPath: vp });
  console.log(`${d}\tlocal=${slice.childNodes.length}\tghosts=${slice.ghostEntities.length}\tforeignDomains=${foreignDomains.size}\tghostEdges=${slice.ghostEntityEdges.length}\tentity=${size(ev.svg)}\tusecase=${size(uc.svg)}`);
}
