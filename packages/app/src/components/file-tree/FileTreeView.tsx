import { ContextMenu, type ContextMenuAction } from "./ContextMenu.js";
import { FileTreeItem } from "./FileTreeItem.js";
import { InlineInput } from "./InlineInput.js";
import type { ContextMenuState, FileTreeNode, InlineInputState } from "./types.js";

interface FileTreeViewProps {
  rootPath: string;
  tree: FileTreeNode[];
  currentFilePath: string | null;
  inlineInput: InlineInputState | null;
  contextMenu: ContextMenuState | null;
  onSelectFile: (path: string) => void;
  onToggleDir: (node: FileTreeNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileTreeNode) => void;
  onContentContextMenu: (e: React.MouseEvent) => void;
  onMenuAction: (action: ContextMenuAction) => void;
  onInlineConfirm: (value: string) => void;
  onInlineCancel: () => void;
  onNewFile: () => void;
  onNewDir: () => void;
  /** When true, the context menu shows a "Compare with current" entry for files (Issue #650). */
  canCompareContextNode?: boolean;
  /** When true, the context menu shows snapshot entries for `.krs` files (Issue #740). */
  canSnapshotContextNode?: boolean;
  /**
   * When provided, renders a header button that opens the paste-compare
   * dialog (Issue #739). Called with no args.
   */
  onCompareWithPaste?: () => void;
}

/**
 * Pure presentational layer for the FileTree sidebar. Takes fully-resolved
 * tree data + state and callbacks; has no direct dependency on the file
 * system. All mutations flow back through the handlers.
 */
export function FileTreeView({
  rootPath,
  tree,
  currentFilePath,
  inlineInput,
  contextMenu,
  onSelectFile,
  onToggleDir,
  onContextMenu,
  onContentContextMenu,
  onMenuAction,
  onInlineConfirm,
  onInlineCancel,
  onNewFile,
  onNewDir,
  canCompareContextNode,
  canSnapshotContextNode,
  onCompareWithPaste,
}: FileTreeViewProps) {
  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <span>Files</span>
        <div className="file-tree-header-actions">
          {onCompareWithPaste && (
            <button
              className="file-tree-header-btn"
              onClick={onCompareWithPaste}
              title="Compare with pasted .krs"
            >
              ⇄ Paste
            </button>
          )}
          <button className="file-tree-header-btn" onClick={onNewFile} title="New File">
            +File
          </button>
          <button className="file-tree-header-btn" onClick={onNewDir} title="New Folder">
            +Dir
          </button>
        </div>
      </div>
      <div className="file-tree-content" onContextMenu={onContentContextMenu}>
        {inlineInput && inlineInput.parentPath === rootPath && inlineInput.mode === "create" && (
          <InlineInput
            depth={0}
            initialValue=""
            onConfirm={onInlineConfirm}
            onCancel={onInlineCancel}
          />
        )}
        {tree.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            depth={0}
            currentFilePath={currentFilePath}
            onSelectFile={onSelectFile}
            onToggleDir={onToggleDir}
            onContextMenu={onContextMenu}
            inlineInput={inlineInput}
            onInlineConfirm={onInlineConfirm}
            onInlineCancel={onInlineCancel}
          />
        ))}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          canCompareWithCurrent={canCompareContextNode}
          canSnapshot={canSnapshotContextNode}
          onAction={onMenuAction}
        />
      )}
    </div>
  );
}
