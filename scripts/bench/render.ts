/* eslint-disable no-console -- CLI entry point; the table is the output */
// Wall-clock benchmark of the render pipeline (Issue #2757), so the next
// regression is a number rather than a feeling:
//
//   pnpm bench:render                          # examples/en/getting-started/index.krs
//   pnpm bench:render path/to/index.krs --runs 5
//
// Reports the best-of-N wall time of the two entry points the parent issue
// measures (the all-views bundle and the single system view) and the ten
// slowest drill-down levels, with extraction and rendering timed separately.
// The level walk mirrors `buildDrillDownSvg` (packages/core/src/renderer/
// drill-down-svg.ts): `withUnassignedSystem` once, `extractView` per path, and
// a child is a level when it has children and its slice has content; the
// probe of each child is charged to the parent level's extraction, where the
// bundle pays it.
//
// Single-file models only, parsed with `Parser.parse`; an `@import` is left
// unresolved, which is fine for a timing whose input is the file itself.
// Paths are relative to the repo root, like the other scripts here.

import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { compile } from "../../packages/core/src/compile/compile.ts";
import { Parser } from "../../packages/core/src/parser/parser.ts";
import {
  buildLegendRenderOptions,
  buildStyles,
} from "../../packages/core/src/renderer/all-layers-svg.ts";
import { buildAllViewsSvg } from "../../packages/core/src/renderer/drill-down-svg.ts";
import {
  buildGroupLabelIndex,
  buildTeamLabelIndex,
  declaredGroupOrderOf,
} from "../../packages/core/src/renderer/group-labels.ts";
import {
  anchorId,
  legendScopeForLogicalSlice,
  render,
} from "../../packages/core/src/renderer/svg-renderer.ts";
import {
  resolveStyles,
  styleDerivedEdges,
} from "../../packages/core/src/resolver/style-resolver.ts";
import type { KrsFile, KrsNode } from "../../packages/core/src/types/ast.ts";
import { withUnassignedSystem } from "../../packages/core/src/view/unassigned-system.ts";
import { extractView, type ViewSlice } from "../../packages/core/src/view/view-extract.ts";

const DEFAULT_FILE = "examples/en/getting-started/index.krs";
const DEFAULT_RUNS = 5;
const SLOWEST_LEVELS = 10;

interface LevelTiming {
  path: string;
  nodes: number;
  edges: number;
  extractMs: number;
  renderMs: number;
}

function parseArgs(argv: string[]): { file: string; runs: number } {
  let file = DEFAULT_FILE;
  let runs = DEFAULT_RUNS;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--runs") {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error(`--runs expects a positive integer, got ${argv[i]}`);
      }
      runs = value;
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown option ${arg}`);
    } else {
      file = arg;
    }
  }
  return { file, runs };
}

function timed<T>(fn: () => T): { value: T; ms: number } {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}

/** Best of `runs` wall-clock milliseconds for `fn`. */
function bestOf(runs: number, fn: () => unknown): number {
  let best = Infinity;
  for (let i = 0; i < runs; i++) best = Math.min(best, timed(fn).ms);
  return best;
}

function countNodes(nodes: readonly KrsNode[]): number {
  let n = 0;
  for (const node of nodes) n += 1 + countNodes(node.children);
  return n;
}

/**
 * One pass over every drill-down level, the way `buildDrillDownSvg` walks
 * them, timing each level's extraction (its own slice plus its child probes)
 * and rendering separately.
 */
function walkLevels(krsFile: KrsFile): LevelTiming[] {
  const systems = withUnassignedSystem(krsFile);
  const { sheets } = buildStyles(undefined);
  const styles = resolveStyles(systems, sheets, []);
  const ownerIndex = krsFile.ownerIndex ?? new Map<string, string>();
  const legendOptions = buildLegendRenderOptions(krsFile, sheets);
  const groupLabels = buildGroupLabelIndex(krsFile, undefined);
  const teamLabels = buildTeamLabelIndex(krsFile);
  const declaredGroupOrder = declaredGroupOrderOf(krsFile, undefined);

  const hasContent = (slice: ViewSlice): boolean =>
    slice.childNodes.length > 0 || slice.systems.length > 0;
  const childrenOf = (slice: ViewSlice): KrsNode[] =>
    slice.systems.length > 0 ? slice.systems.flatMap((s) => s.children) : slice.childNodes;
  const extract = (path: string[]): { value: ViewSlice; ms: number } =>
    timed(() => styleDerivedEdges(extractView(systems, path), styles, sheets));

  const levels: LevelTiming[] = [];
  const walk = (path: string[]): void => {
    const level = extract(path);
    if (!hasContent(level.value)) return;

    let probeMs = 0;
    const drillable: KrsNode[] = [];
    for (const child of childrenOf(level.value)) {
      if (child.children.length === 0) continue;
      const probe = extract([...path, child.id]);
      probeMs += probe.ms;
      if (hasContent(probe.value)) drillable.push(child);
    }
    const links = new Map(drillable.map((c) => [c.id, anchorId("system", c.id)]));
    const slice = level.value;
    const rendered = timed(() =>
      render(slice, styles, undefined, ownerIndex, undefined, links, {
        ...legendOptions,
        viewScope: legendScopeForLogicalSlice(slice),
        boundaryMembership: krsFile.boundaryMembership,
        scopedBoundaryMembership: krsFile.scopedBoundaryMembership,
        declaredGroupOrder,
        groupLabels,
        teamLabels,
      }),
    );
    levels.push({
      path: path.length === 0 ? "(root)" : path.join("."),
      nodes: slice.childNodes.length,
      edges: slice.childEdges.length,
      extractMs: level.ms + probeMs,
      renderMs: rendered.ms,
    });
    for (const child of drillable) walk([...path, child.id]);
  };
  walk([]);
  return levels;
}

/** Per-level best of `runs` passes, keyed by path. */
function bestLevels(krsFile: KrsFile, runs: number): LevelTiming[] {
  const best = new Map<string, LevelTiming>();
  for (let i = 0; i < runs; i++) {
    for (const level of walkLevels(krsFile)) {
      const seen = best.get(level.path);
      if (!seen) {
        best.set(level.path, { ...level });
      } else {
        seen.extractMs = Math.min(seen.extractMs, level.extractMs);
        seen.renderMs = Math.min(seen.renderMs, level.renderMs);
      }
    }
  }
  return [...best.values()];
}

const ms = (value: number): string => `${value.toFixed(1)} ms`;

function table(header: string[], rows: string[][], rightAlignFrom: number): string {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]): string =>
    cells
      .map((cell, i) => (i >= rightAlignFrom ? cell.padStart(widths[i]) : cell.padEnd(widths[i])))
      .join("  ");
  return [line(header), ...rows.map(line)].map((l) => `  ${l}`).join("\n");
}

function main(): void {
  const { file, runs } = parseArgs(process.argv.slice(2));
  const source = readFileSync(file, "utf8");
  const krsFile = Parser.parse(source).value;
  const nodes = countNodes(withUnassignedSystem(krsFile));

  // One untimed pass so the JIT and the module-level caches are warm before
  // any number is taken; best-of-N then reports the steady state.
  buildAllViewsSvg(krsFile);
  compile(source, { diagramType: "system" });

  const allViews = bestOf(runs, () => buildAllViewsSvg(krsFile));
  const system = bestOf(runs, () => compile(source, { diagramType: "system" }));
  const levels = bestLevels(krsFile, runs);
  const total = (l: LevelTiming): number => l.extractMs + l.renderMs;
  const sum = (pick: (l: LevelTiming) => number): number =>
    levels.reduce((acc, l) => acc + pick(l), 0);
  const slowest = [...levels].sort((a, b) => total(b) - total(a)).slice(0, SLOWEST_LEVELS);

  console.log(`bench:render  ${file}  (${source.length} bytes, ${nodes} nodes, best of ${runs})`);
  console.log("");
  console.log(
    table(
      ["entry point", "best"],
      [
        ["buildAllViewsSvg(krsFile)", ms(allViews)],
        ['compile(source, { diagramType: "system" })', ms(system)],
      ],
      1,
    ),
  );
  console.log("");
  console.log(
    `  drill-down levels: ${levels.length}  ` +
      `(extract ${ms(sum((l) => l.extractMs))} + render ${ms(sum((l) => l.renderMs))} ` +
      `= ${ms(sum(total))}, sum of per-level best)`,
  );
  console.log("");
  console.log(`  slowest ${slowest.length} levels`);
  console.log(
    table(
      ["path", "nodes", "edges", "extract", "render", "total"],
      slowest.map((l) => [
        l.path,
        String(l.nodes),
        String(l.edges),
        ms(l.extractMs),
        ms(l.renderMs),
        ms(total(l)),
      ]),
      1,
    ),
  );
}

try {
  main();
} catch (error: unknown) {
  console.error(`bench:render: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
