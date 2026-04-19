import { useState, useEffect, useCallback } from "react";
import type { FileSystemProvider } from "@karasu-tools/core";
import { FileTreeView } from "./file-tree/FileTreeView.js";
import { loadDir } from "../utils/file-tree-fs.js";
import { updateNode } from "../utils/file-tree-tree.js";
import { useFileTreeOps } from "../hooks/useFileTreeOps.js";
import type { ContextMenuAction } from "./file-tree/ContextMenu.js";
import type { ContextMenuState, FileTreeNode, InlineInputState } from "./file-tree/types.js";

interface FileTreeProps {
  rootPath: string;
  fs: FileSystemProvider;
  currentFilePath: string | null;
  onSelectFile: (path: string) => void;
  onFileCreated?: (path: string) => void;
  onFileDeleted?: (path: string) => void;
  onFileRenamed?: (oldPath: string, newPath: string) => void;
  refreshKey?: number;
}

export function FileTree({
  rootPath,
  fs,
  currentFilePath,
  onSelectFile,
  onFileCreated,
  onFileDeleted,
  onFileRenamed,
  refreshKey,
}: FileTreeProps) {
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [inlineInput, setInlineInput] = useState<InlineInputState | null>(null);

  const reload = useCallback(async () => {
    const nodes = await loadDir(rootPath, fs);
    setTree(nodes);
  }, [rootPath, fs]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  // Close the context menu on outside click or Escape.
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [contextMenu]);

  const toggleDir = useCallback(
    async (node: FileTreeNode) => {
      if (node.kind !== "directory") return;
      if (node.expanded && node.children) {
        setTree((prev) => updateNode(prev, node.path, { expanded: false }));
      } else {
        const children = await loadDir(node.path, fs);
        setTree((prev) => updateNode(prev, node.path, { expanded: true, children }));
      }
    },
    [fs],
  );

  const ops = useFileTreeOps({
    fs,
    reload,
    onFileCreated,
    onFileDeleted,
    onFileRenamed,
  });

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileTreeNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const handleContentContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        node: { name: "", path: rootPath, kind: "directory" },
      });
    },
    [rootPath],
  );

  const handleInlineConfirm = useCallback(
    async (value: string) => {
      if (!inlineInput || !value.trim()) {
        setInlineInput(null);
        return;
      }
      if (inlineInput.mode === "create") {
        if (inlineInput.kind === "file") {
          await ops.createFile(inlineInput.parentPath, value);
        } else {
          await ops.createDir(inlineInput.parentPath, value);
        }
      } else if (inlineInput.mode === "rename" && inlineInput.targetPath) {
        await ops.renameItem(inlineInput.targetPath, value, inlineInput.kind);
      }
      setInlineInput(null);
    },
    [inlineInput, ops],
  );

  const handleMenuAction = useCallback(
    (action: ContextMenuAction) => {
      if (!contextMenu) return;
      const { node } = contextMenu;
      setContextMenu(null);

      switch (action) {
        case "new-file":
          setInlineInput({ parentPath: node.path, kind: "file", mode: "create" });
          break;
        case "new-dir":
          setInlineInput({ parentPath: node.path, kind: "directory", mode: "create" });
          break;
        case "rename":
          setInlineInput({
            parentPath: node.path.substring(0, node.path.lastIndexOf("/")),
            kind: node.kind,
            mode: "rename",
            initialValue: node.name,
            targetPath: node.path,
          });
          break;
        case "delete":
          void ops.deleteItem(node.path);
          break;
      }
    },
    [contextMenu, ops],
  );

  const handleNewFile = useCallback(() => {
    setInlineInput({ parentPath: rootPath, kind: "file", mode: "create" });
  }, [rootPath]);

  const handleNewDir = useCallback(() => {
    setInlineInput({ parentPath: rootPath, kind: "directory", mode: "create" });
  }, [rootPath]);

  return (
    <FileTreeView
      rootPath={rootPath}
      tree={tree}
      currentFilePath={currentFilePath}
      inlineInput={inlineInput}
      contextMenu={contextMenu}
      onSelectFile={onSelectFile}
      onToggleDir={toggleDir}
      onContextMenu={handleContextMenu}
      onContentContextMenu={handleContentContextMenu}
      onMenuAction={handleMenuAction}
      onInlineConfirm={handleInlineConfirm}
      onInlineCancel={() => setInlineInput(null)}
      onNewFile={handleNewFile}
      onNewDir={handleNewDir}
    />
  );
}
