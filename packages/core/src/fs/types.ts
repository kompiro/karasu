/**
 * FileSystemProvider — 環境非依存のファイルシステム抽象化
 *
 * ブラウザ（OPFS）、VSCode（workspace.fs）、テスト（InMemory）で
 * 同一の interface を通じてファイル操作を行う。
 */

export interface DirEntry {
  name: string;
  kind: "file" | "directory";
}

export interface FsEvent {
  type: "change" | "create" | "delete";
  path: string;
}

export interface Disposable {
  dispose(): void;
}

export interface FileSystemProvider {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  readDir(path: string): Promise<DirEntry[]>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  watch?(path: string, callback: (event: FsEvent) => void): Disposable;
}
