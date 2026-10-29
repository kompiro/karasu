// Base vs HEAD for every candidate and view, and the PR body section that
// reports it (Issue #3359). Pure apart from the sides it is handed, so the
// rules below are tested with fake renderers.
//
// A pair counts as changed when HEAD draws something the base did not:
// different SVG text, or an SVG where the base failed (a fence in syntax the
// base cannot read). Rendering is deterministic (checked by
// render-side.test.ts), so equal text means an unchanged picture.

import type { Candidate, View } from "./candidates.ts";
import type { Rendered, Side } from "./render-side.ts";

/** How many changed pairs become images; the rest are listed by name. */
export const IMAGE_LIMIT = 2;

/**
 * Opens the line the section carries when nothing changed. The reminder hook
 * (reminder.sh) reads it as "the section is filled", so keep the two in step.
 */
export const NO_CHANGE_MARKER = "No rendering change";

export const SECTION_HEADING = "## Before / after";

interface Pair {
  candidate: Candidate;
  view: View;
  before: Rendered;
  after: Extract<Rendered, { ok: true }>;
}

interface HeadFailure {
  candidate: Candidate;
  view: View;
  reason: string;
}

export interface Comparison {
  /** In candidate order, then view order. */
  changed: Pair[];
  /** Pairs the base drew and HEAD could not: likely a regression. */
  headFailures: HeadFailure[];
  counts: { files: number; fences: number; examples: number };
}

export async function compareSides(
  candidates: readonly Candidate[],
  views: readonly View[],
  base: Side,
  head: Side,
): Promise<Comparison> {
  const changed: Pair[] = [];
  const headFailures: HeadFailure[] = [];
  for (const candidate of candidates) {
    for (const view of views) {
      const after = await head.render(candidate, view);
      const before = await base.render(candidate, view);
      if (!after.ok) {
        if (before.ok) headFailures.push({ candidate, view, reason: after.reason });
        continue;
      }
      if (before.ok ? before.svg === after.svg : after.empty) continue;
      if (before.ok && before.empty && after.empty) continue;
      changed.push({ candidate, view, before, after });
    }
  }
  const count = (kind: Candidate["kind"]) => candidates.filter((c) => c.kind === kind).length;
  return {
    changed,
    headFailures,
    counts: { files: count("file"), fences: count("fence"), examples: count("example") },
  };
}

/** `<candidate> — <view> view`, as the body and the console name a pair. */
export function pairLabel(pair: { candidate: Candidate; view: View }): string {
  return `${pair.candidate.name} — ${pair.view} view`;
}

/** File-name stem for a pair's PNGs: the label with every unsafe run made a `-`. */
export function pairStem(pair: { candidate: Candidate; view: View }): string {
  const name = pair.candidate.name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${name}.${pair.view}`;
}

export interface Shot {
  pair: Pair;
  /** Path as the PR body references it (`./reports/…`); absent when the base failed. */
  before?: string;
  after: string;
}

export interface BodyOptions {
  baseSha: string;
  headSha: string;
}

function countsLine(counts: Comparison["counts"]): string {
  const parts = [
    `${counts.fences} acceptance-test fence${counts.fences === 1 ? "" : "s"}`,
    `${counts.examples} example file${counts.examples === 1 ? "" : "s"}`,
  ];
  if (counts.files > 0) parts.push(`${counts.files} named file${counts.files === 1 ? "" : "s"}`);
  return parts.join(", ");
}

/**
 * The `## Before / after` section for the PR body, referencing the PNGs by
 * the relative path `gh pr edit --attach` rewrites to the uploaded URL.
 */
export function renderBody(comparison: Comparison, shots: readonly Shot[], opts: BodyOptions) {
  const lines = [SECTION_HEADING, ""];
  const short = (sha: string) => sha.slice(0, 7);
  if (comparison.changed.length === 0) {
    lines.push(`${NO_CHANGE_MARKER} (${countsLine(comparison.counts)})`);
  } else {
    lines.push(
      `Rendered with \`pnpm pr:shots\` at the merge base (\`${short(opts.baseSha)}\`) and on this ` +
        `branch (\`${short(opts.headSha)}\`): light theme, the root of each view. ` +
        `Checked ${countsLine(comparison.counts)}.`,
    );
    for (const shot of shots) {
      const label = pairLabel(shot.pair);
      const before =
        shot.before === undefined
          ? `_Could not be rendered at the base: ${shot.pair.before.ok ? "" : shot.pair.before.reason}_`
          : `![before: ${label}](${shot.before})`;
      lines.push("", `### ${label}`, "", "| Before | After |", "| --- | --- |");
      lines.push(`| ${before} | ![after: ${label}](${shot.after}) |`);
    }
    const rest = comparison.changed.slice(shots.length);
    if (rest.length > 0) {
      lines.push("", "Also changed (not shown):", "");
      for (const pair of rest) lines.push(`- ${pairLabel(pair)}`);
    }
  }
  if (comparison.headFailures.length > 0) {
    lines.push("", "Rendered at the base but failed at HEAD:", "");
    for (const failure of comparison.headFailures) {
      lines.push(`- ${pairLabel(failure)}: ${failure.reason}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
