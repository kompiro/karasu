/* eslint-disable no-console -- spike script; stdout is the JSON result */
/**
 * SPIKE — spike/width-budget-ladder, Issue #2761 option 3. NOT FOR MERGE.
 * One process, one ladder configuration: best-of-N `buildAllViewsSvg` with the
 * candidate counters attached, printed as JSON. Driven by `allviews-sweep.ts`.
 *
 *   KARASU_SPIKE_LADDER=steps=8,... pnpm tsx .../allviews-once.ts <file.krs> [runs]
 */
import { performance } from "node:perf_hooks";
import { buildAllViewsSvg } from "../../packages/core/src/renderer/drill-down-svg.ts";
import { counters, resetCounters } from "../../packages/core/src/renderer/spike-instrument.ts";
import { parseModel } from "./walk.ts";

const file = process.argv[2];
const runs = Number(process.argv[3] ?? 7);
const krsFile = parseModel(file);
buildAllViewsSvg(krsFile); // warm the JIT and the module caches
let best = { totalMs: Infinity, extraCandidateMs: 0, firstCandidateMs: 0, candidates: 0 };
for (let i = 0; i < runs; i++) {
  resetCounters();
  const started = performance.now();
  buildAllViewsSvg(krsFile);
  const totalMs = performance.now() - started;
  if (totalMs < best.totalMs) {
    best = {
      totalMs,
      extraCandidateMs: counters.extraCandidateMs,
      firstCandidateMs: counters.firstCandidateMs,
      candidates: counters.candidates,
    };
  }
}
console.log(JSON.stringify(best));
