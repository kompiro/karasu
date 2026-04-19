import { useCallback } from "react";
import type { FileSystemProvider } from "@karasu-tools/core";
import { copyDirRecursive } from "../utils/file-tree-fs.js";

interface UseFileTreeOpsArgs {
  fs: FileSystemProvider;
  /** Called to re-read the tree from disk after any mutation. */
  reload: () => Promise<void>;
  onFileCreated?: (path: string) => void;
  onFileDeleted?: (path: string) => void;
  onFileRenamed?: (oldPath: string, newPath: string) => void;
  /**
   * Optional confirm hook for destructive ops. Defaults to `window.confirm`.
   * Exposed so tests can skip the dialog.
   */
  confirm?: (message: string) => boolean;
}

interface UseFileTreeOpsResult {
  createFile: (parentPath: string, name: string) => Promise<void>;
  createDir: (parentPath: string, name: string) => Promise<void>;
  renameItem: (oldPath: string, newName: string, kind: "file" | "directory") => Promise<void>;
  deleteItem: (path: string) => Promise<void>;
}

/**
 * File-system mutations used by the FileTree sidebar. Each op reloads the
 * tree on success and invokes the matching callback so the caller can react
 * (e.g. reselect a renamed file).
 *
 * `createFile` defaults bare names to `.krs`; `.krs.style` is also accepted.
 */
export function useFileTreeOps({
  fs,
  reload,
  onFileCreated,
  onFileDeleted,
  onFileRenamed,
  confirm = typeof window !== "undefined" ? window.confirm.bind(window) : () => true,
}: UseFileTreeOpsArgs): UseFileTreeOpsResult {
  const createFile = useCallback(
    async (parentPath: string, name: string) => {
      if (!name.trim()) return;
      let fileName = name.trim();
      if (!fileName.endsWith(".krs") && !fileName.endsWith(".krs.style")) {
        fileName += ".krs";
      }
      const fullPath = `${parentPath}/${fileName}`;
      await fs.writeFile(fullPath, "");
      await reload();
      onFileCreated?.(fullPath);
    },
    [fs, reload, onFileCreated],
  );

  const createDir = useCallback(
    async (parentPath: string, name: string) => {
      if (!name.trim()) return;
      const fullPath = `${parentPath}/${name.trim()}`;
      await fs.mkdir(fullPath);
      await reload();
    },
    [fs, reload],
  );

  const renameItem = useCallback(
    async (oldPath: string, newName: string, kind: "file" | "directory") => {
      if (!newName.trim()) return;
      const parentPath = oldPath.substring(0, oldPath.lastIndexOf("/"));
      const newPath = `${parentPath}/${newName.trim()}`;
      if (newPath === oldPath) return;

      if (kind === "file") {
        const content = await fs.readFile(oldPath);
        await fs.writeFile(newPath, content);
        await fs.delete(oldPath);
      } else {
        await copyDirRecursive(fs, oldPath, newPath);
        await fs.delete(oldPath);
      }
      await reload();
      onFileRenamed?.(oldPath, newPath);
    },
    [fs, reload, onFileRenamed],
  );

  const deleteItem = useCallback(
    async (path: string) => {
      if (!confirm(`Delete "${path.split("/").pop()}"?`)) return;
      await fs.delete(path);
      await reload();
      onFileDeleted?.(path);
    },
    [fs, reload, onFileDeleted, confirm],
  );

  return { createFile, createDir, renameItem, deleteItem };
}
