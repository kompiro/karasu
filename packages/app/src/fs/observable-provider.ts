import type { DirEntry, Disposable, FileSystemProvider, FsEvent } from "@karasu-tools/core";
import { normalizePath } from "@karasu-tools/core";

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
 */
export class ObservableFileSystemProvider implements FileSystemProvider {
  private readonly subscriptions = new Set<Subscription>();

  constructor(private readonly delegate: FileSystemProvider) {}

  async readFile(path: string): Promise<string> {
    return this.delegate.readFile(path);
  }

  async writeFile(path: string, content: string): Promise<void> {
    let existed = false;
    try {
      existed = await this.delegate.exists(path);
    } catch {
      existed = false;
    }
    await this.delegate.writeFile(path, content);
    this.emit({ type: existed ? "change" : "create", path: normalizePath(path) });
  }

  async readDir(path: string): Promise<DirEntry[]> {
    return this.delegate.readDir(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.delegate.exists(path);
  }

  async delete(path: string): Promise<void> {
    await this.delegate.delete(path);
    this.emit({ type: "delete", path: normalizePath(path) });
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
