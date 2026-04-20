export interface FileTreeNode {
  name: string;
  path: string;
  kind: "file" | "directory";
  children?: FileTreeNode[];
  expanded?: boolean;
}

export interface ContextMenuState {
  x: number;
  y: number;
  node: FileTreeNode;
}

export interface InlineInputState {
  parentPath: string;
  kind: "file" | "directory";
  mode: "create" | "rename";
  initialValue?: string;
  targetPath?: string;
}
