/**
 * SPIKE (spike/width-budget-ladder, Issue #2761 option 3) — not for merge.
 *
 * One pass over every drill-down level of a model, the way `buildDrillDownSvg`
 * walks them (the walk is lifted from `scripts/bench/render.ts`), returning the
 * rendered SVG of each level so a caller can hash it, measure its canvas, or
 * diff it against another configuration.
 */

import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { Parser } from "../../packages/core/src/parser/parser.ts";
import {
  buildLegendRenderOptions,
  buildStyles,
} from "../../packages/core/src/renderer/all-layers-svg.ts";
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
import { analyze } from "../../packages/core/src/resolver/warnings.ts";
import type { KrsFile } from "../../packages/core/src/types/ast.ts";
import type { KrsNode } from "../../packages/core/src/types/ast.ts";
import { withUnassignedSystem } from "../../packages/core/src/view/unassigned-system.ts";
import { createViewExtractor, type ViewSlice } from "../../packages/core/src/view/view-extract.ts";

export interface LevelRender {
  path: string;
  nodes: number;
  edges: number;
  svg: string;
  renderMs: number;
}

/**
 * Parse **and run the resolver's warning pass**, because `analyze()` mutates
 * the AST — it sets `cyclic` on the edges of every sync cycle — and every
 * shipped entry point (`compile()`, `buildAllViewsSvg`) runs it before
 * rendering. A walk over a freshly parsed model renders cyclic edges as
 * ordinary ones and lays them out differently; doing it here keeps the harness
 * on the same output the CLI produces, and keeps repeat walks in one process
 * identical to the first.
 */
export function parseModel(file: string): KrsFile {
  const krsFile = Parser.parse(readFileSync(file, "utf8")).value;
  analyze(krsFile, buildStyles(undefined).sheets);
  return krsFile;
}

export function sha1(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

/** Canvas width/height as the renderer declares them on the root `<svg>`. */
export function svgCanvas(svg: string): { width: number; height: number } {
  const w = /<svg[^>]*\swidth="([\d.]+)"/.exec(svg);
  const h = /<svg[^>]*\sheight="([\d.]+)"/.exec(svg);
  return { width: w ? Number(w[1]) : 0, height: h ? Number(h[1]) : 0 };
}

/**
 * Walk every drill-down level and render it. `onLevel` runs immediately after
 * each level renders, which is where an instrumented build reads the counters
 * that level accumulated.
 */
export function walkLevels(krsFile: KrsFile, onLevel?: (level: LevelRender) => void): LevelRender[] {
  const systems = withUnassignedSystem(krsFile);
  const extractSlice = createViewExtractor(systems);
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
  const extract = (path: string[]): ViewSlice =>
    styleDerivedEdges(extractSlice(path), styles, sheets);

  const levels: LevelRender[] = [];
  const walk = (path: string[]): void => {
    const slice = extract(path);
    if (!hasContent(slice)) return;

    const drillable: KrsNode[] = [];
    for (const child of childrenOf(slice)) {
      if (child.children.length === 0) continue;
      if (hasContent(extract([...path, child.id]))) drillable.push(child);
    }
    const links = new Map(drillable.map((c) => [c.id, anchorId("system", c.id)]));
    const started = performance.now();
    const svg = render(slice, styles, undefined, ownerIndex, undefined, links, {
      ...legendOptions,
      viewScope: legendScopeForLogicalSlice(slice),
      boundaryMembership: krsFile.boundaryMembership,
      scopedBoundaryMembership: krsFile.scopedBoundaryMembership,
      declaredGroupOrder,
      groupLabels,
      teamLabels,
    });
    const renderMs = performance.now() - started;
    const level: LevelRender = {
      path: path.length === 0 ? "(root)" : path.join("."),
      nodes: slice.childNodes.length,
      edges: slice.childEdges.length,
      svg,
      renderMs,
    };
    levels.push(level);
    onLevel?.(level);
    for (const child of drillable) walk([...path, child.id]);
  };
  walk([]);
  return levels;
}
