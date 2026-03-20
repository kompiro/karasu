import type { FileSystemProvider, DirEntry } from "./types";
import { normalizePath, dirname } from "./path-utils";

/**
 * InMemoryFileSystemProvider — メモリ上のファイルシステム実装。
 * テスト用、および OPFS 非対応ブラウザのフォールバックとして使用する。
 */
export class InMemoryFileSystemProvider implements FileSystemProvider {
  private files = new Map<string, string>();
  private dirs = new Set<string>(["/"]); // ルートは常に存在

  async readFile(path: string): Promise<string> {
    const p = normalizePath(path);
    const content = this.files.get(p);
    if (content === undefined) {
      throw new Error(`ENOENT: no such file: ${p}`);
    }
    return content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    const p = normalizePath(path);
    // 親ディレクトリを自動作成
    await this.mkdir(dirname(p));
    this.files.set(p, content);
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const p = normalizePath(path);
    if (!this.dirs.has(p)) {
      throw new Error(`ENOENT: no such directory: ${p}`);
    }

    const prefix = p === "/" ? "/" : p + "/";
    const entries = new Map<string, DirEntry>();

    // ファイルを走査
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(prefix)) {
        const rest = filePath.slice(prefix.length);
        const slashIndex = rest.indexOf("/");
        if (slashIndex === -1) {
          // 直下のファイル
          entries.set(rest, { name: rest, kind: "file" });
        } else {
          // 直下のディレクトリ
          const dirName = rest.slice(0, slashIndex);
          if (!entries.has(dirName)) {
            entries.set(dirName, { name: dirName, kind: "directory" });
          }
        }
      }
    }

    // 空ディレクトリも含める
    for (const dirPath of this.dirs) {
      if (dirPath.startsWith(prefix)) {
        const rest = dirPath.slice(prefix.length);
        const slashIndex = rest.indexOf("/");
        if (slashIndex === -1 && rest !== "") {
          if (!entries.has(rest)) {
            entries.set(rest, { name: rest, kind: "directory" });
          }
        }
      }
    }

    return Array.from(entries.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  async exists(path: string): Promise<boolean> {
    const p = normalizePath(path);
    return this.files.has(p) || this.dirs.has(p);
  }

  async delete(path: string): Promise<void> {
    const p = normalizePath(path);

    // ファイル削除
    if (this.files.has(p)) {
      this.files.delete(p);
      return;
    }

    // ディレクトリ削除（配下も含む）
    if (this.dirs.has(p)) {
      const prefix = p === "/" ? "/" : p + "/";
      for (const filePath of this.files.keys()) {
        if (filePath.startsWith(prefix)) {
          this.files.delete(filePath);
        }
      }
      for (const dirPath of this.dirs) {
        if (dirPath === p || dirPath.startsWith(prefix)) {
          this.dirs.delete(dirPath);
        }
      }
      return;
    }

    throw new Error(`ENOENT: no such file or directory: ${p}`);
  }

  async mkdir(path: string): Promise<void> {
    const p = normalizePath(path);
    if (this.dirs.has(p)) return;

    // 親ディレクトリも再帰的に作成
    const parent = dirname(p);
    if (parent !== p) {
      await this.mkdir(parent);
    }

    this.dirs.add(p);
  }
}
