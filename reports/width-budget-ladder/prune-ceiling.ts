/* eslint-disable no-console -- spike script */
/**
 * SPIKE — #2761 option 5. NOT FOR MERGE.
 *
 * "A candidate whose cards alone already cover more area than the incumbent
 * canvas cannot win, so skip its routing chain." Routing only pushes the
 * canvas outward, so the pre-routing card/container box is a lower bound on
 * the canvas — and a lower bound at or above the incumbent's area is a sound,
 * byte-identical prune.
 *
 * This counts how often the test would fire, and first checks the lower-bound
 * property itself holds on every candidate the search ran.
 *
 *   pnpm tsx reports/width-budget-ladder/prune-ceiling.ts <file.krs>
 */
import { candidateTrace, traceState } from "../../packages/core/src/renderer/spike-instrument.ts";
import { parseModel, walkLevels } from "./walk.ts";

const file = process.argv[2];
if (!file) throw new Error("usage: prune-ceiling.ts <file.krs>");

traceState.on = true;
walkLevels(parseModel(file));

let violations = 0;
let candidates = 0;
let prunable = 0;
let firstCandidates = 0;
const bySearch = new Map<number, number[][]>();
for (const row of candidateTrace) {
  const list = bySearch.get(row[0]) ?? [];
  list.push(row);
  bySearch.set(row[0], list);
}

for (const rows of bySearch.values()) {
  for (let i = 0; i < rows.length; i++) {
    const [, , width, height, , preW, preH, bestArea] = rows[i];
    candidates++;
    if (i === 0) firstCandidates++;
    // The lower-bound property: the pre-routing box never exceeds the canvas.
    if (preW > width + 1e-6 || preH > height + 1e-6) violations++;
    // The prune: an incumbent exists and the lower bound already matches it.
    if (i > 0 && bestArea > 0 && preW * preH >= bestArea) prunable++;
  }
}

console.log(`searches ${bySearch.size}  candidates ${candidates}  (first ${firstCandidates})`);
console.log(`lower-bound violations (pre-routing box wider/taller than the canvas): ${violations}`);
console.log(
  `candidates the prune would skip routing for: ${prunable} of ${candidates - firstCandidates} non-first candidates (${(((prunable) / Math.max(1, candidates - firstCandidates)) * 100).toFixed(1)}%)`,
);
