import { readFileSync } from "node:fs";
import { Parser } from "../../packages/core/src/parser/parser.js";
import { extractEntityView } from "../../packages/core/src/view/entity-relations.js";
const file = Parser.parse(readFileSync(process.argv[2]!, "utf8")).value;
for (const d of ["IdentityAccess", "AppManagement", "Workflow"]) {
  const s = extractEntityView(file.systems, ["Dify", "ApiBackend", d]);
  const per = new Map<string, { n: number; inE: number; outE: number; partners: Set<string> }>();
  const domOf = new Map(s.ghostEntities.map((g) => [g.key, g.parentDomainLabel]));
  for (const g of s.ghostEntities) per.set(g.parentDomainLabel, per.get(g.parentDomainLabel) ?? { n: 0, inE: 0, outE: 0, partners: new Set() }), per.get(g.parentDomainLabel)!.n++;
  const localIn = new Map<string, number>();
  for (const e of s.ghostEntityEdges) {
    const inc = domOf.has(e.from);
    const p = per.get(domOf.get(inc ? e.from : e.to)!)!;
    inc ? p.inE++ : p.outE++;
    p.partners.add(inc ? e.to : e.from);
    const l = inc ? e.to : e.from; localIn.set(l, (localIn.get(l) ?? 0) + 1);
  }
  console.log(`== ${d}: local partners by ghost-edge count`, [...localIn].sort((a, b) => b[1] - a[1]).slice(0, 5));
  for (const [k, v] of [...per].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k}\tghosts=${v.n}\tin=${v.inE}\tout=${v.outE}\tlocalPartners=${v.partners.size}`);
}
