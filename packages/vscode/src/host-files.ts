/**
 * What the extension host checks and reads when the preview webview asks for
 * a file (#3312).
 *
 * The webview is a trust boundary (TPL-168): a path it posts is tainted. Every
 * request goes through `checkRequestedPath` (shape and encoding) and then one
 * of the decisions below, which judge the *real* path, after symlinks:
 *
 * - file contents and existence: any `.krs` / `.krs.style` on disk, wherever
 *   it lies, so a model that imports from outside the workspace folder still
 *   previews (the old preview and the LSP read them too). Only model files are
 *   exposed, and a symlink named `.krs` that points at another file is refused.
 * - directory listings (directory imports): inside the workspace folders only,
 *   plus the entry's directory when the entry lies outside them.
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

/**
 * Whether a path names a model or style file, the only files the preview has
 * reason to open. Case-insensitive where the file system is, so `.KRS` is a
 * model file on Windows and macOS (and a case trick cannot dodge the check).
 */
export function isKarasuSourcePath(
  path: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const name = platform === "win32" || platform === "darwin" ? path.toLowerCase() : path;
  return name.endsWith(".krs") || name.endsWith(".krs.style");
}

/** What the host needs to judge a request. `realpath` rejects for a missing path. */
export interface HostFileDeps {
  realpath: (path: string) => Promise<string>;
  /** Whether an editor holds the file at this path (its text may not be on disk yet). */
  hasBuffer: (path: string) => boolean;
  platform?: NodeJS.Platform;
}

export type FileReadDecision =
  /** Read the buffer at `path` if one is open, else the disk at `diskPath`. */
  | { kind: "read"; path: string; diskPath: string }
  | { kind: "notFound" }
  | { kind: "refused"; reason: string };

/** Whether the file a checked path names may be read, and from where. */
export async function decideFileRead(path: string, deps: HostFileDeps): Promise<FileReadDecision> {
  const real = await deps.realpath(path).catch(() => null);
  if (real === null) {
    // Not on disk: only an open editor can hold it, and then its own name is
    // all there is to judge.
    if (deps.hasBuffer(path) && isKarasuSourcePath(path, deps.platform)) {
      return { kind: "read", path, diskPath: path };
    }
    return { kind: "notFound" };
  }
  if (!isKarasuSourcePath(real, deps.platform)) {
    return { kind: "refused", reason: "Only .krs and .krs.style files are read." };
  }
  return { kind: "read", path, diskPath: real };
}

/**
 * Whether a checked path exists, as far as the preview may know: a model file
 * anywhere, or anything inside the readable roots. Everything else answers
 * `false`, so a refusal does not reveal what lies outside.
 */
export async function decideExists(
  path: string,
  roots: readonly string[],
  deps: HostFileDeps,
): Promise<boolean> {
  if (deps.hasBuffer(path) && isKarasuSourcePath(path, deps.platform)) return true;
  const real = await deps.realpath(path).catch(() => null);
  if (real === null) return false;
  if (isKarasuSourcePath(real, deps.platform)) return true;
  return isRealPathWithinRoots(path, roots, deps.realpath);
}
