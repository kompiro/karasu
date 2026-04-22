import type { FileTreeNode } from "./types.js";

export type ContextMenuAction =
  | "new-file"
  | "new-dir"
  | "rename"
  | "delete"
  | "compare-with-current"
  | "snapshot-now"
  | "compare-with-snapshot";

interface ContextMenuProps {
  x: number;
  y: number;
  node: FileTreeNode;
  /** When true, this file is comparable against the currently open file (Issue #650). */
  canCompareWithCurrent?: boolean;
  /** When true, snapshot actions are available for this file (Issue #740). */
  canSnapshot?: boolean;
  onAction: (action: ContextMenuAction) => void;
}

export function ContextMenu({
  x,
  y,
  node,
  canCompareWithCurrent,
  canSnapshot,
  onAction,
}: ContextMenuProps) {
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
          {canCompareWithCurrent && (
            <>
              <button
                className="context-menu-item"
                onClick={() => onAction("compare-with-current")}
              >
                ⇄ Compare with current
              </button>
              <div className="context-menu-separator" />
            </>
          )}
          {canSnapshot && (
            <>
              <button className="context-menu-item" onClick={() => onAction("snapshot-now")}>
                ⤓ Snapshot now
              </button>
              <button
                className="context-menu-item"
                onClick={() => onAction("compare-with-snapshot")}
              >
                ⇄ Compare with snapshot…
              </button>
              <div className="context-menu-separator" />
            </>
          )}
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
