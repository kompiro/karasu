/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
// The `Validate` check on the generated indexes, ADR and TPL (Issue #3416,
// docs/adr/3416-regenerate-adr-index-daily-pr.md "仕組み"; the TPL index joined
// in Issue #3289).
//
// PRs no longer carry the generated files; the daily regeneration PR does.
// This lets through exactly two kinds of PR:
//
// - a regular PR, which changes no generated path (except deleting an output
//   the head's config no longer names);
// - a regeneration PR, which changes only generated paths, keeps the outputs,
//   and whose generated tree at its head is exactly what the generator writes
//   from the head's inputs: no file missing, extra or different.
//
// Anything else fails. Either way the generator must run, so a generator
// upgrade (a `package.json` / lockfile PR) that breaks it fails here.
//
// The diff is `--no-renames` from the merge base to the head, and the
// regeneration reads the head commit's inputs, not the merge ref's: ADRs merged
// to main after the PR was made must not make it fail. The generator is the one
// installed in the checkout (in CI, the merge ref's), so a generator upgrade
// already on main judges the PR. Both generators run on every PR.
//
//   check-generated.ts --base <rev> [--head <rev>]
//
// On a push to main, `--base HEAD` makes the diff empty and only runs the
// generator: main's index is allowed to lag until the next regeneration PR.

import {
  type ConfigTexts,
  type GeneratedPaths,
  classifyGeneratedDiff,
  parseNameStatus,
  readGeneratedPaths,
} from "./generated.ts";
import {
  type Tree,
  checkoutGenerators,
  compareTrees,
  configsAt,
  generatedTreeAt,
  mergeBase,
  mergeTrees,
  nameStatus,
  regenerateAt,
  resolveCommit,
} from "./regenerate-at.ts";

export interface CheckInput {
  baseConfigs: ConfigTexts;
  headConfigs: ConfigTexts;
  /** `git diff --no-renames --name-status -z <merge-base> <head>`. */
  nameStatus: string;
  /** The generators' output from the head's inputs, or why they could not run. */
  regenerate: () => Tree;
  /** The generated files the head commit holds. */
  committed: () => Tree;
}

export function checkGenerated(input: CheckInput): { kind: string; errors: string[] } {
  if (input.baseConfigs.adr === null || input.headConfigs.adr === null) {
    return {
      kind: "unknown",
      errors: ["adr.config.json is missing at the merge base or the head"],
    };
  }
  let base: GeneratedPaths;
  let head: GeneratedPaths;
  try {
    base = readGeneratedPaths(input.baseConfigs);
    head = readGeneratedPaths(input.headConfigs);
  } catch (e) {
    return {
      kind: "unknown",
      errors: [`reading the generators' configs failed: ${(e as Error).message}`],
    };
  }
  const verdict = classifyGeneratedDiff({ base, head, files: parseNameStatus(input.nameStatus) });

  let regenerated: Tree;
  try {
    regenerated = input.regenerate();
  } catch (e) {
    // An empty stderr (the generator died silently) falls back to the error message.
    const stderr = String((e as { stderr?: unknown }).stderr ?? "").trim();
    const detail = stderr || String((e as Error).message ?? e).trim();
    return {
      kind: verdict.kind,
      errors: [...verdict.reasons, `regenerating the head's inputs failed: ${detail}`],
    };
  }

  if (verdict.kind === "mixed") return { kind: verdict.kind, errors: verdict.reasons };
  if (verdict.kind === "regular") return { kind: verdict.kind, errors: [] };
  const problems = compareTrees(regenerated, input.committed());
  return {
    kind: verdict.kind,
    errors: problems.map(
      (p) =>
        `${p}. A regeneration PR must hold exactly the generator's output; ` +
        "rerun pnpm adr:regenerate-pr instead of editing generated files",
    ),
  };
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function main(argv: string[]): number {
  const baseArg = flag(argv, "--base");
  if (baseArg === undefined) {
    console.error("usage: check-generated.ts --base <rev> [--head <rev>]");
    return 2;
  }
  const head = resolveCommit(flag(argv, "--head") ?? "HEAD");
  const base = mergeBase(resolveCommit(baseArg), head);
  const headConfigs = configsAt(head);
  const result = checkGenerated({
    baseConfigs: configsAt(base),
    headConfigs,
    nameStatus: nameStatus(base, head),
    regenerate: () =>
      mergeTrees(regenerateAt(head, readGeneratedPaths(headConfigs), checkoutGenerators())),
    committed: () => mergeTrees(generatedTreeAt(head, readGeneratedPaths(headConfigs))),
  });
  const annotate = process.env.GITHUB_ACTIONS === "true" ? "::error::" : "";
  for (const e of result.errors) console.error(`${annotate}${e}`);
  if (result.errors.length === 0) {
    console.log(
      result.kind === "regeneration"
        ? "Generated indexes (ADR, TPL): an exact regeneration of the head."
        : "Generated indexes (ADR, TPL): untouched by this change; the generators run.",
    );
  }
  return result.errors.length > 0 ? 1 : 0;
}

if (process.argv[1]?.endsWith("check-generated.ts")) {
  process.exitCode = main(process.argv.slice(2));
}
