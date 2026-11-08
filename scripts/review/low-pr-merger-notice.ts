// What the Low PR merger tells a PR it did not merge (Issue #3673, slice B).
//
// The notify job reads the judge's verdicts from a step output and comments on
// the rejected PRs and the PRs that stalled. The comment is built from the
// reason codes only, with fixed text, never with text a PR wrote (TPL-3673):
// a PR controls its body, title and branch name, and a comment written by the
// workflow's token must not repeat them. Each comment carries a marker for its
// head and reasons, so the same verdict on the same head is said once.

import type { VerdictOutput } from "./low-pr-merger-flow.ts";

/** Reasons a comment can name: the rejections, and a wait that stalled. */
const TEXT: Readonly<Record<string, string>> = {
  labels:
    "It carries a tier label besides `risk: low`. Leave exactly one `risk:` label " +
    "(the one the change calls for).",
  tier:
    "`tier.ts check` does not pass on this head: the change is not Low, the local review record " +
    "does not cover the head, or a test rule fails. The `Review tier` check names the rule.",
  "checks-failed": "A required check failed on this head.",
  conflict: "It conflicts with `main`. Merge `main` into the branch.",
  stalled:
    "It has waited 30 minutes on this head for the checks to settle: a required check is still " +
    "running, or its latest run was skipped or cancelled. Re-run that check, or push.",
};

/** Marks a merger comment; only comments from the workflow's own bot are read back. */
const MARKER = /<!-- low-pr-merger head=([0-9a-f]{40}) reasons=([a-z,-]+) -->/;

export const BOT_LOGIN = "github-actions[bot]";

const isSha = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{40}$/.test(s);

const OUTCOMES = ["out-of-scope", "merge", "wait", "reject", "no-conclusion"];
const REASONS = [
  "labels",
  "tier",
  "checks-failed",
  "conflict",
  "checks-pending",
  "checks-stuck",
  "mergeable-unknown",
  "head-moved",
];

/**
 * The judge's verdicts, as the notify and merge steps read them back from a step
 * output. Throws on anything but the shape the judge writes, so a malformed
 * output stops the run instead of being half-read (TPL-2786).
 */
export function parseVerdicts(json: string): VerdictOutput[] {
  const value: unknown = JSON.parse(json);
  if (!Array.isArray(value)) throw new Error("verdicts: not an array");
  for (const v of value as Record<string, unknown>[]) {
    if (!Number.isSafeInteger(v.pr) || (v.pr as number) <= 0) {
      throw new Error(`verdicts: bad PR number ${JSON.stringify(v.pr)}`);
    }
    if (!isSha(v.sha)) throw new Error(`verdicts: #${v.pr}: bad head ${JSON.stringify(v.sha)}`);
    if (!OUTCOMES.includes(v.outcome as string)) {
      throw new Error(`verdicts: #${v.pr}: bad outcome ${JSON.stringify(v.outcome)}`);
    }
    const reasons = v.reasons ?? [];
    if (!Array.isArray(reasons) || !reasons.every((r) => REASONS.includes(r as string))) {
      throw new Error(`verdicts: #${v.pr}: bad reasons ${JSON.stringify(v.reasons)}`);
    }
    if (v.stalled !== undefined && typeof v.stalled !== "boolean") {
      throw new Error(`verdicts: #${v.pr}: bad stalled ${JSON.stringify(v.stalled)}`);
    }
  }
  return value as VerdictOutput[];
}

/** The reasons a verdict comments on, or none when it says nothing to the PR. */
function reasonsOf(v: VerdictOutput): string[] {
  if (v.outcome === "reject") return [...(v.reasons ?? [])].sort();
  if (v.outcome === "wait" && v.stalled === true) return ["stalled"];
  return [];
}

/** Whether the notify job has anything to say about a verdict, before reading what it already said. */
export const wantsNotice = (v: VerdictOutput): boolean => reasonsOf(v).length > 0;

export interface Notice {
  pr: number;
  body: string;
}

/**
 * The comment for a verdict, or null when there is nothing to say or `posted`
 * (the bodies of the bot's earlier comments on the PR) already said it.
 */
export function noticeFor(v: VerdictOutput, posted: readonly string[]): Notice | null {
  const reasons = reasonsOf(v);
  if (reasons.length === 0) return null;
  const marker = `<!-- low-pr-merger head=${v.sha} reasons=${reasons.join(",")} -->`;
  const said = posted.some((body) => {
    const m = MARKER.exec(body);
    return m !== null && m[0] === marker;
  });
  if (said) return null;
  const lines = reasons.map((r) => `- ${TEXT[r] ?? `\`${r}\``}`);
  const opener =
    v.outcome === "reject"
      ? `The Low PR merger will not merge this PR at \`${v.sha.slice(0, 7)}\`:`
      : `The Low PR merger is still waiting on this PR at \`${v.sha.slice(0, 7)}\`:`;
  const body = [
    marker,
    opener,
    "",
    ...lines,
    "",
    "It merges a `risk: low` PR once the conditions of #3673 hold on its head, and judges again " +
      "after each push. To stop it, remove the label or return the PR to draft.",
  ].join("\n");
  return { pr: v.pr, body };
}
