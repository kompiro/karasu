import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import type { FileSystemProvider, DirEntry } from "@karasu-tools/core";

/**
 * A {@link FileSystemProvider} backed by Node's `fs/promises`, for CLI commands
 * that compile a `.krs` project from disk. Mutation methods (`delete` / `mkdir`)
 * are unsupported — the read-only commands never call them.
 */
export class NodeFileSystemProvider implements FileSystemProvider {
  async readFile(path: string): Promise<string> {
    return readFile(path, "utf-8");
  }
  async writeFile(path: string, content: string): Promise<void> {
    await writeFile(path, content, "utf-8");
  }
  async readDir(path: string): Promise<DirEntry[]> {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      kind: e.isDirectory() ? ("directory" as const) : ("file" as const),
    }));
  }
  async exists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
  async delete(): Promise<void> {
    throw new Error("delete not supported");
  }
  async mkdir(): Promise<void> {
    throw new Error("mkdir not supported");
  }
}
