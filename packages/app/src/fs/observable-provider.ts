import type { DirEntry, Disposable, FileSystemProvider, FsEvent } from "@karasu-tools/core";
import { normalizePath } from "@karasu-tools/core";
import { SerialQueue } from "./serial-queue.js";

interface Subscription {
  rootPath: string;
  callback: (event: FsEvent) => void;
}

/**
 * ObservableFileSystemProvider — wraps another `FileSystemProvider` and
 * notifies subscribers after every successful mutation.
 *
 * `writeFile` checks `exists()` before writing so subscribers can tell
 * `create` from `change`. `delete` emits `delete`; `mkdir` emits `create`.
 * Read ops pass through unchanged. Failed mutations do not fire events —
 * the file system state didn't change.
 *
 * Subscribers register with `watch(rootPath, callback)` and receive every
 * event whose `path` is a descendant of `rootPath`. The returned
 * `Disposable` removes the subscription. Used by the `FileTree` sidebar
 * to reflect external writes (GUI style bootstrap, AI translate, …) that
 * bypass the tree's own mutation ops.
 *
 * Mutations to a given path are serialized through a per-path `SerialQueue`
 * (#1563): every writer that shares this provider — the editor's auto-save,
 * the GUI edge-direction append (a read-modify-write via {@link update}),
 * snapshot content writes — runs one at a time per file, so a slow
 * read-modify-write can't be clobbered by an interleaving write. (Index
 * read-modify-writes in ProjectManager / SnapshotManager span a read this
 * provider can't see, so those keep their own queue.)
 */
export class ObservableFileSystemProvider implements FileSystemProvider {
  private readonly subscriptions = new Set<Subscription>();
  private readonly pathQueues = new Map<string, SerialQueue>();

  constructor(private readonly delegate: FileSystemProvider) {}

  /** The serial queue for a path, created on first use. Keyed by normalized path. */
  private queueFor(path: string): SerialQueue {
    const key = normalizePath(path);
    let queue = this.pathQueues.get(key);
    if (!queue) {
      queue = new SerialQueue();
      this.pathQueues.set(key, queue);
    }
    return queue;
  }

  async readFile(path: string): Promise<string> {
    return this.delegate.readFile(path);
  }

  writeFile(path: string, content: string): Promise<void> {
    return this.queueFor(path).run(() => this.rawWriteFile(path, content));
  }

  /** Unqueued write + event emit — the body shared by `writeFile` and `update`. */
  private async rawWriteFile(path: string, content: string): Promise<void> {
    let existed = false;
    try {
      existed = await this.delegate.exists(path);
    } catch {
      existed = false;
    }
    await this.delegate.writeFile(path, content);
    this.emit({ type: existed ? "change" : "create", path: normalizePath(path) });
  }

  /**
   * Serialized read-modify-write: the read and the write run as one task on the
   * path's queue, so no other write/update to the same path can interleave
   * between them (the lost-update fix for #1563). A missing file reads as "".
   */
  update(path: string, transform: (current: string) => string | Promise<string>): Promise<void> {
    return this.queueFor(path).run(async () => {
      let current = "";
      try {
        current = await this.delegate.readFile(path);
      } catch {
        current = "";
      }
      await this.rawWriteFile(path, await transform(current));
    });
  }

  async readDir(path: string): Promise<DirEntry[]> {
    return this.delegate.readDir(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.delegate.exists(path);
  }

  delete(path: string): Promise<void> {
    // Serialized on the same per-path queue so a delete can't interleave with a
    // queued write/update of the same file.
    return this.queueFor(path).run(async () => {
      await this.delegate.delete(path);
      this.emit({ type: "delete", path: normalizePath(path) });
    });
  }

  async mkdir(path: string): Promise<void> {
    await this.delegate.mkdir(path);
    this.emit({ type: "create", path: normalizePath(path) });
  }

  watch(rootPath: string, callback: (event: FsEvent) => void): Disposable {
    const sub: Subscription = { rootPath: normalizePath(rootPath), callback };
    this.subscriptions.add(sub);
    return { dispose: () => this.subscriptions.delete(sub) };
  }

  private emit(event: FsEvent): void {
    for (const sub of this.subscriptions) {
      if (isDescendant(event.path, sub.rootPath)) {
        sub.callback(event);
      }
    }
  }
}

function isDescendant(path: string, root: string): boolean {
  if (path === root) return true;
  if (root === "/") return true;
  return path.startsWith(root + "/");
}
