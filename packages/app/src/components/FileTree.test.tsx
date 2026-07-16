// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { FileTree } from "./FileTree.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * Component tests for the FileTree orchestration seam (AT-0005 AC-2..AC-6):
 * context-menu state, inline-input create/rename flows, and the
 * `useFileTreeOps` callbacks. `FileTreeView` (presentational) and
 * `useFileTreeOps` (FS mutations) have their own suites; these cases fence
 * the wiring in `FileTree.tsx` between them, which nothing else exercises
 * (Issue #1999, TPL-20260510-09).
 *
 * Deliberately not covered here: closing the context menu via Escape or an
 * outside click. Both ride document-level listeners that jsdom does not
 * model reliably (see `.claude/rules/testing.md`); they stay on the AT-0005
 * manual checklist.
 */

async function seedFs() {
  const fs = new InMemoryFileSystemProvider();
  await fs.mkdir("/project");
  await fs.writeFile("/project/existing.krs", "system Shop {}\n");
  await fs.mkdir("/project/sub");
  await fs.writeFile("/project/sub/inner.krs", "");
  return fs;
}

function renderTree(
  fs: InMemoryFileSystemProvider,
  overrides: Partial<Parameters<typeof FileTree>[0]> = {},
) {
  const props: Parameters<typeof FileTree>[0] = {
    rootPath: "/project",
    fs,
    currentFilePath: null,
    onSelectFile: vi.fn<(path: string) => void>(),
    onFileCreated: vi.fn<(path: string) => void>(),
    onFileDeleted: vi.fn<(path: string) => void>(),
    onFileRenamed: vi.fn<(oldPath: string, newPath: string) => void>(),
    ...overrides,
  };
  return { ...render(<FileTree {...props} />), props };
}

// The context menu is our own component (`file-tree/ContextMenu`), rendered
// inline — not a Radix portal — so document-scoped queries see it either way.
const menuItems = () =>
  Array.from(document.querySelectorAll(".context-menu-item")).map((el) => el.textContent);

const inlineInput = () => {
  const input = document.querySelector<HTMLInputElement>(".file-tree-inline-input");
  expect(input).not.toBeNull();
  return input as HTMLInputElement;
};

/** Expand `/project/sub` so create-inputs targeting it have a place to render. */
async function expandSubDir() {
  await userEvent.click(await screen.findByText("sub"));
  await screen.findByText("inner.krs");
}

describe("FileTree context menu (AT-0005)", () => {
  it("file context menu offers only Rename/Delete", async () => {
    const fs = await seedFs();
    renderTree(fs);

    fireEvent.contextMenu(await screen.findByText("existing.krs"));

    expect(menuItems()).toEqual(["Rename", "Delete"]);
  });

  it("directory context menu offers New File/New Folder/Rename/Delete", async () => {
    const fs = await seedFs();
    renderTree(fs);

    fireEvent.contextMenu(await screen.findByText("sub"));

    expect(menuItems()).toEqual(["New File", "New Folder", "Rename", "Delete"]);
  });

  it("Rename flow renames the file and re-selects it", async () => {
    const fs = await seedFs();
    const { props } = renderTree(fs, { currentFilePath: "/project/existing.krs" });

    fireEvent.contextMenu(await screen.findByText("existing.krs"));
    await userEvent.click(screen.getByText("Rename"));

    // The row is replaced by an inline input pre-filled with the current name.
    const input = inlineInput();
    expect(input.value).toBe("existing.krs");

    fireEvent.change(input, { target: { value: "renamed.krs" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(async () => {
      expect(await fs.exists("/project/existing.krs")).toBe(false);
    });
    // Content is preserved across the rename.
    expect(await fs.readFile("/project/renamed.krs")).toBe("system Shop {}\n");
    // Re-selection contract: ProjectModeApp re-selects the open editor file
    // at the new path from this callback (AC-3 / AC-6).
    expect(props.onFileRenamed).toHaveBeenCalledWith(
      "/project/existing.krs",
      "/project/renamed.krs",
    );
  });

  it("Delete confirms then removes and clears the editor", async () => {
    const fs = await seedFs();
    // FileTree does not inject a `confirm` hook into useFileTreeOps, so the
    // hook binds window.confirm — stub it before render.
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { props } = renderTree(fs, { currentFilePath: "/project/existing.krs" });

    fireEvent.contextMenu(await screen.findByText("existing.krs"));
    await userEvent.click(screen.getByText("Delete"));

    await waitFor(async () => {
      expect(await fs.exists("/project/existing.krs")).toBe(false);
    });
    expect(confirmSpy).toHaveBeenCalledWith('Delete "existing.krs"?');
    // Editor-clear contract: ProjectModeApp clears the editor for the open
    // file from this callback (AC-4 / AC-6).
    expect(props.onFileDeleted).toHaveBeenCalledWith("/project/existing.krs");
  });

  it("New File in a subdirectory creates the file there", async () => {
    const fs = await seedFs();
    const { props } = renderTree(fs);
    await expandSubDir();

    fireEvent.contextMenu(screen.getByText("sub"));
    await userEvent.click(screen.getByText("New File"));

    // Bare names default to `.krs` (AC-1); the file lands under /project/sub.
    fireEvent.change(inlineInput(), { target: { value: "nested" } });
    fireEvent.keyDown(inlineInput(), { key: "Enter" });

    await waitFor(async () => {
      expect(await fs.exists("/project/sub/nested.krs")).toBe(true);
    });
    expect(await fs.readFile("/project/sub/nested.krs")).toBe("");
    expect(props.onFileCreated).toHaveBeenCalledWith("/project/sub/nested.krs");
  });

  it("New Folder in a subdirectory creates the directory there", async () => {
    const fs = await seedFs();
    renderTree(fs);
    await expandSubDir();

    fireEvent.contextMenu(screen.getByText("sub"));
    await userEvent.click(screen.getByText("New Folder"));

    fireEvent.change(inlineInput(), { target: { value: "assets" } });
    fireEvent.keyDown(inlineInput(), { key: "Enter" });

    await waitFor(async () => {
      expect(await fs.exists("/project/sub/assets")).toBe(true);
    });
  });
});
