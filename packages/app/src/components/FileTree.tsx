import { useState, useEffect, useCallback, useRef } from "react";
import type { FileSystemProvider, DirEntry } from "@karasu-tools/core";

interface FileTreeNode {
  name: string;
  path: string;
  kind: "file" | "directory";
  children?: FileTreeNode[];
  expanded?: boolean;
}

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

interface ContextMenuState {
  x: number;
  y: number;
  node: FileTreeNode;
}

interface InlineInputState {
  parentPath: string;
  kind: "file" | "directory";
  mode: "create" | "rename";
  initialValue?: string;
  targetPath?: string;
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

  // Close context menu on outside click or Escape
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

  // File operations
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
    [fs, reload, onFileDeleted],
  );

  // Inline input confirm
  const handleInlineConfirm = useCallback(
    async (value: string) => {
      if (!inlineInput || !value.trim()) {
        setInlineInput(null);
        return;
      }

      if (inlineInput.mode === "create") {
        if (inlineInput.kind === "file") {
          await createFile(inlineInput.parentPath, value);
        } else {
          await createDir(inlineInput.parentPath, value);
        }
      } else if (inlineInput.mode === "rename" && inlineInput.targetPath) {
        await renameItem(inlineInput.targetPath, value, inlineInput.kind);
      }

      setInlineInput(null);
    },
    [inlineInput, createFile, createDir, renameItem],
  );

  // Context menu actions
  const handleMenuAction = useCallback(
    (action: string) => {
      if (!contextMenu) return;
      const { node } = contextMenu;
      setContextMenu(null);

      switch (action) {
        case "new-file":
          setInlineInput({
            parentPath: node.path,
            kind: "file",
            mode: "create",
          });
          break;
        case "new-dir":
          setInlineInput({
            parentPath: node.path,
            kind: "directory",
            mode: "create",
          });
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
          deleteItem(node.path);
          break;
      }
    },
    [contextMenu, deleteItem],
  );

  // Header button handlers
  const handleNewFile = useCallback(() => {
    setInlineInput({ parentPath: rootPath, kind: "file", mode: "create" });
  }, [rootPath]);

  const handleNewDir = useCallback(() => {
    setInlineInput({
      parentPath: rootPath,
      kind: "directory",
      mode: "create",
    });
  }, [rootPath]);

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <span>Files</span>
        <div className="file-tree-header-actions">
          <button className="file-tree-header-btn" onClick={handleNewFile} title="New File">
            +File
          </button>
          <button className="file-tree-header-btn" onClick={handleNewDir} title="New Folder">
            +Dir
          </button>
        </div>
      </div>
      <div className="file-tree-content" onContextMenu={handleContentContextMenu}>
        {/* Root-level inline input */}
        {inlineInput && inlineInput.parentPath === rootPath && inlineInput.mode === "create" && (
          <InlineInput
            depth={0}
            initialValue=""
            onConfirm={handleInlineConfirm}
            onCancel={() => setInlineInput(null)}
          />
        )}
        {tree.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            depth={0}
            currentFilePath={currentFilePath}
            onSelectFile={onSelectFile}
            onToggleDir={toggleDir}
            onContextMenu={handleContextMenu}
            inlineInput={inlineInput}
            onInlineConfirm={handleInlineConfirm}
            onInlineCancel={() => setInlineInput(null)}
          />
        ))}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          onAction={handleMenuAction}
        />
      )}
    </div>
  );
}

function FileTreeItem({
  node,
  depth,
  currentFilePath,
  onSelectFile,
  onToggleDir,
  onContextMenu,
  inlineInput,
  onInlineConfirm,
  onInlineCancel,
}: {
  node: FileTreeNode;
  depth: number;
  currentFilePath: string | null;
  onSelectFile: (path: string) => void;
  onToggleDir: (node: FileTreeNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileTreeNode) => void;
  inlineInput: InlineInputState | null;
  onInlineConfirm: (value: string) => void;
  onInlineCancel: () => void;
}) {
  const isSelected = node.path === currentFilePath;
  const isDir = node.kind === "directory";
  const isRenaming = inlineInput?.mode === "rename" && inlineInput?.targetPath === node.path;

  const handleClick = () => {
    if (isDir) {
      onToggleDir(node);
    } else {
      onSelectFile(node.path);
    }
  };

  if (isRenaming) {
    return (
      <div style={{ paddingLeft: `${8 + depth * 16}px` }}>
        <InlineInput
          depth={0}
          initialValue={inlineInput!.initialValue ?? node.name}
          onConfirm={onInlineConfirm}
          onCancel={onInlineCancel}
        />
      </div>
    );
  }

  return (
    <>
      <div
        className={`file-tree-item ${isSelected ? "file-tree-item-selected" : ""}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        <span className="file-tree-icon">
          {isDir ? (node.expanded ? "\u25BE" : "\u25B8") : "\u00A0\u00A0"}
        </span>
        <span className="file-tree-name">{node.name}</span>
      </div>
      {isDir && node.expanded && (
        <>
          {/* Inline input for creating inside this directory */}
          {inlineInput && inlineInput.parentPath === node.path && inlineInput.mode === "create" && (
            <InlineInput
              depth={depth + 1}
              initialValue=""
              onConfirm={onInlineConfirm}
              onCancel={onInlineCancel}
            />
          )}
          {node.children?.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              currentFilePath={currentFilePath}
              onSelectFile={onSelectFile}
              onToggleDir={onToggleDir}
              onContextMenu={onContextMenu}
              inlineInput={inlineInput}
              onInlineConfirm={onInlineConfirm}
              onInlineCancel={onInlineCancel}
            />
          ))}
        </>
      )}
    </>
  );
}

function InlineInput({
  depth,
  initialValue,
  onConfirm,
  onCancel,
}: {
  depth: number;
  initialValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    // Delay focus to avoid React 18 StrictMode double-mount blur issue
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleDone = useCallback(
    (value: string) => {
      if (handledRef.current) return;
      handledRef.current = true;
      if (value.trim()) {
        onConfirm(value.trim());
      } else {
        onCancel();
      }
    },
    [onConfirm, onCancel],
  );

  return (
    <div style={{ paddingLeft: `${8 + depth * 16}px` }}>
      <input
        ref={inputRef}
        className="file-tree-inline-input"
        defaultValue={initialValue}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleDone((e.target as HTMLInputElement).value);
          } else if (e.key === "Escape") {
            if (!handledRef.current) {
              handledRef.current = true;
              onCancel();
            }
          }
        }}
        onBlur={(e) => handleDone(e.target.value)}
      />
    </div>
  );
}

function ContextMenu({
  x,
  y,
  node,
  onAction,
}: {
  x: number;
  y: number;
  node: FileTreeNode;
  onAction: (action: string) => void;
}) {
  const isDir = node.kind === "directory";
  const isNamedNode = node.name !== "";

  return (
    <div className="context-menu" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      {isDir && (
        <>
          <button className="context-menu-item" onClick={() => onAction("new-file")}>
            New File
          </button>
          <button className="context-menu-item" onClick={() => onAction("new-dir")}>
            New Folder
          </button>
          {isNamedNode && <div className="context-menu-separator" />}
        </>
      )}
      {isNamedNode && (
        <>
          <button className="context-menu-item" onClick={() => onAction("rename")}>
            Rename
          </button>
          <button
            className="context-menu-item context-menu-item-danger"
            onClick={() => onAction("delete")}
          >
            Delete
          </button>
        </>
      )}
    </div>
  );
}

async function loadDir(dirPath: string, fs: FileSystemProvider): Promise<FileTreeNode[]> {
  try {
    const entries = await fs.readDir(dirPath);
    return entries.map((entry: DirEntry) => ({
      name: entry.name,
      path: `${dirPath}/${entry.name}`,
      kind: entry.kind,
      expanded: false,
    }));
  } catch {
    return [];
  }
}

function updateNode(
  nodes: FileTreeNode[],
  path: string,
  updates: Partial<FileTreeNode>,
): FileTreeNode[] {
  return nodes.map((node) => {
    if (node.path === path) {
      return { ...node, ...updates };
    }
    if (node.children) {
      return { ...node, children: updateNode(node.children, path, updates) };
    }
    return node;
  });
}

async function copyDirRecursive(
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
