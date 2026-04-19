import { InlineInput } from "./InlineInput.js";
import type { FileTreeNode, InlineInputState } from "./types.js";

interface FileTreeItemProps {
  node: FileTreeNode;
  depth: number;
  currentFilePath: string | null;
  onSelectFile: (path: string) => void;
  onToggleDir: (node: FileTreeNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileTreeNode) => void;
  inlineInput: InlineInputState | null;
  onInlineConfirm: (value: string) => void;
  onInlineCancel: () => void;
}

export function FileTreeItem({
  node,
  depth,
  currentFilePath,
  onSelectFile,
  onToggleDir,
  onContextMenu,
  inlineInput,
  onInlineConfirm,
  onInlineCancel,
}: FileTreeItemProps) {
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
