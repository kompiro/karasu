// Runs the ADR index generator on what one commit holds, and reads the generated
// files that commit holds, without touching the working tree (Issue #3416).
//
// Both the `Validate` check (scripts/adr/check-generated.ts) and the freshness
// watcher (scripts/adr/check-freshness.ts) compare a commit's generated files
// with a regeneration from some commit's inputs. Working from commits rather
// than the checkout keeps the answer the same in CI (a merge ref is checked
// out), in pre-push (the working tree may hold uncommitted edits) and for a
// commit in main's history.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { type AdrPaths, generatedGlobs, isGenerated, readAdrPaths } from "./generated.ts";

/** Repo-relative path to file content. */
export type Tree = Map<string, string>;

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

/** `adr.config.json` at a commit, or null when it is not there. */
export function configAt(rev: string): string | null {
  try {
    return git(["show", `${rev}:adr.config.json`]);
  } catch {
    return null;
  }
}

export function adrPathsAt(rev: string): AdrPaths {
  const text = configAt(rev);
  if (text === null) throw new Error(`${rev} has no adr.config.json`);
  return readAdrPaths(text);
}

/** The generated files a commit holds, under the outputs `paths` names. */
export function generatedTreeAt(rev: string, paths: AdrPaths): Tree {
  const globs = generatedGlobs(paths);
  const names = git(["ls-tree", "-r", "-z", "--name-only", rev, "--", paths.adrDir])
    .split("\0")
    .filter((p) => p !== "" && isGenerated(p, globs));
  return new Map(names.map((p) => [p, git(["show", `${rev}:${p}`])]));
}

/**
 * What the generator reads at a commit, as a comparable key: the ADR directory
 * without the generated files, and the config. Two commits with the same key
 * regenerate the same output (for the same generator).
 */
export function inputKey(rev: string, paths: AdrPaths): string {
  const globs = generatedGlobs(paths);
  return git(["ls-tree", "-r", "-z", rev, "--", paths.adrDir, "adr.config.json"])
    .split("\0")
    .filter((e) => e !== "" && !isGenerated(e.slice(e.indexOf("\t") + 1), globs))
    .join("\n");
}

/** The `@kompiro/adr-tools` version a commit's lockfile resolves, or null. */
export function generatorVersionAt(rev: string): string | null {
  try {
    const lock = git(["show", `${rev}:pnpm-lock.yaml`]);
    return /^ {2}'@kompiro\/adr-tools@([^'(]+)':/m.exec(lock)?.[1] ?? null;
  } catch {
    return null;
  }
}

function readTree(root: string, prefix: string, into: Tree, dir = ""): void {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = dir === "" ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) readTree(root, prefix, into, rel);
    else into.set(posix.join(prefix, rel), readFileSync(join(root, rel), "utf-8"));
  }
}

/**
 * Runs `adr regenerate` on a commit's inputs in a temporary directory and
 * returns what it writes, keyed by the repo-relative paths the outputs live at.
 * The commit's own generated files are removed first so they cannot feed the
 * result. `adrBin` is the generator to run: the checkout's, so a generator
 * upgrade is judged by the new generator.
 */
export function regenerateAt(rev: string, paths: AdrPaths, adrBin: string): Tree {
  const work = mkdtempSync(join(tmpdir(), "adr-regenerate-"));
  try {
    const src = join(work, "src");
    const out = join(work, "out");
    mkdirSync(src);
    mkdirSync(out);
    const archive = execFileSync(
      "git",
      ["archive", "--format=tar", rev, "--", "adr.config.json", paths.adrDir],
      { maxBuffer: 256 * 1024 * 1024 },
    );
    execFileSync("tar", ["-x", "-C", src], { input: archive });
    for (const output of paths.outputs) {
      rmSync(join(src, paths.adrDir, output), { recursive: true, force: true });
    }
    execFileSync(adrBin, ["regenerate", `--out-dir=${out}`], {
      cwd: src,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const tree: Tree = new Map();
    readTree(out, posix.normalize(paths.adrDir), tree);
    return tree;
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

/** The generator installed next to this script, in the checkout the check runs from. */
export const checkoutGenerator = (): string =>
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "node_modules", ".bin", "adr");
