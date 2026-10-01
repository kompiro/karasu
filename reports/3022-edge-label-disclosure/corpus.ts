// What the spike's levers would do to the models already in the repository:
// how long authored edge labels are, and how many example root views change.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { compile } from "../../packages/core/src/index.ts";
import { measureSvg } from "./measure.ts";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith(".krs")) out.push(path);
  }
  return out;
}

export interface CorpusStats {
  files: number;
  labels: number;
  over24: number;
  over32: number;
  over40: number;
  longest: number;
  rendered: number;
  skipped: number;
  /** Root views whose SVG differs from today's output, per lever. */
  changedByTruncation40: number;
  changedByAuto: number;
  changedByBoth: number;
  /** Labels the auto lever withholds across all rendered root views, out of those drawn today. */
  labelsToday: number;
  labelsWithheldByAuto: number;
  /** Collisions on those root views today (node + label + real line), and under auto. */
  collisionsToday: number;
  collisionsAuto: number;
}

const style = (max: string, display: string) => `edge { label-max-chars: ${max}; label-display: ${display}; }`;

export function corpusStats(root: string): CorpusStats {
  const files = walk(root).sort();
  const lengths: number[] = [];
  const stats: CorpusStats = {
    files: files.length, labels: 0, over24: 0, over32: 0, over40: 0, longest: 0,
    rendered: 0, skipped: 0, changedByTruncation40: 0, changedByAuto: 0, changedByBoth: 0,
    labelsToday: 0, labelsWithheldByAuto: 0, collisionsToday: 0, collisionsAuto: 0,
  };
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    // Shorthand labels: `A -> B "label"`, `-> B "label"`, with optional tags / id.
    for (const m of source.matchAll(/-{1,2}>\s*[\w.]+(?:\s*\[[^\]]*\])?(?:\s*#[\w-]+)?\s*"((?:[^"\\]|\\.)*)"/g)) {
      lengths.push([...m[1]].length);
    }
    const render = (styleSource: string): string | undefined => {
      try {
        const r = compile(source, { diagramType: "system", styleSource });
        return r.diagnostics.some((d) => d.severity === "error") ? undefined : r.svg;
      } catch {
        return undefined;
      }
    };
    const today = render(style("none", "always"));
    if (today === undefined || !today.includes("data-edge-from")) {
      stats.skipped++;
      continue;
    }
    stats.rendered++;
    const auto = render(style("none", "auto"))!;
    if (render(style("40", "always")) !== today) stats.changedByTruncation40++;
    if (auto !== today) stats.changedByAuto++;
    if (render(style("40", "auto")) !== today) stats.changedByBoth++;
    const a = measureSvg(today);
    const b = measureSvg(auto);
    stats.labelsToday += a.labelsDrawn;
    stats.labelsWithheldByAuto += a.labelsDrawn - b.labelsDrawn;
    stats.collisionsToday += a.labelNodePenetrations + a.labelLabelOverlaps + a.labelLinePenetrations;
    stats.collisionsAuto += b.labelNodePenetrations + b.labelLabelOverlaps + b.labelLinePenetrations;
    void relative;
  }
  stats.labels = lengths.length;
  stats.over24 = lengths.filter((n) => n > 24).length;
  stats.over32 = lengths.filter((n) => n > 32).length;
  stats.over40 = lengths.filter((n) => n > 40).length;
  stats.longest = Math.max(0, ...lengths);
  return stats;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.table(corpusStats(new URL("../../examples", import.meta.url).pathname));
}
