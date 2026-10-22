/**
 * What the extension host checks and reads when the preview webview asks for
 * a file (#3312).
 *
 * The webview is a trust boundary (TPL-168): a path it posts is tainted. Every
 * request goes through `checkRequestedPath` (shape and encoding), then
 * `isWithinRoots` (string containment after normalization), then the same
 * containment on the real path, so a symlink inside the workspace that points
 * out of it is refused. Writes will pass the same checks (slice C, #3313).
 *
 * Kept free of any `vscode` import so it can be unit-tested without the
 * extension host, like `message-validation.ts`.
 */
import * as nodePath from "node:path";

/**
 * Where the preview may read: the workspace folders, plus the entry's own
 * directory when the entry lies in none of them (a `.krs` opened from outside
 * the workspace still previews, and only its neighbours become readable).
 */
export function allowedRoots(workspaceFolders: readonly string[], entryPath: string): string[] {
  const roots = workspaceFolders.map((folder) => nodePath.resolve(folder));
  if (!roots.some((root) => isWithinRoots(entryPath, [root]))) {
    roots.push(nodePath.dirname(nodePath.resolve(entryPath)));
  }
  return roots;
}

/**
 * The normalized absolute path a request names, or `null` when it is not a
 * plain absolute path: not a string, empty, carrying a NUL, or spelling a
 * separator or a dot as a percent escape (a file system path is never
 * URL-encoded, so an escape can only be an attempt to slip past the checks).
 */
export function checkRequestedPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (value.includes("\0")) return null;
  if (/%(?:2f|5c|2e|00)/i.test(value)) return null;
  if (!nodePath.isAbsolute(value)) return null;
  return nodePath.resolve(value);
}

/** Whether `path` is one of `roots` or lies below one, compared after normalization. */
export function isWithinRoots(path: string, roots: readonly string[]): boolean {
  const target = nodePath.resolve(path);
  return roots.some((root) => {
    const relative = nodePath.relative(nodePath.resolve(root), target);
    return relative === "" || (!relative.startsWith("..") && !nodePath.isAbsolute(relative));
  });
}

/**
 * Whether the file a checked path names really lies within the roots, after
 * symlinks are resolved on both sides (a workspace can itself sit under a
 * symlink). A path that does not exist cannot point anywhere, so it passes
 * and the read reports it missing.
 */
export async function isRealPathWithinRoots(
  path: string,
  roots: readonly string[],
  realpath: (p: string) => Promise<string>,
): Promise<boolean> {
  let real: string;
  try {
    real = await realpath(path);
  } catch {
    return true;
  }
  const realRoots = await Promise.all(roots.map((root) => realpath(root).catch(() => root)));
  return isWithinRoots(real, realRoots);
}

/**
 * A file's text as the user sees it: the open editor's buffer when the file is
 * open, so an unsaved edit reaches the preview, and the disk otherwise
 * (TPL-2996). This holds for every file a compile reads, not only the entry.
 */
export async function readThroughBuffers(
  path: string,
  openBuffer: (path: string) => string | undefined,
  readDisk: (path: string) => Promise<string>,
): Promise<string> {
  const buffer = openBuffer(path);
  return buffer !== undefined ? buffer : readDisk(path);
}

/** Whether a path names a model or style file, the only files the preview has reason to open. */
export function isKarasuSourcePath(path: string): boolean {
  return path.endsWith(".krs") || path.endsWith(".krs.style");
}
