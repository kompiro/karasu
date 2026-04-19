import { describe, it, expect } from "vitest";
import { updateNode } from "./file-tree-tree.js";
import type { FileTreeNode } from "../components/file-tree/types.js";

const tree: FileTreeNode[] = [
  {
    name: "src",
    path: "/src",
    kind: "directory",
    expanded: false,
    children: [
      { name: "a.krs", path: "/src/a.krs", kind: "file" },
      {
        name: "inner",
        path: "/src/inner",
        kind: "directory",
        expanded: false,
      },
    ],
  },
  { name: "README", path: "/README", kind: "file" },
];

describe("updateNode", () => {
  it("applies updates to a top-level node", () => {
    const next = updateNode(tree, "/README", { name: "README.md" });
    expect(next[1].name).toBe("README.md");
    expect(next[0].name).toBe("src"); // sibling content unchanged
  });

  it("applies updates to a nested child", () => {
    const next = updateNode(tree, "/src/inner", { expanded: true });
    expect(next[0].children?.[1].expanded).toBe(true);
    expect(next[0].children?.[0].name).toBe("a.krs");
  });

  it("returns the original structure when path is not found", () => {
    const next = updateNode(tree, "/nope", { name: "x" });
    expect(next[0].name).toBe("src");
    expect(next[1].name).toBe("README");
  });

  it("is immutable — does not mutate the input", () => {
    const before = JSON.stringify(tree);
    updateNode(tree, "/src", { expanded: true });
    expect(JSON.stringify(tree)).toBe(before);
  });
});
