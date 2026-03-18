import type { FileSystemProvider, DirEntry } from "@karasu/core";

/**
 * OpfsFileSystemProvider — Origin Private File System による実装。
 * モダンブラウザで利用可能なサンドボックス内仮想ファイルシステム。
 */
export class OpfsFileSystemProvider implements FileSystemProvider {
  private rootPromise: Promise<FileSystemDirectoryHandle> | null = null;

  private getRoot(): Promise<FileSystemDirectoryHandle> {
    if (!this.rootPromise) {
      this.rootPromise = navigator.storage.getDirectory();
    }
    return this.rootPromise;
  }

  /**
   * パスを分解してディレクトリハンドルとファイル名を取得する。
   * create: true の場合、途中のディレクトリを自動作成する。
   */
  private async traverse(
    path: string,
    options?: { create?: boolean }
  ): Promise<{ dir: FileSystemDirectoryHandle; name: string }> {
    const segments = path.split("/").filter((s) => s !== "");
    if (segments.length === 0) {
      throw new Error("Invalid path: empty");
    }

    const name = segments.pop()!;
    let dir = await this.getRoot();

    for (const seg of segments) {
      dir = await dir.getDirectoryHandle(seg, {
        create: options?.create ?? false,
      });
    }

    return { dir, name };
  }

  async readFile(path: string): Promise<string> {
    const { dir, name } = await this.traverse(path);
    const fileHandle = await dir.getFileHandle(name);
    const file = await fileHandle.getFile();
    return file.text();
  }

  async writeFile(path: string, content: string): Promise<void> {
    const { dir, name } = await this.traverse(path, { create: true });
    const fileHandle = await dir.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async readDir(path: string): Promise<DirEntry[]> {
    let dir: FileSystemDirectoryHandle;

    if (path === "/" || path === "") {
      dir = await this.getRoot();
    } else {
      const segments = path.split("/").filter((s) => s !== "");
      dir = await this.getRoot();
      for (const seg of segments) {
        dir = await dir.getDirectoryHandle(seg);
      }
    }

    const entries: DirEntry[] = [];
    for await (const [name, handle] of dir as unknown as AsyncIterable<
      [string, FileSystemHandle]
    >) {
      entries.push({
        name,
        kind: handle.kind === "directory" ? "directory" : "file",
      });
    }

    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  async exists(path: string): Promise<boolean> {
    if (path === "/" || path === "") return true;

    try {
      const segments = path.split("/").filter((s) => s !== "");
      let dir = await this.getRoot();

      // 最後のセグメント以外をディレクトリとして辿る
      for (let i = 0; i < segments.length - 1; i++) {
        dir = await dir.getDirectoryHandle(segments[i]);
      }

      const last = segments[segments.length - 1];

      // ファイルとして試す
      try {
        await dir.getFileHandle(last);
        return true;
      } catch {
        // ディレクトリとして試す
        try {
          await dir.getDirectoryHandle(last);
          return true;
        } catch {
          return false;
        }
      }
    } catch {
      return false;
    }
  }

  async delete(path: string): Promise<void> {
    const { dir, name } = await this.traverse(path);
    await dir.removeEntry(name, { recursive: true });
  }

  async mkdir(path: string): Promise<void> {
    const segments = path.split("/").filter((s) => s !== "");
    let dir = await this.getRoot();

    for (const seg of segments) {
      dir = await dir.getDirectoryHandle(seg, { create: true });
    }
  }
}
