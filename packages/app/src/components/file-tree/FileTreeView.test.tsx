// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FileTreeView } from "./FileTreeView.js";
import type { FileTreeNode } from "./types.js";

afterEach(cleanup);

const sampleTree: FileTreeNode[] = [
  {
    name: "src",
    path: "/src",
    kind: "directory",
    expanded: true,
    children: [{ name: "index.krs", path: "/src/index.krs", kind: "file" }],
  },
  { name: "README.md", path: "/README.md", kind: "file" },
];

function renderView(overrides: Partial<Parameters<typeof FileTreeView>[0]> = {}) {
  const props: Parameters<typeof FileTreeView>[0] = {
    rootPath: "/",
    tree: sampleTree,
    currentFilePath: null,
    inlineInput: null,
    contextMenu: null,
    onSelectFile: vi.fn<() => void>(),
    onToggleDir: vi.fn<() => void>(),
    onContextMenu: vi.fn<() => void>(),
    onContentContextMenu: vi.fn<() => void>(),
    onMenuAction: vi.fn<() => void>(),
    onInlineConfirm: vi.fn<() => void>(),
    onInlineCancel: vi.fn<() => void>(),
    onNewFile: vi.fn<() => void>(),
    onNewDir: vi.fn<() => void>(),
    ...overrides,
  };
  return { ...render(<FileTreeView {...props} />), props };
}

describe("FileTreeView", () => {
  it("renders every file and directory from the supplied tree", () => {
    renderView();
    expect(screen.getByText("src")).toBeTruthy();
    expect(screen.getByText("index.krs")).toBeTruthy();
    expect(screen.getByText("README.md")).toBeTruthy();
  });

  it("applies the selected class to the current file", () => {
    const { container } = renderView({ currentFilePath: "/README.md" });
    const selected = container.querySelectorAll(".file-tree-item-selected");
    expect(selected.length).toBe(1);
    expect(selected[0].textContent).toContain("README.md");
  });

  it("calls onSelectFile when a file row is clicked", () => {
    const { props } = renderView();
    fireEvent.click(screen.getByText("index.krs"));
    expect(props.onSelectFile).toHaveBeenCalledWith("/src/index.krs");
  });

  it("calls onToggleDir when a directory row is clicked", () => {
    const onToggleDir = vi.fn<(node: FileTreeNode) => void>();
    renderView({ onToggleDir });
    fireEvent.click(screen.getByText("src"));
    expect(onToggleDir).toHaveBeenCalledTimes(1);
    expect(onToggleDir.mock.calls[0][0].path).toBe("/src");
  });

  it("renders the context menu when contextMenu state is set", () => {
    const node: FileTreeNode = { name: "src", path: "/src", kind: "directory" };
    renderView({ contextMenu: { x: 10, y: 20, node } });
    expect(screen.getByText("New File")).toBeTruthy();
    expect(screen.getByText("Rename")).toBeTruthy();
    expect(screen.getByText("Delete")).toBeTruthy();
  });

  it("fires onNewFile and onNewDir from the header buttons", () => {
    const { props } = renderView();
    fireEvent.click(screen.getByTitle("New File"));
    fireEvent.click(screen.getByTitle("New Folder"));
    expect(props.onNewFile).toHaveBeenCalled();
    expect(props.onNewDir).toHaveBeenCalled();
  });

  it("renders a root-level inline input when state points to rootPath", () => {
    const { container } = renderView({
      inlineInput: { parentPath: "/", kind: "file", mode: "create" },
    });
    expect(container.querySelectorAll(".file-tree-inline-input").length).toBe(1);
  });
});
