import type { Diagnostic } from "@karasu-tools/core";

/** Where the preview is reading from, for naming the document a position is in. */
export interface DiagnosticDocumentContext {
  /** The document open in the editor, or `null` when none is. */
  currentFilePath: string | null;
  /** The project's root directory, or `null` outside a project. */
  projectRoot: string | null;
}

/**
 * The location prefix the diagnostic banner shows before a message, or `null`
 * for a diagnostic with no position.
 *
 * A project compile spans files, and a diagnostic decided on the merged model
 * anchors on whichever file declared the construct (#2715, TPL-2715). Showing
 * every position as `Line N` reads it as a line of the open document, which it
 * often is not. So:
 *
 * - no `loc.file` (a single-document compile), or the open document's own
 *   path: `Line N`, as before
 * - any other file: `<path>:N`, the path relative to the project root when it
 *   sits inside it. This spelling adds no word to translate.
 *
 * App paths are the ones the app itself built from the project root, so a
 * string comparison is exact here (the CLI, reading paths the user typed, has
 * to canonicalize first).
 */
export function diagnosticLocationLabel(
  loc: Diagnostic["loc"],
  { currentFilePath, projectRoot }: DiagnosticDocumentContext,
): string | null {
  if (!loc) return null;
  if (loc.file === undefined || loc.file === currentFilePath) {
    return `Line ${loc.start.line}`;
  }
  const rootPrefix = projectRoot === null ? null : `${projectRoot.replace(/\/+$/, "")}/`;
  const shown =
    rootPrefix !== null && loc.file.startsWith(rootPrefix)
      ? loc.file.slice(rootPrefix.length)
      : loc.file;
  return `${shown}:${loc.start.line}`;
}
