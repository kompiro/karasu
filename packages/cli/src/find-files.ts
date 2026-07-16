import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Recursively collect files under `dir` whose name ends with `suffix`,
 * skipping any directory (or file) whose name is in `skip`.
 *
 * Shared by `fmt` / `tidy-style` / `lint-style`; each command passes its
 * own suffix and SKIP set so behavior stays identical per command.
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
 * Resolve explicit CLI file arguments to absolute paths; when none are
 * given, fall back to `defaultFinder` and sort the result.
 */
export function resolveTargets(files: string[], defaultFinder: () => string[]): string[] {
  if (files.length > 0) {
    return files.map((f) => path.resolve(f));
  }
  return defaultFinder().sort();
}
