// What `Render equivalence` renders on both sides (Issue #3509, #3505 slice B):
// every example and every acceptance-test fence, not only the ones the PR
// touched (TPL-1725, TPL-2446). The comparison is about the code, so both sides
// read the same text: the union of the two checkouts' `examples/` and
// acceptance records, with HEAD's copy of a file where it has one and the
// merge base's where HEAD deleted it. A refactor that edits an example then
// does not fail for the edit, and one that deletes an example still has that
// example compared.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { extractFences } from "../lint/krs-fences.ts";
import { exampleEntries } from "../pr-shots/candidates.ts";

/** One model to render: an example entry compiled from disk, or a fence's text. */
export type Entry =
  | { kind: "example"; name: string; path: string }
  | { kind: "fence"; name: string; source: string };

/** A source whose formatter (`.krs`) or Tidy (`.krs.style`) output is compared. */
export interface Source {
  name: string;
  source: string;
}

/** What each side's child process reads. Written once, so both sides see the same file. */
export interface Manifest {
  entries: Entry[];
  krs: Source[];
  styles: Source[];
}

const ACCEPTANCE_DIR = "docs/acceptance";

function filesUnder(root: string, dir: string): string[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const rel = posix.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(root, rel);
    return entry.isFile() ? [rel] : [];
  });
}

/**
 * Copies `examples/**` and the acceptance records of both checkouts into
 * `into`, HEAD's copy winning. Returns the repo-relative paths copied, sorted.
 */
export function mergeInputs(baseRoot: string, headRoot: string, into: string): string[] {
  const files = new Map<string, string>();
  for (const root of [baseRoot, headRoot]) {
    const records = filesUnder(root, ACCEPTANCE_DIR).filter(
      (f) => posix.dirname(f) === ACCEPTANCE_DIR && f.endsWith(".md"),
    );
    for (const file of [...filesUnder(root, "examples"), ...records]) {
      files.set(file, join(root, file));
    }
  }
  for (const [rel, from] of files) {
    const to = join(into, rel);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
  }
  return [...files.keys()].sort();
}

/**
 * The manifest for the merged inputs under `root`: example entries and plain
 * ```krs fences to render, every `.krs` (files and fences) to format, and every
 * `.krs.style` (files and ```krs.style fences) to tidy. `krs fragment` /
 * `krs invalid` fences are not complete models by definition (TPL-2047).
 */
export function buildManifest(root: string, files: readonly string[]): Manifest {
  const entries: Entry[] = exampleEntries(root).map((relPath) => ({
    kind: "example",
    name: relPath,
    path: join(root, relPath),
  }));
  const krs: Source[] = [];
  const styles: Source[] = [];
  for (const file of files) {
    if (file.startsWith(`${ACCEPTANCE_DIR}/`)) {
      for (const fence of extractFences(readFileSync(join(root, file), "utf8"))) {
        const name = `${file}#L${fence.line}`;
        if (fence.info === "krs") {
          entries.push({ kind: "fence", name, source: fence.body });
          krs.push({ name, source: fence.body });
        } else if (fence.info === "krs.style") {
          styles.push({ name, source: fence.body });
        }
      }
    } else if (file.endsWith(".krs.style")) {
      styles.push({ name: file, source: readFileSync(join(root, file), "utf8") });
    } else if (file.endsWith(".krs")) {
      krs.push({ name: file, source: readFileSync(join(root, file), "utf8") });
    }
  }
  return { entries, krs, styles };
}
