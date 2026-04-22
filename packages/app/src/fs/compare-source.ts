import type { FileSystemProvider, DirEntry } from "@karasu-tools/core";
import type { SnapshotManager } from "./snapshot-manager";

export type CompareSource =
  | { kind: "file"; path: string }
  | { kind: "snapshot"; filePath: string; snapshotId: string };

interface ResolvedCompareSource {
  /** The `beforeEntryPath` to hand to `compile{System,Deploy,Org}Diff`. */
  entryPath: string;
  /** The FS to use — may be an overlay when the source is a snapshot. */
  fs: FileSystemProvider;
}

/**
 * Stable key for memoization / useEffect deps. Equal values imply equivalent sources.
 */
export function compareSourceKey(source: CompareSource | null): string {
  if (!source) return "";
  return source.kind === "file"
    ? `file:${source.path}`
    : `snap:${source.filePath}:${source.snapshotId}`;
}

/**
 * Resolve a CompareSource into `{ entryPath, fs }` suitable for the existing
 * diff compile pipeline.
 *
 * - `file` sources pass through unchanged.
 * - `snapshot` sources mount an overlay FS that returns snapshot content at the
 *   original project-root-relative path. Imports are not snapshotted, so any
 *   `@import` from the snapshotted file resolves against the live workspace —
 *   matching user intent ("what did *this file* look like yesterday").
 */
export async function resolveCompareSource(
  source: CompareSource,
  fs: FileSystemProvider,
  snapshots: SnapshotManager,
  projectRoot: string,
): Promise<ResolvedCompareSource> {
  if (source.kind === "file") {
    return { entryPath: source.path, fs };
  }

  const content = await snapshots.read(source.filePath, source.snapshotId);
  const viewRoot = `/.snapshot-view/${source.snapshotId}`;
  const entryPath = `${viewRoot}/${source.filePath}`;
  return { entryPath, fs: new SnapshotOverlayFs(fs, viewRoot, projectRoot, entryPath, content) };
}

/**
 * Overlay that mounts snapshot content at a virtual `/.snapshot-view/<id>/` root.
 *
 * - `readFile(entryPath)` returns the snapshot content.
 * - Other reads under the virtual root (i.e. relative imports from the snapshotted
 *   file) are rewritten to the live workspace equivalent under `projectRoot`.
 *   Snapshots only capture the file itself, so imports must resolve against
 *   the current workspace.
 * - Everything else delegates unchanged.
 */
class SnapshotOverlayFs implements FileSystemProvider {
  constructor(
    private base: FileSystemProvider,
    private viewRoot: string,
    private projectRoot: string,
    private entryPath: string,
    private entryContent: string,
  ) {}

  private remap(path: string): string | null {
    if (path === this.entryPath) return null;
    const prefix = `${this.viewRoot}/`;
    if (path.startsWith(prefix)) {
      return `${this.projectRoot}/${path.slice(prefix.length)}`;
    }
    return path;
  }

  async readFile(path: string): Promise<string> {
    const mapped = this.remap(path);
    if (mapped === null) return this.entryContent;
    return this.base.readFile(mapped);
  }
  async writeFile(path: string, content: string): Promise<void> {
    const mapped = this.remap(path);
    if (mapped === null) throw new Error("snapshot overlay is read-only");
    return this.base.writeFile(mapped, content);
  }
  async readDir(path: string): Promise<DirEntry[]> {
    const mapped = this.remap(path);
    if (mapped === null) throw new Error("snapshot overlay entry is a file, not a directory");
    return this.base.readDir(mapped);
  }
  async exists(path: string): Promise<boolean> {
    const mapped = this.remap(path);
    if (mapped === null) return true;
    return this.base.exists(mapped);
  }
  async delete(path: string): Promise<void> {
    const mapped = this.remap(path);
    if (mapped === null) throw new Error("snapshot overlay is read-only");
    return this.base.delete(mapped);
  }
  async mkdir(path: string): Promise<void> {
    const mapped = this.remap(path);
    if (mapped === null) throw new Error("snapshot overlay is read-only");
    return this.base.mkdir(mapped);
  }
}
