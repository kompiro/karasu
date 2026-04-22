import type { FileSystemProvider, DirEntry } from "@karasu-tools/core";
import type { FileTreeNode } from "../components/file-tree/types.js";

/**
 * Reads a single directory level and returns collapsed (unexpanded) nodes.
 * Returns [] on read failure (path missing, permission error, etc.).
 */
export async function loadDir(dirPath: string, fs: FileSystemProvider): Promise<FileTreeNode[]> {
  try {
    const entries = await fs.readDir(dirPath);
    return entries
      .filter((entry: DirEntry) => !entry.name.startsWith("."))
      .map((entry: DirEntry) => ({
        name: entry.name,
        path: `${dirPath}/${entry.name}`,
        kind: entry.kind,
        expanded: false,
      }));
  } catch {
    return [];
  }
}

/**
 * Copies `srcPath` to `destPath` recursively. `destPath` must not already exist.
 * Used by rename when the target is a directory.
 */
export async function copyDirRecursive(
  fs: FileSystemProvider,
  srcPath: string,
  destPath: string,
): Promise<void> {
  await fs.mkdir(destPath);
  const entries = await fs.readDir(srcPath);
  for (const entry of entries) {
    const srcChild = `${srcPath}/${entry.name}`;
    const destChild = `${destPath}/${entry.name}`;
    if (entry.kind === "file") {
      const content = await fs.readFile(srcChild);
      await fs.writeFile(destChild, content);
    } else {
      await copyDirRecursive(fs, srcChild, destChild);
    }
  }
}
