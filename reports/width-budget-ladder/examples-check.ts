/* eslint-disable no-console -- spike script */
/**
 * SPIKE — spike/width-budget-ladder, Issue #2761 option 3. NOT FOR MERGE.
 *
 * #2761's acceptance criterion says the budget the search picks must be
 * unchanged on the examples corpus unless an ADR says otherwise. This checks
 * that, and re-checks determinism (two walks of the same configuration must
 * produce identical bytes) on the same pass.
 *
 *   pnpm tsx reports/width-budget-ladder/examples-check.ts
 */
import { writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import { configureLadder, type LadderConfig } from "../../packages/core/src/renderer/spike-instrument.ts";
import { parseModel, sha1, walkLevels } from "./walk.ts";

const CONFIGS: Array<{ id: string; ladder: LadderConfig }> = [
  { id: "today", ladder: { steps: 12, maxMultiple: 6, patience: null } },
  { id: "steps8", ladder: { steps: 8, maxMultiple: 6, patience: null } },
  { id: "steps6", ladder: { steps: 6, maxMultiple: 6, patience: null } },
  { id: "steps4", ladder: { steps: 4, maxMultiple: 6, patience: null } },
  { id: "steps3", ladder: { steps: 3, maxMultiple: 6, patience: null } },
  { id: "steps6m2", ladder: { steps: 6, maxMultiple: 2, patience: null } },
  { id: "floor", ladder: { steps: 1, maxMultiple: 6, patience: null } },
  { id: "patience1", ladder: { steps: 12, maxMultiple: 6, patience: 1 } },
  { id: "patience2", ladder: { steps: 12, maxMultiple: 6, patience: 2 } },
];

const files = globSync("examples/*/*/index.krs").sort();
const out: Record<string, Record<string, number>> = {};
let nondeterministic = 0;
let totalLevels = 0;

const hashesFor = (file: string): string[] => {
  const levels = walkLevels(parseModel(file));
  return levels.map((l) => sha1(l.svg));
};

for (const id of CONFIGS.map((c) => c.id)) out[id] = {};

const baseline = new Map<string, string[]>();
for (const spec of CONFIGS) {
  configureLadder(spec.ladder);
  for (const file of files) {
    const hashes = hashesFor(file);
    // Determinism: a second walk of a freshly parsed model must be identical.
    const again = hashesFor(file);
    if (hashes.join() !== again.join()) nondeterministic++;
    if (spec.id === "today") {
      baseline.set(file, hashes);
      totalLevels += hashes.length;
    }
    const base = baseline.get(file)!;
    out[spec.id][file] = hashes.filter((h, i) => h !== base[i]).length;
  }
}

const rows = CONFIGS.map((c) => {
  const changed = Object.values(out[c.id]).reduce((a, b) => a + b, 0);
  const filesChanged = Object.values(out[c.id]).filter((v) => v > 0).length;
  return { id: c.id, changed, filesChanged };
});
console.log(`examples corpus: ${files.length} models, ${totalLevels} levels`);
console.log(`non-deterministic walks: ${nondeterministic}`);
for (const r of rows) {
  console.log(`  ${r.id.padEnd(10)} levels differing from today: ${r.changed}  (models: ${r.filesChanged})`);
}
writeFileSync(
  "reports/width-budget-ladder/examples.json",
  `${JSON.stringify({ files, totalLevels, nondeterministic, rows, perFile: out }, null, 2)}\n`,
);
