import { statSync } from "node:fs";
import { resolve } from "node:path";

/** What a path the user typed names on disk. */
export type PathKind = "file" | "directory" | "missing";

/**
 * What `path` names on disk. Only `ENOENT` / `ENOTDIR` mean it is not there: a
 * path that exists but cannot be stat'ed (`EACCES`, `ELOOP`, ...) is reported
 * with the system's reason on one line and exits(1), returning `undefined`.
 * Folding those into "missing" would print a false "File not found" (#2942,
 * TPL-2942).
 */
export function pathKindOrExit(path: string): PathKind | undefined {
  try {
    return statSync(resolve(path)).isDirectory() ? "directory" : "file";
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return "missing";
    process.stderr.write(`Error: cannot read ${path}: ${code ?? String(e)}\n`);
    process.exit(1);
    return undefined;
  }
}

/**
 * Check a path a command reads or edits as one file (`remove` / `insert` /
 * `apply` / `append` edit it in place, `translate` reads a source file). A
 * directory is not such a file and exits(1) with a message that says so, rather
 * than the raw `EISDIR` the read would throw (#3106). `noun` names what to pass
 * instead (".krs file", "file").
 *
 * Returns whether the file is there, so each command keeps its own answer to a
 * missing one (`remove` refuses, `append` creates it). `undefined` means the
 * process has been told to exit; callers `return` immediately, which mirrors
 * real termination when `process.exit` is mocked in tests.
 */
export function fileArgumentOrExit(path: string, noun: string): "file" | "missing" | undefined {
  const kind = pathKindOrExit(path);
  if (kind !== "directory") return kind;
  process.stderr.write(`Error: ${path} is a directory; pass a ${noun}\n`);
  process.exit(1);
  return undefined;
}
