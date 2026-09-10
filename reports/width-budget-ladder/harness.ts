/* eslint-disable no-console -- spike script; the console is the progress log */
/**
 * SPIKE — spike/width-budget-ladder, Issue #2761 option 3. NOT FOR MERGE.
 *
 * Measures the width-budget ladder's trade-off on a reference model: for each
 * ladder configuration, the canvas the reader gets and the work the renderer
 * does. Reproduces the shape of ADR-2593's own table (objective | total canvas
 * area | views outside the aspect band) so the numbers sit next to it, and
 * adds the counts #2761 asks for (full placements, changed levels, wall time).
 *
 *   pnpm tsx reports/width-budget-ladder/harness.ts <file.krs> <main-hashes.txt>
 *
 * `main-hashes.txt` comes from `baseline-hashes.ts` run on an unmodified tree,
 * so "renders a different SVG" is a byte comparison against main, not against
 * this build's own baseline.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { withinAspectBand } from "../../packages/core/src/renderer/aspect-search.ts";
import { buildAllViewsSvg } from "../../packages/core/src/renderer/drill-down-svg.ts";
import {
  configureLadder,
  counters,
  lastLayout,
  resetCounters,
  type LadderConfig,
} from "../../packages/core/src/renderer/spike-instrument.ts";
import { parseModel, sha1, svgCanvas, walkLevels } from "./walk.ts";

const RUNS = 5;

interface ConfigSpec {
  id: string;
  label: string;
  note: string;
  ladder: LadderConfig;
  env: string;
}

const CONFIGS: ConfigSpec[] = [
  cfg("today", "today (steps 12, reach 6x)", "the shipped ladder — ADR-2593", 12, 6, null),
  cfg("steps8", "steps 8 (reach 6x)", "same reach, coarser sampling", 8, 6, null),
  cfg("steps6", "steps 6 (reach 6x)", "same reach, coarser sampling", 6, 6, null),
  cfg("steps4", "steps 4 (reach 6x)", "same reach, coarser sampling", 4, 6, null),
  cfg("steps3", "steps 3 (reach 6x)", "same reach, coarser sampling", 3, 6, null),
  cfg("steps6m2", "steps 6, reach 2x", "same ratio as today, shorter reach", 6, 2, null),
  cfg("floor", "steps 1 (floor only)", "no search at all — pre-ADR-2593", 1, 6, null),
  cfg("patience1", "steps 12, patience 1", "stop at the first candidate that does not improve", 12, 6, 1),
  cfg("patience2", "steps 12, patience 2", "stop after two consecutive non-improvements", 12, 6, 2),
];

function cfg(
  id: string,
  label: string,
  note: string,
  steps: number,
  maxMultiple: number,
  patience: number | null,
): ConfigSpec {
  return {
    id,
    label,
    note,
    ladder: { steps, maxMultiple, patience },
    env: `steps=${steps},maxMultiple=${maxMultiple},patience=${patience ?? "off"}`,
  };
}

interface LevelRecord {
  path: string;
  nodes: number;
  edges: number;
  hash: string;
  budget: number;
  width: number;
  height: number;
  svgWidth: number;
  svgHeight: number;
  candidates: number;
  replacements: number;
  renderMs: number;
}

/** One full walk of the model under the current ladder configuration. */
function measure(krsFile: ReturnType<typeof parseModel>): LevelRecord[] {
  resetCounters();
  const records: LevelRecord[] = [];
  let seenCandidates = 0;
  let seenReplacements = 0;
  walkLevels(krsFile, (level) => {
    const canvas = svgCanvas(level.svg);
    records.push({
      path: level.path,
      nodes: level.nodes,
      edges: level.edges,
      hash: sha1(level.svg),
      budget: lastLayout.budget,
      width: lastLayout.width,
      height: lastLayout.height,
      svgWidth: canvas.width,
      svgHeight: canvas.height,
      candidates: counters.candidates - seenCandidates,
      replacements: counters.replacements - seenReplacements,
      renderMs: level.renderMs,
    });
    seenCandidates = counters.candidates;
    seenReplacements = counters.replacements;
  });
  return records;
}

/** `buildAllViewsSvg` timed with the candidate-placement counters attached. */
function allViewsProfile(krsFile: ReturnType<typeof parseModel>): {
  totalMs: number;
  extraCandidateMs: number;
  firstCandidateMs: number;
  searches: number;
  searchesBeyondFirst: number;
  candidates: number;
  replacements: number;
} {
  let best: ReturnType<typeof allViewsProfile> | null = null;
  for (let i = 0; i < RUNS; i++) {
    resetCounters();
    const started = performance.now();
    buildAllViewsSvg(krsFile);
    const totalMs = performance.now() - started;
    if (!best || totalMs < best.totalMs) {
      best = {
        totalMs,
        extraCandidateMs: counters.extraCandidateMs,
        firstCandidateMs: counters.firstCandidateMs,
        searches: counters.searches,
        searchesBeyondFirst: counters.searchesBeyondFirst,
        candidates: counters.candidates,
        replacements: counters.replacements,
      };
    }
  }
  return best!;
}

/** Best-of-N `buildAllViewsSvg` from a fresh process, via `pnpm bench:render`. */
function benchAllViews(file: string, env: string): number {
  const out = execFileSync("npx", ["tsx", "scripts/bench/render.ts", file, "--runs", String(RUNS)], {
    encoding: "utf8",
    env: { ...process.env, KARASU_SPIKE_LADDER: env },
    maxBuffer: 32 * 1024 * 1024,
  });
  const line = out.split("\n").find((l) => l.includes("buildAllViewsSvg"));
  const match = line && /([\d.]+) ms/.exec(line);
  if (!match) throw new Error(`bench:render produced no all-views time:\n${out}`);
  return Number(match[1]);
}

function main(): void {
  const [file, mainHashesPath] = process.argv.slice(2);
  if (!file || !mainHashesPath) throw new Error("usage: harness.ts <file.krs> <main-hashes.txt>");

  const mainHashes = new Map<string, string>();
  for (const line of readFileSync(mainHashesPath, "utf8").trim().split("\n")) {
    const [path, hash] = line.split("\t");
    mainHashes.set(path, hash);
  }

  const results: Record<string, unknown>[] = [];
  let baseline: LevelRecord[] | null = null;

  for (const spec of CONFIGS) {
    configureLadder(spec.ladder);
    // A fresh parse per configuration: `buildAllViewsSvg` mutates the AST it is
    // handed (`analyze` marks cyclic edges), so a walk that followed one in the
    // same process would not be comparing like with like.
    const krsFile = parseModel(file);
    // Warm the JIT under this configuration before any number is taken.
    measure(krsFile);
    const records = measure(krsFile);
    // Per-level render time: best of RUNS, so a GC pause does not pick the
    // ten "heaviest" levels for us.
    for (let i = 1; i < RUNS; i++) {
      const again = measure(krsFile);
      for (let j = 0; j < records.length; j++) {
        records[j].renderMs = Math.min(records[j].renderMs, again[j].renderMs);
      }
    }
    baseline ??= records;

    const profile = allViewsProfile(parseModel(file));
    const benchMs = benchAllViews(file, spec.env);

    const area = records.reduce((a, r) => a + r.width * r.height, 0) / 1e6;
    const svgArea = records.reduce((a, r) => a + r.svgWidth * r.svgHeight, 0) / 1e6;
    const outsideBand = records.filter((r) => !withinAspectBand(r.width, r.height)).length;
    const placements = records.reduce((a, r) => a + r.candidates + r.replacements, 0);
    const beyondFirst = records.filter((r) => r.candidates > 1).length;
    const budgetChanged = records.filter((r, i) => r.budget !== baseline![i].budget).length;
    const svgChanged = records.filter((r) => mainHashes.get(r.path) !== r.hash).length;
    const heaviest = [...baseline!]
      .map((r, i) => i)
      .sort((a, b) => baseline![b].renderMs - baseline![a].renderMs)
      .slice(0, 10);

    results.push({
      ...spec,
      levels: records.length,
      areaMpx: area,
      svgAreaMpx: svgArea,
      outsideBand,
      placements,
      levelsBeyondFirst: beyondFirst,
      budgetChanged,
      svgChanged,
      benchAllViewsMs: benchMs,
      walkRenderMs: records.reduce((a, r) => a + r.renderMs, 0),
      profile,
      heaviest: heaviest.map((i) => ({
        path: records[i].path,
        nodes: records[i].nodes,
        edges: records[i].edges,
        renderMs: records[i].renderMs,
        baselineRenderMs: baseline![i].renderMs,
        candidates: records[i].candidates,
        replacements: records[i].replacements,
        placements: records[i].candidates + records[i].replacements,
        budget: records[i].budget,
        baselineBudget: baseline![i].budget,
        width: records[i].width,
        height: records[i].height,
        areaMpx: (records[i].width * records[i].height) / 1e6,
        baselineAreaMpx: (baseline![i].width * baseline![i].height) / 1e6,
      })),
      changedLevels: records
        .map((r, i) => ({ r, b: baseline![i] }))
        .filter(({ r, b }) => r.budget !== b.budget || r.hash !== mainHashes.get(r.path))
        .map(({ r, b }) => ({
          path: r.path,
          nodes: r.nodes,
          edges: r.edges,
          budget: r.budget,
          baselineBudget: b.budget,
          areaMpx: (r.width * r.height) / 1e6,
          baselineAreaMpx: (b.width * b.height) / 1e6,
          inBand: withinAspectBand(r.width, r.height),
          svgDiffersFromMain: mainHashes.get(r.path) !== r.hash,
        })),
    });
    console.log(
      `${spec.id.padEnd(10)} area ${area.toFixed(1)} Mpx  outside ${outsideBand}  ` +
        `placements ${placements}  budgetChanged ${budgetChanged}  svgChanged ${svgChanged}  ` +
        `bench ${benchMs.toFixed(1)} ms  extra ${profile.extraCandidateMs.toFixed(1)}/${profile.totalMs.toFixed(1)} ms`,
    );
  }

  writeFileSync(
    "reports/width-budget-ladder/data.json",
    `${JSON.stringify({ file, runs: RUNS, generated: new Date().toISOString(), results }, null, 2)}\n`,
  );
  console.log("wrote reports/width-budget-ladder/data.json");
}

main();
