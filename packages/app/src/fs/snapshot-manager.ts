import type { FileSystemProvider } from "@karasu-tools/core";
import { SerialQueue } from "./serial-queue.js";

/**
 * Per-project `.snapshots/` layout:
 *   /projects/<pid>/.snapshots/<relPath>/<snapshotId>.krs
 *   /projects/<pid>/.snapshots/<relPath>/index.json
 *
 * `relPath` is the file path relative to the project root — directory separators
 * are preserved so snapshots live adjacent to the (virtual) file tree they belong to.
 */

export type SnapshotTrigger = "auto" | "manual";

export interface SnapshotRecord {
  id: string;
  filePath: string;
  createdAt: string;
  label?: string;
  trigger: SnapshotTrigger;
  sizeBytes: number;
  /** FNV-1a hash of content — used to skip duplicate consecutive auto snapshots. */
  contentHash: string;
}

interface SnapshotIndex {
  version: 1;
  records: SnapshotRecord[];
}

const INDEX_VERSION = 1;
const AUTO_RETENTION_CAP = 20;
const SNAPSHOTS_DIRNAME = ".snapshots";

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export class SnapshotManager {
  /**
   * Serializes the index read-modify-write (#1531, same class as ProjectManager):
   * auto-capture (debounce + beforeunload) can race a manual capture against the
   * same `index.json`, and the later writeIndex would otherwise clobber the
   * earlier one and silently drop a snapshot record.
   */
  private queue = new SerialQueue();

  constructor(
    private fs: FileSystemProvider,
    private projectRoot: string,
  ) {}

  private snapshotDir(relPath: string): string {
    return `${this.projectRoot}/${SNAPSHOTS_DIRNAME}/${relPath}`;
  }

  private indexPath(relPath: string): string {
    return `${this.snapshotDir(relPath)}/index.json`;
  }

  private contentPath(relPath: string, snapshotId: string): string {
    return `${this.snapshotDir(relPath)}/${snapshotId}.krs`;
  }

  private async readIndex(relPath: string): Promise<SnapshotIndex> {
    try {
      const raw = await this.fs.readFile(this.indexPath(relPath));
      const parsed = JSON.parse(raw) as SnapshotIndex;
      if (parsed.version !== INDEX_VERSION || !Array.isArray(parsed.records)) {
        return { version: INDEX_VERSION, records: [] };
      }
      return parsed;
    } catch {
      return { version: INDEX_VERSION, records: [] };
    }
  }

  private async writeIndex(relPath: string, index: SnapshotIndex): Promise<void> {
    await this.fs.writeFile(this.indexPath(relPath), JSON.stringify(index, null, 2));
  }

  async list(relPath: string): Promise<SnapshotRecord[]> {
    const index = await this.readIndex(relPath);
    return [...index.records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async read(relPath: string, snapshotId: string): Promise<string> {
    return this.fs.readFile(this.contentPath(relPath, snapshotId));
  }

  /**
   * Create a snapshot. Returns null when skipped (auto trigger + content identical
   * to the most recent snapshot for the same file).
   */
  async capture(
    relPath: string,
    content: string,
    opts: { trigger: SnapshotTrigger; label?: string },
  ): Promise<SnapshotRecord | null> {
    // Serialized so a concurrent capture/delete can't lose this record (#1531).
    // gcIfNeeded runs inside this critical section, so it must NOT re-enter the
    // queue (that would deadlock).
    return this.queue.run(async () => {
      const contentHash = fnv1a(content);
      const index = await this.readIndex(relPath);

      if (opts.trigger === "auto" && index.records.length > 0) {
        const latest = index.records.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
        if (latest.contentHash === contentHash) return null;
      }

      const id = crypto.randomUUID();
      const record: SnapshotRecord = {
        id,
        filePath: relPath,
        createdAt: new Date().toISOString(),
        label: opts.label,
        trigger: opts.trigger,
        sizeBytes: content.length,
        contentHash,
      };

      await this.fs.writeFile(this.contentPath(relPath, id), content);
      index.records.push(record);
      await this.writeIndex(relPath, index);

      await this.gcIfNeeded(relPath);
      return record;
    });
  }

  async delete(relPath: string, snapshotId: string): Promise<void> {
    await this.queue.run(async () => {
      const index = await this.readIndex(relPath);
      const next: SnapshotIndex = {
        version: INDEX_VERSION,
        records: index.records.filter((r) => r.id !== snapshotId),
      };
      try {
        await this.fs.delete(this.contentPath(relPath, snapshotId));
      } catch {
        // content already gone — keep going so the index stays consistent
      }
      await this.writeIndex(relPath, next);
    });
  }

  /**
   * Drop oldest auto snapshots once the per-file cap is exceeded. Manual
   * snapshots are kept. Internal-only: always invoked from inside the queue
   * (capture), so it must not re-enter it.
   */
  private async gcIfNeeded(relPath: string): Promise<void> {
    const index = await this.readIndex(relPath);
    const autos = index.records
      .filter((r) => r.trigger === "auto")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const excess = autos.length - AUTO_RETENTION_CAP;
    if (excess <= 0) return;

    const toRemove = autos.slice(0, excess).map((r) => r.id);
    const keep = index.records.filter((r) => !toRemove.includes(r.id));
    for (const id of toRemove) {
      try {
        await this.fs.delete(this.contentPath(relPath, id));
      } catch {
        // swallow — best effort
      }
    }
    await this.writeIndex(relPath, { version: INDEX_VERSION, records: keep });
  }
}

export const __testing = { fnv1a, AUTO_RETENTION_CAP };
