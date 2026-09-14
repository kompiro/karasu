import type { Diagnostic } from "@karasu-tools/core";
import { snapshotViewRelativePath } from "../fs/compare-source.js";

/** Where the preview is reading from, for naming the document a position is in. */
export interface DiagnosticDocumentContext {
  /** The document open in the editor, or `null` when none is. */
  currentFilePath: string | null;
  /**
   * The directory other files are shown relative to: the project root, or the
   * entry's directory in a mode without a project. `null` shows full paths.
   */
  displayRoot: string | null;
}

/**
 * The location prefix the diagnostic banner and the warning panel show before a
 * message, or `null` for a finding with no position.
 *
 * A project compile spans files, and a finding decided on the merged model
 * anchors on whichever file declared the construct (#2715, TPL-2715). Showing
 * every position as `Line N` reads it as a line of the open document, which it
 * often is not. So:
 *
 * - no `loc.file` (a single-document compile), or the open document's own
 *   path: `Line N`, as before
 * - any other file: `<path>:N`. This spelling adds no word to translate.
 *
 * The path is the one a reader knows the file by: relative to the display root
 * when inside it, and for a snapshot being compared, the project-relative path
 * the snapshot mount stands for rather than the virtual mount itself.
 *
 * App paths are the ones the app itself built from the project root (a
 * `/projects/<id>` root, joined with `/`), so a string comparison is exact here;
 * the CLI, reading paths the user typed, has to canonicalize first.
 */
export function diagnosticLocationLabel(
  loc: Diagnostic["loc"],
  { currentFilePath, displayRoot }: DiagnosticDocumentContext,
): string | null {
  if (!loc) return null;
  if (loc.file === undefined || loc.file === currentFilePath) {
    return `Line ${loc.start.line}`;
  }
  return `${displayPath(loc.file, displayRoot)}:${loc.start.line}`;
}

/**
 * React keys for a list of findings: where each one is (file and offset) and
 * what it says, with an occurrence count appended only to exact repeats. A
 * repeat is real: diff mode concatenates both sides' diagnostics, so an error
 * in a file both sides import appears twice. The offset alone, which the
 * warning panel once keyed on, collides across files.
 */
export function findingKeys(
  findings: readonly { loc?: Diagnostic["loc"] }[],
  messages: readonly string[],
): string[] {
  const seen = new Map<string, number>();
  return findings.map((finding, i) => {
    const base = `${finding.loc?.file ?? ""}:${finding.loc?.start.offset ?? ""}:${messages[i]}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}#${count}`;
  });
}

/**
 * The directory other files are shown relative to: the project root, or, in a
 * mode without a project (memory / serve), the entry's directory, so the
 * banner never shows a mount point the user did not choose.
 */
export function displayRootFor(
  projectRoot: string | null,
  entryPath: string | null,
): string | null {
  if (projectRoot !== null) return projectRoot;
  if (entryPath === null) return null;
  const slash = entryPath.lastIndexOf("/");
  return slash <= 0 ? null : entryPath.slice(0, slash);
}

function displayPath(file: string, displayRoot: string | null): string {
  const fromSnapshot = snapshotViewRelativePath(file);
  if (fromSnapshot !== null) return fromSnapshot;
  if (displayRoot === null) return file;
  const rootPrefix = `${displayRoot.replace(/\/+$/, "")}/`;
  return file.startsWith(rootPrefix) ? file.slice(rootPrefix.length) : file;
}
