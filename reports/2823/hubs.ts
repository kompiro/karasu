import { readFileSync } from "node:fs";
import { Parser } from "../../packages/core/src/parser/parser.js";
import { extractEntityView } from "../../packages/core/src/view/entity-relations.js";
import type { KrsNode } from "../../packages/core/src/types/ast.js";
const file = Parser.parse(readFileSync(process.argv[2]!, "utf8")).value;
const walk = (n: KrsNode, path: string[]) => {
  const p = [...path, n.id];
  if (n.kind === "domain") {
    const s = extractEntityView(file.systems, p);
    if (s.ghostEntities.length >= 20) {
      const keys = new Set(s.ghostEntities.map((g) => g.key));
      const c = new Map<string, number>();
      for (const e of s.ghostEntityEdges) { const l = keys.has(e.from) ? e.to : e.from; c.set(l, (c.get(l) ?? 0) + 1); }
      const top = [...c].sort((a, b) => b[1] - a[1]);
      const doms = new Set(s.ghostEntities.map((g) => g.parentDomainLabel)).size;
      console.log(`${p.join(".")}\tghosts=${s.ghostEntities.length}\tdomains=${doms}\tedges=${s.ghostEntityEdges.length}\ttop=${top[0][0]}:${top[0][1]}\ttop2share=${(((top[0][1] + (top[1]?.[1] ?? 0)) / s.ghostEntityEdges.length) * 100).toFixed(0)}%`);
    }
  }
  for (const c of n.children) if (c.kind === "service" || c.kind === "domain") walk(c, p);
};
for (const s of file.systems) walk(s, []);
