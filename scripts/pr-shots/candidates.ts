// What `pnpm pr:shots` renders on both sides of a PR (Issue #3359,
// docs/design/pr-before-after-screenshots.md "論点 2"). The candidates come in
// one ordered list, and the order is the point: only the first two pairs that
// changed become images, so the input the agent named outranks the models the
// PR wrote to show its change, which outrank the examples that merely happen
// to move.
//
// No path list decides *whether* to shoot. Every candidate is rendered and the
// SVGs are compared; a list of "render-relevant paths" would be one more set
// that nothing checks when it falls behind (TPL-2446).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, posix, relative, resolve } from "node:path";
import { extractFences } from "../lint/krs-fences.ts";

export type View = "system" | "deploy" | "org";
export const VIEWS: readonly View[] = ["system", "deploy", "org"];

export type Candidate =
  /** A `.krs` named with `--file`: HEAD's file (and its imports) on both sides. */
  | { kind: "file"; name: string; path: string }
  /** A ```krs fence of an acceptance record in the diff: HEAD's text on both sides. */
  | { kind: "fence"; name: string; source: string }
  /** An `examples/` entry: each side renders its own copy of the file. */
  | { kind: "example"; name: string; relPath: string };

const ACCEPTANCE_RECORD_RE = /^docs\/acceptance\/[^/]+\.md$/;

/**
 * A quoted `.krs` path on an import line: `@import "x.krs"`, `import "x.krs"`
 * and `import { X } from "./x.krs"` all reach their file this way.
 */
const KRS_IMPORT_RE = /^\s*@?import\b[^\n"]*"([^"]+\.krs)"/gm;

/**
 * The ```krs fences of the acceptance records in `changedFiles` (repo-relative
 * paths from the branch diff). Only plain `krs` fences claim to be a complete
 * model; `krs fragment` / `krs invalid` are not renderable by definition
 * (TPL-2047). A record the branch deleted is not on disk and yields nothing.
 */
export function fenceCandidates(headRoot: string, changedFiles: readonly string[]): Candidate[] {
  const candidates: Candidate[] = [];
  for (const file of changedFiles.filter((f) => ACCEPTANCE_RECORD_RE.test(f)).sort()) {
    const abs = join(headRoot, file);
    if (!existsSync(abs)) continue;
    for (const fence of extractFences(readFileSync(abs, "utf8"))) {
      if (fence.info !== "krs") continue;
      candidates.push({ kind: "fence", name: `${file}#L${fence.line}`, source: fence.body });
    }
  }
  return candidates;
}

function krsFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return krsFilesUnder(path);
    return entry.name.endsWith(".krs") ? [path] : [];
  });
}

/**
 * The `.krs` files under `examples/` that open a model: those no `.krs` in the
 * same directory imports. A file that is imported is drawn as part of its
 * entry, so shooting it alone would show a model nobody opens. Returned as
 * repo-relative posix paths, sorted.
 */
export function exampleEntries(root: string): string[] {
  const files = krsFilesUnder(join(root, "examples"));
  const imported = new Set<string>();
  for (const file of files) {
    for (const match of readFileSync(file, "utf8").matchAll(KRS_IMPORT_RE)) {
      const target = resolve(dirname(file), match[1]);
      if (dirname(target) === dirname(file)) imported.add(target);
    }
  }
  return files
    .filter((file) => !imported.has(file))
    .map((file) => relative(root, file).split("\\").join(posix.sep))
    .sort();
}

export interface CandidateInputs {
  /** Root of the checkout at HEAD. */
  headRoot: string;
  /** `--file` arguments, relative to `headRoot` or absolute. */
  files: readonly string[];
  /** Repo-relative paths that differ from the merge base (see `changedFiles`). */
  changedFiles: readonly string[];
}

/** Every candidate in the order pairs are picked for images: files, fences, examples. */
export function collectCandidates({ headRoot, files, changedFiles }: CandidateInputs): Candidate[] {
  const named: Candidate[] = files.map((file) => {
    const path = resolve(headRoot, file);
    if (!existsSync(path)) throw new Error(`pr:shots: --file ${file} does not exist`);
    const rel = relative(headRoot, path);
    return { kind: "file", name: rel.startsWith("..") ? basename(path) : rel, path };
  });
  // A model named with --file is not shot a second time as an example.
  const namedPaths = new Set(named.map((c) => (c.kind === "file" ? c.path : "")));
  const examples: Candidate[] = exampleEntries(headRoot)
    .filter((relPath) => !namedPaths.has(resolve(headRoot, relPath)))
    .map((relPath) => ({ kind: "example", name: relPath, relPath }));
  return [...named, ...fenceCandidates(headRoot, changedFiles), ...examples];
}
