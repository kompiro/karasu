import type { DirEntry, FileSystemProvider } from "@karasu-tools/core";
import type { HostFsOp, HostFsValue, HostMessage, WebviewMessage } from "./protocol.js";

type FsResult = Extract<HostMessage, { type: "fsResult" }>;

interface Pending {
  resolve: (value: HostFsValue[HostFsOp]) => void;
  reject: (error: Error) => void;
}

/** A read the host refused or could not do. `notFound` is a missing file. */
export class HostFsError extends Error {
  constructor(
    message: string,
    readonly notFound: boolean,
  ) {
    super(message);
    this.name = "HostFsError";
  }
}

/**
 * The viewer's file system in the VS Code webview (#3312): every read is a
 * round trip to the extension host, which answers from the open editor buffer
 * or from disk (TPL-2996).
 *
 * Answers are cached, since one compile reads the entry and every import and
 * a view switch compiles again. The cache is tied to a generation that
 * `invalidate()` and `reset()` advance: an answer to a request made before the
 * newest change is still handed to the compile that asked (which drops it as
 * stale anyway), but never stored, so it cannot outlive the change. Requests
 * are not shared across generations for the same reason.
 *
 * The preview cannot write yet (slice C, #3313), so the write operations throw.
 */
export class HostFileSystem implements FileSystemProvider {
  private generation = 0;
  private nextId = 1;
  private disposed = false;
  private readonly pending = new Map<number, Pending>();
  private readonly files = new Map<string, string>();
  private readonly dirs = new Map<string, DirEntry[]>();
  private readonly existence = new Map<string, boolean>();

  constructor(private readonly post: (message: WebviewMessage) => void) {}

  /** Feed a host `fsResult` to the request waiting for it. */
  handleResult(message: FsResult): void {
    const waiting = this.pending.get(message.id);
    if (!waiting) return;
    this.pending.delete(message.id);
    if (message.ok) waiting.resolve(message.value);
    else waiting.reject(new HostFsError(message.error, message.notFound));
  }

  /**
   * These files changed. Their text is read again; directory listings and
   * existence answers are all dropped, because a created or deleted file
   * changes them without being one of `paths`' directories.
   */
  invalidate(paths: readonly string[]): void {
    this.generation++;
    for (const path of paths) this.files.delete(path);
    this.dirs.clear();
    this.existence.clear();
  }

  /** Another entry was opened: nothing read so far is trusted. */
  reset(): void {
    this.generation++;
    this.files.clear();
    this.dirs.clear();
    this.existence.clear();
  }

  /** The viewer is gone: fail what is still waiting and ignore later answers. */
  dispose(): void {
    this.disposed = true;
    for (const waiting of this.pending.values()) {
      waiting.reject(new HostFsError("The preview was closed.", false));
    }
    this.pending.clear();
  }

  readFile(path: string): Promise<string> {
    return this.cached(this.files, "readFile", path);
  }

  readDir(path: string): Promise<DirEntry[]> {
    return this.cached(this.dirs, "readDir", path);
  }

  exists(path: string): Promise<boolean> {
    return this.cached(this.existence, "exists", path);
  }

  writeFile(): Promise<void> {
    return Promise.reject(new HostFsError("The VS Code preview cannot write files yet.", false));
  }

  delete(): Promise<void> {
    return Promise.reject(new HostFsError("The VS Code preview cannot delete files.", false));
  }

  mkdir(): Promise<void> {
    return Promise.reject(new HostFsError("The VS Code preview cannot create directories.", false));
  }

  private async cached<Op extends HostFsOp>(
    cache: Map<string, HostFsValue[Op]>,
    op: Op,
    path: string,
  ): Promise<HostFsValue[Op]> {
    const hit = cache.get(path);
    if (hit !== undefined) return hit;
    const generation = this.generation;
    const value = (await this.request(op, path)) as HostFsValue[Op];
    if (generation === this.generation && !this.disposed) cache.set(path, value);
    return value;
  }

  private request(op: HostFsOp, path: string): Promise<HostFsValue[HostFsOp]> {
    if (this.disposed) {
      return Promise.reject(new HostFsError("The preview was closed.", false));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.post({ type: "fs", id, op, path });
    });
  }
}
