/* eslint-disable no-console -- spike script */
/**
 * SPIKE — spike/width-budget-ladder, Issue #2761 option 3. NOT FOR MERGE.
 *
 * The drill-down walk covers logical levels only, but `layoutDeploy` calls the
 * same `searchWidthBudget` — and ADR-2593's motivating example was precisely
 * the dify deploy view (1274 x 3686). This compiles the deploy view under each
 * ladder configuration and records its canvas, so the area column is not blind
 * to the view the ADR was written for.
 *
 *   pnpm tsx reports/width-budget-ladder/deploy-check.ts <file.krs>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { compile } from "../../packages/core/src/compile/compile.ts";
import {
  configureLadder,
  counters,
  resetCounters,
  type LadderConfig,
} from "../../packages/core/src/renderer/spike-instrument.ts";
import { sha1, svgCanvas } from "./walk.ts";

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

const file = process.argv[2];
if (!file) throw new Error("usage: deploy-check.ts <file.krs>");
const source = readFileSync(file, "utf8");

// Warm the JIT before any number is taken.
compile(source, { diagramType: "deploy" });

const rows = CONFIGS.map((spec) => {
  configureLadder(spec.ladder);
  let ms = Infinity;
  for (let i = 0; i < 5; i++) {
    const started = performance.now();
    compile(source, { diagramType: "deploy" });
    ms = Math.min(ms, performance.now() - started);
  }
  resetCounters();
  const result = compile(source, { diagramType: "deploy" });
  const svg = "svg" in result ? (result.svg as string) : "";
  const { width, height } = svgCanvas(svg);
  return {
    id: spec.id,
    width,
    height,
    areaMpx: (width * height) / 1e6,
    aspect: height > 0 ? width / height : 0,
    candidates: counters.candidates,
    compileMs: ms,
    hash: sha1(svg),
  };
});
for (const r of rows) {
  console.log(
    `${r.id.padEnd(10)} ${r.width} x ${r.height}  ${r.areaMpx.toFixed(2)} Mpx  aspect ${r.aspect.toFixed(2)}  candidates ${r.candidates}  ${r.compileMs.toFixed(1)} ms  ${r.hash === rows[0].hash ? "same as today" : "DIFFERENT"}`,
  );
}
writeFileSync("reports/width-budget-ladder/deploy.json", `${JSON.stringify(rows, null, 2)}\n`);
