// Which paths `adr regenerate` owns, and what kind of PR a diff over them is
// (Issue #3416, docs/adr/3416-regenerate-adr-index-daily-pr.md "仕組み").
//
// PRs no longer carry the generated ADR index. A daily routine opens a PR that
// changes only the generated files, and every other PR leaves them alone. This
// module is the one place that decides which side of that line a diff is on,
// so the `Validate` check, the `Review tier` check and `pnpm adr:regenerate-pr`
// cannot drift apart.
//
// Dependency-free on purpose: `scripts/review/tier.ts` imports it and runs with
// plain `node` (type stripping), with no `pnpm install`.

import { matchesGlob, posix } from "node:path";

/** The `paths` block of `adr.config.json` this module reads. */
export interface AdrPaths {
  adrDir: string;
  /** The generator's output names, relative to `adrDir`. A trailing `/` marks a directory. */
  outputs: string[];
}

/** Reads `paths.adrDir` and `paths.outputs` from the text of `adr.config.json`. */
export function readAdrPaths(configText: string): AdrPaths {
  const config = JSON.parse(configText) as {
    paths?: { adrDir?: unknown; outputs?: Record<string, unknown> };
  };
  const adrDir = config.paths?.adrDir;
  const outputs = config.paths?.outputs;
  if (typeof adrDir !== "string" || adrDir === "") {
    throw new Error("adr.config.json has no paths.adrDir");
  }
  if (outputs === undefined || outputs === null || typeof outputs !== "object") {
    throw new Error("adr.config.json has no paths.outputs");
  }
  const names = Object.values(outputs);
  if (!names.every((n): n is string => typeof n === "string" && n !== "")) {
    throw new Error("adr.config.json paths.outputs has a value that is not a path");
  }
  return { adrDir, outputs: names };
}

/**
 * The generated paths as globs over repo-relative paths: each output joined to
 * `adrDir`, and a directory output (`graph/`) turned into its whole subtree
 * (`docs/adr/graph/**`).
 */
export function generatedGlobs(paths: AdrPaths): string[] {
  return paths.outputs
    .map((out) => {
      const joined = posix.normalize(posix.join(paths.adrDir, out));
      return out.endsWith("/") ? `${joined.replace(/\/+$/, "")}/**` : joined;
    })
    .sort();
}

export const isGenerated = (path: string, globs: readonly string[]): boolean =>
  globs.some((g) => matchesGlob(path, g));

/** Whether two configs name the same outputs, whatever their order. */
export function sameOutputs(a: AdrPaths, b: AdrPaths): boolean {
  const ga = generatedGlobs(a);
  const gb = generatedGlobs(b);
  return ga.length === gb.length && ga.every((g, i) => g === gb[i]);
}

export interface NameStatus {
  /** `A`, `M`, `D` or `T` (renames and copies are off: `--no-renames`). */
  status: string;
  path: string;
}

/**
 * Parses `git diff --no-renames --name-status -z`. NUL-separated so a path with
 * a tab, a newline or a quote reads as itself.
 */
export function parseNameStatus(output: string): NameStatus[] {
  const fields = output.split("\0");
  if (fields.at(-1) === "") fields.pop();
  const entries: NameStatus[] = [];
  for (let i = 0; i < fields.length; i += 2) {
    const status = fields[i];
    const path = fields[i + 1];
    if (path === undefined) throw new Error(`git diff --name-status: no path after "${status}"`);
    if (/^[RC]/.test(status)) {
      throw new Error(`git diff --name-status: got a rename or copy (${status}); use --no-renames`);
    }
    entries.push({ status, path });
  }
  return entries;
}

type DiffKind = "regular" | "regeneration" | "mixed";

export interface DiffVerdict {
  kind: DiffKind;
  /** Why the diff is `mixed`, one line per cause. Empty for the other kinds. */
  reasons: string[];
  /** The generated paths the diff changes. */
  generated: string[];
}

/**
 * Sorts a PR's diff into the two kinds `Validate` lets through, or `mixed`.
 *
 * - `regular`: changes no generated path, except deleting an output the head's
 *   config no longer names (a PR that moves an output removes the old one).
 * - `regeneration`: changes only generated paths, and the base and head name the
 *   same outputs. Whether the head's tree is exactly a regeneration is checked
 *   separately, by running the generator.
 *
 * Generated paths are the union of both sides' outputs, so a PR cannot hide a
 * write to an output by renaming it in the same change.
 */
export function classifyGeneratedDiff(input: {
  base: AdrPaths;
  head: AdrPaths;
  files: readonly NameStatus[];
}): DiffVerdict {
  const baseGlobs = generatedGlobs(input.base);
  const headGlobs = generatedGlobs(input.head);
  const all = [...baseGlobs, ...headGlobs];
  const generated = input.files.filter((f) => isGenerated(f.path, all));
  const other = input.files.filter((f) => !isGenerated(f.path, all));
  const generatedPaths = generated.map((f) => f.path);

  // A deleted file that only the base's config names: the old output going away.
  const isStaleDeletion = (f: NameStatus): boolean =>
    f.status === "D" && isGenerated(f.path, baseGlobs) && !isGenerated(f.path, headGlobs);
  const written = generated.filter((f) => !isStaleDeletion(f));

  if (written.length === 0) return { kind: "regular", reasons: [], generated: generatedPaths };

  if (other.length === 0) {
    if (sameOutputs(input.base, input.head)) {
      return { kind: "regeneration", reasons: [], generated: generatedPaths };
    }
    return {
      kind: "mixed",
      reasons: [
        "the PR writes generated files while adr.config.json paths.outputs differs between " +
          "base and head; change the outputs in one PR and let the next regeneration PR write them",
      ],
      generated: generatedPaths,
    };
  }

  return {
    kind: "mixed",
    reasons: [
      `the PR changes generated files (${written.map((f) => f.path).join(", ")}) together with ` +
        `other files (${other.map((f) => f.path).join(", ")}). Generated files are written only ` +
        "by the daily regeneration PR (pnpm adr:regenerate-pr); drop them from this PR",
    ],
    generated: generatedPaths,
  };
}
