import * as fs from "node:fs";
import * as path from "node:path";
import { pathKindOrExit } from "./path-arg.js";

/**
 * Directories the file walkers (fmt / tidy-style / lint-style) never
 * descend into, with no arguments or under a directory argument. Includes `.claude` so a no-arg run at the repo
 * root does not touch `.claude/worktrees/` copies of the repo.
 */
export const DEFAULT_SKIP_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".worktrees",
  ".git",
  "dist",
  ".claude",
]);

/**
 * Recursively collect files under `dir` whose name ends with `suffix`,
 * skipping any directory (or file) whose name is in `skip`.
 *
 * Shared by `fmt` / `tidy-style` / `lint-style`.
 */
export function findFilesBySuffix(
  dir: string,
  suffix: string,
  skip: ReadonlySet<string>,
): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFilesBySuffix(full, suffix, skip));
    } else if (entry.isFile() && entry.name.endsWith(suffix)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * The files a walker command (fmt / tidy-style / lint-style) works on.
 *
 * With no arguments, every file under the working directory whose name ends
 * with `suffix`. Each argument that names a directory expands the same way
 * under that directory (#3106), and each one that names a file is taken as it
 * is. An argument that is not there exits(1) with `File not found` instead of
 * the stack trace the read would throw. Returns absolute paths, without
 * duplicates, in argument order; `undefined` means the process has been told
 * to exit, so callers `return` immediately.
 */
export function resolveTargets(files: string[], suffix: string): string[] | undefined {
  if (files.length === 0) {
    return findFilesBySuffix(process.cwd(), suffix, DEFAULT_SKIP_DIRS).sort();
  }
  const out = new Set<string>();
  for (const file of files) {
    const kind = pathKindOrExit(file);
    if (kind === undefined) return undefined;
    if (kind === "missing") {
      process.stderr.write(`Error: File not found: ${file}\n`);
      process.exit(1);
      return undefined;
    }
    const abs = path.resolve(file);
    if (kind === "file") {
      out.add(abs);
      continue;
    }
    for (const found of findFilesBySuffix(abs, suffix, DEFAULT_SKIP_DIRS).sort()) out.add(found);
  }
  return [...out];
}
