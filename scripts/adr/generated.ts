// Which paths the index generators own, and what kind of PR a diff over them is
// (Issue #3416, docs/adr/3416-regenerate-adr-index-daily-pr.md "仕組み"; the TPL
// index joined in Issue #3289).
//
// PRs no longer carry the generated indexes. A daily routine opens a PR that
// changes only the generated files, and every other PR leaves them alone. This
// module is the one place that decides which side of that line a diff is on,
// so the `Validate` check, the `Review tier` check and `pnpm adr:regenerate-pr`
// cannot drift apart.
//
// Two generators write there: `adr regenerate` (outputs from `adr.config.json`)
// and `tpl regenerate` (the `indexFile` of `tpl.config.json`, under the TPL
// directory). The generated paths are the union of both.
//
// Dependency-free on purpose: `scripts/review/tier.ts` imports it and runs with
// plain `node` (type stripping), with no `pnpm install`.

import { matchesGlob, posix } from "node:path";

/** Where one generator writes: a directory and its output names relative to it. */
export interface GeneratorRoot {
  dir: string;
  /** Output names, relative to `dir`. A trailing `/` marks a directory. */
  outputs: string[];
}

export const GENERATORS = ["adr", "tpl"] as const;
export type Generator = (typeof GENERATORS)[number];

/** Each generator's root. A generator with no outputs is not run. */
export type GeneratedPaths = Record<Generator, GeneratorRoot>;

/** The text of each generator's config at one commit; null when the file is not there. */
export type ConfigTexts = Record<Generator, string | null>;

export const CONFIG_FILES: Record<Generator, string> = {
  adr: "adr.config.json",
  tpl: "tpl.config.json",
};

/** The TPL directory. tpl-tools takes it as a flag, not from its config. */
export const TPL_DIR = "docs/test-perspectives";

/** Reads `paths.adrDir` and `paths.outputs` from the text of `adr.config.json`. */
export function readAdrPaths(configText: string): GeneratorRoot {
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
  return { dir: adrDir, outputs: names };
}

/**
 * Reads `indexFile` from the text of `tpl.config.json`. Without the file or the
 * key, the TPL generator has no outputs: commits from before the index was
 * generated stay valid inputs.
 */
export function readTplPaths(configText: string | null): GeneratorRoot {
  if (configText === null) return { dir: TPL_DIR, outputs: [] };
  const { indexFile } = JSON.parse(configText) as { indexFile?: unknown };
  if (indexFile === undefined) return { dir: TPL_DIR, outputs: [] };
  if (typeof indexFile !== "string" || indexFile === "") {
    throw new Error("tpl.config.json indexFile is not a path");
  }
  // A file inside the TPL directory, named literally: the generated paths are
  // globs (extglobs included), and a name that escaped the directory or matched
  // other files would make them generated. Only plain segments are allowed.
  const segments = indexFile.split("/");
  if (
    !/^[\w.-]+(?:\/[\w.-]+)*$/.test(indexFile) ||
    segments.includes("..") ||
    segments.at(-1) === "."
  ) {
    throw new Error(
      `tpl.config.json indexFile must be a plain file under ${TPL_DIR}: ${indexFile}`,
    );
  }
  return { dir: TPL_DIR, outputs: [indexFile] };
}

/** Both generators' roots. Throws when `adr.config.json` is missing or unreadable. */
export function readGeneratedPaths(configs: ConfigTexts): GeneratedPaths {
  if (configs.adr === null) throw new Error("adr.config.json is missing");
  return { adr: readAdrPaths(configs.adr), tpl: readTplPaths(configs.tpl) };
}

/**
 * One generator's paths as globs over repo-relative paths: each output joined to
 * the root, and a directory output (`graph/`) turned into its whole subtree
 * (`docs/adr/graph/**`).
 */
export function rootGlobs(root: GeneratorRoot): string[] {
  return root.outputs
    .map((out) => {
      const joined = posix.normalize(posix.join(root.dir, out));
      return out.endsWith("/") ? `${joined.replace(/\/+$/, "")}/**` : joined;
    })
    .sort();
}

/** The generated paths of every generator, as globs. */
export const generatedGlobs = (paths: GeneratedPaths): string[] =>
  GENERATORS.flatMap((g) => rootGlobs(paths[g])).sort();

export const isGenerated = (path: string, globs: readonly string[]): boolean =>
  globs.some((g) => matchesGlob(path, g));

/** Every generator's outputs as repo-relative paths; a directory output keeps its `/`. */
export const outputPaths = (paths: GeneratedPaths): string[] =>
  GENERATORS.flatMap((g) => paths[g].outputs.map((o) => posix.join(paths[g].dir, o)));

/**
 * The changed paths (`git status`, repo-relative) that no generator's outputs
 * cover: what a generator wrote outside them.
 */
export function strayPaths(changed: readonly string[], paths: GeneratedPaths): string[] {
  const outputs = outputPaths(paths);
  return changed.filter((p) => !outputs.some((o) => (o.endsWith("/") ? p.startsWith(o) : p === o)));
}

/** Whether two configs name the same outputs, whatever their order. */
export function sameOutputs(a: GeneratedPaths, b: GeneratedPaths): boolean {
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
  base: GeneratedPaths;
  head: GeneratedPaths;
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
        "the PR writes generated files while the outputs (adr.config.json paths.outputs or " +
          "tpl.config.json indexFile) differ between " +
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
