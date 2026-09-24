/* eslint-disable no-console -- spike script */
/**
 * SPIKE — #2761 option 4. NOT FOR MERGE.
 *
 * Ceiling on "skip a candidate budget that cannot change the placement".
 * Walks every drill-down level and, per search, counts the candidates whose
 * canvas is identical to the previous candidate's. A candidate the rule would
 * skip necessarily lands in that set, so it is an upper bound on the saving.
 *
 *   pnpm tsx reports/width-budget-ladder/dup-candidates.ts <file.krs>
 */
import { candidateTrace, traceState } from "../../packages/core/src/renderer/spike-instrument.ts";
import { parseModel, walkLevels } from "./walk.ts";

const file = process.argv[2];
if (!file) throw new Error("usage: dup-candidates.ts <file.krs>");

traceState.on = true;
walkLevels(parseModel(file));

const bySearch = new Map<number, number[][]>();
for (const row of candidateTrace) {
  const list = bySearch.get(row[0]) ?? [];
  list.push(row);
  bySearch.set(row[0], list);
}

let candidates = 0;
let dupes = 0;
let searchesWithDupes = 0;
const runLengths = new Map<number, number>();
for (const rows of bySearch.values()) {
  candidates += rows.length;
  let dupHere = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] === rows[i - 1][2] && rows[i][3] === rows[i - 1][3]) dupHere++;
  }
  dupes += dupHere;
  if (dupHere > 0) searchesWithDupes++;
  runLengths.set(rows.length, (runLengths.get(rows.length) ?? 0) + 1);
}

console.log(`searches ${bySearch.size}  candidates ${candidates}`);
console.log(
  `candidates with the same canvas as the one before: ${dupes} (${((dupes / candidates) * 100).toFixed(1)}%) across ${searchesWithDupes} searches`,
);
console.log(
  `candidates per search: ${[...runLengths.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}x${v}`).join(" ")}`,
);

// Where the work actually is: searches that ran more than one candidate.
const multi = [...bySearch.values()].filter((r) => r.length > 1);
const multiCandidates = multi.reduce((a, r) => a + r.length, 0);
const multiDupes = multi.reduce((a, rows) => {
  let d = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i][2] === rows[i - 1][2] && rows[i][3] === rows[i - 1][3]) d++;
  return a + d;
}, 0);
console.log(
  `searches beyond the first candidate: ${multi.length}, candidates ${multiCandidates}, duplicates ${multiDupes} (${((multiDupes / multiCandidates) * 100).toFixed(1)}%)`,
);
