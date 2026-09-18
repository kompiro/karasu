import { realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  compileProject,
  ImportResolver,
  type Diagnostic,
  type KrsFile,
  type SystemCompileResult,
} from "@karasu-tools/core";
import { formatDiagnostic } from "./i18n.js";
import { NodeFileSystemProvider } from "./node-fs.js";

/**
 * A formatter for diagnostic source locations in CLI stderr output, for one
 * report against the entry `filePath`: `<file>:<line>:<column>` when the
 * diagnostic carries a `loc`, otherwise just `filePath`. Shared by every command
 * that prints `Diagnostic[]` to stderr (matrix / coverage / subtree via
 * {@link compileSystemViewOrExit}, and render directly).
 *
 * `<file>` is the document the position indexes into (#2715). A project spans
 * files, and a diagnostic from an imported file, or one decided on the merged
 * model, anchors on whichever file declared the construct. So:
 *
 * - no `loc.file`, or a `loc.file` that is the entry: the entry, spelled the
 *   way the user typed it (`./index.krs` stays `./index.krs`)
 * - any other file: its path relative to the working directory
 *
 * "Is the entry" is decided on canonical paths, not on the strings: `loc.file`
 * is absolute while the user's spelling may be relative or reach the file
 * through a symlink, and a raw comparison would prefix the entry's own
 * diagnostics with a second spelling of the same file.
 *
 * Core positions are already 1-based (`packages/lsp/src/lsp-position.ts`), so
 * they print as they are. Adding 1 here once made a 4-line file report line 5.
 *
 * The entry's canonical path is resolved once per formatter, and each other
 * file's once, rather than twice per diagnostic. Create one per printed list;
 * the cache lives only as long as that report, so a later run never reads a
 * stale answer.
 */
export function diagLocFormatter(filePath: string): (d: Diagnostic) => string {
  const canonical = new Map<string, string>();
  const canonicalOf = (path: string): string => {
    let hit = canonical.get(path);
    if (hit === undefined) {
      hit = canonicalPath(path);
      canonical.set(path, hit);
    }
    return hit;
  };
  return (d) => {
    if (!d.loc) return filePath;
    const file =
      d.loc.file === undefined || canonicalOf(d.loc.file) === canonicalOf(filePath)
        ? filePath
        : relative(process.cwd(), d.loc.file);
    return `${file}:${d.loc.start.line}:${d.loc.start.column}`;
  };
}

/**
 * One spelling per file, so `./index.krs`, its absolute form and a symlink to it
 * compare equal. Synchronous because {@link diagLocFormatter} returns strings its
 * callers hand straight to `process.stderr.write`. Falls back to lexical
 * resolution when the path cannot be stat'ed (it was deleted mid-run, say),
 * which still folds the relative and absolute spellings together.
 */
function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * Resolve `filePath` to an absolute path and verify it exists, exiting with
 * the shared `Error: File not found: <file>` message otherwise. Returns
 * `undefined` (after writing stderr and calling `process.exit(1)`) so
 * callers can `return` immediately — mirroring real process termination
 * even when `process.exit` is mocked (e.g. in tests).
 *
 * Shared first step of matrix / coverage / subtree's "compile system view
 * or exit" prologue — split out from {@link compileSystemViewOrExit}
 * because matrix and coverage run their own `--format`/`--infra`/
 * `--threshold` validation *between* the exists check and the compile
 * step, and that relative ordering must stay byte-identical.
 */
export async function resolveKrsFileOrExit(
  filePath: string,
): Promise<{ absolutePath: string; fs: NodeFileSystemProvider } | undefined> {
  const absolutePath = resolve(filePath);
  const fs = new NodeFileSystemProvider();

  if (!(await fs.exists(absolutePath))) {
    process.stderr.write(`Error: File not found: ${filePath}\n`);
    process.exit(1);
    return undefined;
  }

  return { absolutePath, fs };
}

/**
 * Compile `absolutePath` as a system view or exit(1): guards that the
 * project is actually a system view (`Error: <commandName> requires a
 * system view`), then prints every error-severity diagnostic
 * (`Error: <loc>: <message>`) and exits if there were any. Returns
 * `undefined` in either exit case so callers can `return` immediately —
 * see {@link resolveKrsFileOrExit} for why. Second half of the shared
 * "compile system view or exit" prologue used by matrix / coverage /
 * subtree.
 */
export async function compileSystemViewOrExit(
  fs: NodeFileSystemProvider,
  absolutePath: string,
  filePath: string,
  commandName: string,
): Promise<SystemCompileResult | undefined> {
  const result = await compileProject(absolutePath, fs, { diagramType: "system" });
  if (result.diagramType !== "system") {
    process.stderr.write(`Error: ${commandName} requires a system view\n`);
    process.exit(1);
    return undefined;
  }

  if (!reportErrorsOrExit(result.diagnostics, filePath)) return undefined;

  return result;
}

/**
 * Print every error-severity diagnostic and exit(1), or report that there were
 * none. Returns `false` in the exit case so callers can `return undefined`
 * immediately — see {@link resolveKrsFileOrExit} for why they must.
 *
 * Shared because the CLI's error line is a contract with whoever reads its
 * stderr: two spellings of the same block drift the moment one of them gains a
 * prefix or a count, and the two commands then disagree about what an error
 * looks like.
 */
function reportErrorsOrExit(diagnostics: readonly Diagnostic[], filePath: string): boolean {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const locOf = diagLocFormatter(filePath);
  for (const d of errors) {
    process.stderr.write(`Error: ${locOf(d)}: ${formatDiagnostic(d)}\n`);
  }
  if (errors.length > 0) {
    process.exit(1);
    return false;
  }
  return true;
}

/**
 * Resolve `absolutePath` and all its imports into one merged {@link KrsFile},
 * or exit(1) after printing every error-severity diagnostic — the same report
 * {@link compileSystemViewOrExit} prints, for commands that read the model
 * rather than a rendered view.
 *
 * `team-dependencies` needs the systems **and** the `organization` blocks, and
 * no single compile result carries both: `SystemCompileResult` drops the org
 * blocks and `OrgCompileResult` drops the systems. Compiling twice would also
 * render two SVGs this command throws away. Going through the resolver instead
 * hands the derivation the merged file its path keys are built against — the
 * form `buildOwnerIndex` and `collectDeclaredNodePaths` already take — with no
 * view-shaped detour in between.
 *
 * Returns `undefined` in the exit case so callers can `return` immediately,
 * for the reason {@link resolveKrsFileOrExit} spells out.
 */
export async function resolveProjectOrExit(
  fs: NodeFileSystemProvider,
  absolutePath: string,
  filePath: string,
): Promise<KrsFile | undefined> {
  const resolved = await new ImportResolver(fs).resolve(absolutePath);
  if (!reportErrorsOrExit(resolved.diagnostics, filePath)) return undefined;
  return resolved.krsFile;
}
