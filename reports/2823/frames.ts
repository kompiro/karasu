import { readFileSync } from "node:fs";
import { Parser } from "../../packages/core/src/parser/parser.js";
import { extractEntityView } from "../../packages/core/src/view/entity-relations.js";
const file = Parser.parse(readFileSync(process.argv[2]!, "utf8")).value;
for (const d of ["IdentityAccess", "AppManagement", "Workflow"]) {
  const s = extractEntityView(file.systems, ["Dify", "ApiBackend", d]);
  const inc = new Map<string, number>(), out = new Map<string, number>();
  for (const e of s.ghostEntityEdges) {
    if (s.ghostEntities.some((g) => g.key === e.from)) inc.set(e.from, (inc.get(e.from) ?? 0) + 1);
    else out.set(e.to, (out.get(e.to) ?? 0) + 1);
  }
  const side = (k: string) => ((inc.get(k) ?? 0) > (out.get(k) ?? 0) ? "above" : "below");
  const twoWay = s.ghostEntities.filter((g) => inc.has(g.key) && out.has(g.key)).map((g) => `${g.key} in=${inc.get(g.key)} out=${out.get(g.key)} -> ${side(g.key)}`);
  const frames = new Set(s.ghostEntities.map((g) => `${g.parentDomainLabel}|${side(g.key)}`));
  const above = s.ghostEntities.filter((g) => side(g.key) === "above").length;
  console.log(d, "domains", new Set(s.ghostEntities.map((g) => g.parentDomainLabel)).size, "frames", frames.size, "above", above, "below", s.ghostEntities.length - above, "twoWay", twoWay);
}
