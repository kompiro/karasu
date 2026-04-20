import type { FileTreeNode } from "./types.js";

export type ContextMenuAction = "new-file" | "new-dir" | "rename" | "delete";

interface ContextMenuProps {
  x: number;
  y: number;
  node: FileTreeNode;
  onAction: (action: ContextMenuAction) => void;
}

export function ContextMenu({ x, y, node, onAction }: ContextMenuProps) {
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
