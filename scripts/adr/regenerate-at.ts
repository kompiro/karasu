// Runs the index generators (ADR and TPL) on what one commit holds, and reads the
// generated files that commit holds, without touching the working tree (Issue
// #3416; the TPL index joined in Issue #3289).
//
// Both the `Validate` check (scripts/adr/check-generated.ts) and the freshness
// watcher (scripts/adr/check-freshness.ts) compare a commit's generated files
// with a regeneration from some commit's inputs. Working from commits rather
// than the checkout keeps the answer the same in CI (a merge ref is checked
// out), in pre-push (the working tree may hold uncommitted edits) and for a
// commit in main's history.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONFIG_FILES,
  type ConfigTexts,
  type GeneratedPaths,
  type Generator,
  GENERATORS,
  generatedGlobs,
  isGenerated,
  readGeneratedPaths,
  rootGlobs,
} from "./generated.ts";

/** Repo-relative path to file content. */
export type Tree = Map<string, string>;

/** One tree per generator. */
export type GeneratedTrees = Record<Generator, Tree>;

/** The package that provides each generator, as the lockfile names it. */
export const GENERATOR_PACKAGES: Record<Generator, string> = {
  adr: "@kompiro/adr-tools",
  tpl: "@kompiro/tpl-tools",
};

/** The generators' binaries to run. */
export type GeneratorBins = Record<Generator, string>;

/** Every generator's files in one tree. The roots do not overlap. */
export const mergeTrees = (trees: GeneratedTrees): Tree =>
  new Map(GENERATORS.flatMap((g) => [...trees[g]]));

const git = (args: string[]): string =>
  execFileSync("git", args, {
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

export const resolveCommit = (rev: string): string =>
  git(["rev-parse", "--verify", "--quiet", `${rev}^{commit}`]).trim();

export const mergeBase = (a: string, b: string): string => git(["merge-base", a, b]).trim();

/** `git diff --no-renames --name-status -z`: the diff the generated-path rules read. */
export const nameStatus = (a: string, b: string): string =>
  git(["diff", "--no-renames", "--name-status", "-z", a, b]);

const showAt = (rev: string, path: string): string | null => {
  try {
    return git(["show", `${rev}:${path}`]);
  } catch {
    return null;
  }
};

/** Each generator's config at a commit; null for a file that is not there. */
export const configsAt = (rev: string): ConfigTexts => ({
  adr: showAt(rev, CONFIG_FILES.adr),
  tpl: showAt(rev, CONFIG_FILES.tpl),
});

export function generatedPathsAt(rev: string): GeneratedPaths {
  const configs = configsAt(rev);
  if (configs.adr === null) throw new Error(`${rev} has no adr.config.json`);
  return readGeneratedPaths(configs);
}

/** The generated files a commit holds, under the outputs `paths` names. */
export function generatedTreeAt(rev: string, paths: GeneratedPaths): GeneratedTrees {
  const tree = (g: Generator): Tree => {
    const globs = rootGlobs(paths[g]);
    if (globs.length === 0) return new Map();
    const names = git(["ls-tree", "-r", "-z", "--name-only", rev, "--", paths[g].dir])
      .split("\0")
      .filter((p) => p !== "" && isGenerated(p, globs));
    return new Map(names.map((p) => [p, git(["show", `${rev}:${p}`])]));
  };
  return { adr: tree("adr"), tpl: tree("tpl") };
}

/**
 * What one generator reads at a commit, as a comparable key: its directory
 * without the generated files, and its config. Two commits with the same key
 * regenerate the same output (for the same generator).
 */
export function inputKey(rev: string, paths: GeneratedPaths, generator: Generator): string {
  const globs = generatedGlobs(paths);
  return git(["ls-tree", "-r", "-z", rev, "--", paths[generator].dir, CONFIG_FILES[generator]])
    .split("\0")
    .filter((e) => e !== "" && !isGenerated(e.slice(e.indexOf("\t") + 1), globs))
    .join("\n");
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** The version of a generator's package that a commit's lockfile resolves, or null. */
export function generatorVersionAt(rev: string, generator: Generator): string | null {
  const lock = showAt(rev, "pnpm-lock.yaml");
  if (lock === null) return null;
  const pkg = escapeRegExp(GENERATOR_PACKAGES[generator]);
  return new RegExp(`^ {2}'${pkg}@([^'(]+)':`, "m").exec(lock)?.[1] ?? null;
}

function readTree(root: string, prefix: string, into: Tree, dir = ""): void {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = dir === "" ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) readTree(root, prefix, into, rel);
    else into.set(posix.join(prefix, rel), readFileSync(join(root, rel), "utf-8"));
  }
}

/**
 * Runs the generators on a commit's inputs in a temporary directory and returns
 * what they write, keyed by the repo-relative paths the outputs live at. The
 * commit's own generated files are removed first so they cannot feed the
 * result. A generator with no outputs at the commit (the TPL generator before
 * `tpl.config.json` named an `indexFile`) is not run and yields an empty tree.
 * `bins` are the generators to run: the checkout's, so a generator upgrade is
 * judged by the new generator.
 */
export function regenerateAt(rev: string, paths: GeneratedPaths, bins: GeneratorBins): GeneratedTrees {
  const work = mkdtempSync(join(tmpdir(), "adr-regenerate-"));
  try {
    const src = join(work, "src");
    const out = join(work, "out");
    mkdirSync(src);
    mkdirSync(out);
    const runs = GENERATORS.filter((g) => paths[g].outputs.length > 0);
    const archive = execFileSync(
      "git",
      ["archive", "--format=tar", rev, "--", ...runs.flatMap((g) => [CONFIG_FILES[g], paths[g].dir])],
      { maxBuffer: 256 * 1024 * 1024 },
    );
    execFileSync("tar", ["-x", "-C", src], { input: archive });
    for (const g of runs) {
      for (const output of paths[g].outputs) {
        rmSync(join(src, paths[g].dir, output), { recursive: true, force: true });
      }
    }
    const trees: GeneratedTrees = { adr: new Map(), tpl: new Map() };
    if (runs.includes("adr")) {
      execFileSync(bins.adr, ["regenerate", `--out-dir=${out}`], {
        cwd: src,
        stdio: ["ignore", "ignore", "pipe"],
      });
      readTree(out, posix.normalize(paths.adr.dir), trees.adr);
    }
    if (runs.includes("tpl")) {
      // `tpl regenerate` writes into the TPL directory of its working directory.
      execFileSync(bins.tpl, ["regenerate", "--tpl-dir", paths.tpl.dir], {
        cwd: src,
        stdio: ["ignore", "ignore", "pipe"],
      });
      for (const output of paths.tpl.outputs) {
        const rel = posix.normalize(posix.join(paths.tpl.dir, output));
        if (existsSync(join(src, rel))) trees.tpl.set(rel, readFileSync(join(src, rel), "utf-8"));
      }
    }
    return trees;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * How a committed tree differs from a regeneration: files the generator writes
 * that are missing, files it does not write that are present, and files whose
 * content differs. Empty when the trees are identical.
 */
export function compareTrees(regenerated: Tree, committed: Tree): string[] {
  const problems: string[] = [];
  for (const [path, content] of regenerated) {
    if (!committed.has(path)) problems.push(`${path}: missing (the generator writes it)`);
    else if (committed.get(path) !== content) problems.push(`${path}: differs from a regeneration`);
  }
  for (const path of committed.keys()) {
    if (!regenerated.has(path)) problems.push(`${path}: not written by the generator`);
  }
  return problems.sort();
}

/** The generators installed next to this script, in the checkout the check runs from. */
export const checkoutGenerators = (): GeneratorBins => {
  const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "node_modules", ".bin");
  return { adr: join(bin, "adr"), tpl: join(bin, "tpl") };
};
