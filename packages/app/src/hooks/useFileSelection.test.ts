// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useFileSelection } from "./useFileSelection.js";
import type { FileSystemProvider } from "@karasu-tools/core";

afterEach(cleanup);

function makeFs(overrides: Partial<FileSystemProvider> = {}): FileSystemProvider {
  return {
    readFile: vi.fn<(path: string) => Promise<string>>(async () => ""),
    writeFile: vi.fn<(path: string, content: string) => Promise<void>>(async () => {}),
    readDir: vi.fn<(path: string) => Promise<never[]>>(async () => []),
    exists: vi.fn<(path: string) => Promise<boolean>>(async () => true),
    delete: vi.fn<(path: string) => Promise<void>>(async () => {}),
    mkdir: vi.fn<(path: string) => Promise<void>>(async () => {}),
    ...overrides,
  } as FileSystemProvider;
}

describe("useFileSelection", () => {
  describe("selectFile", () => {
    it("reads content from fs and dispatches SELECT_FILE", async () => {
      const fs = makeFs({
        readFile: vi.fn<(path: string) => Promise<string>>(async () => "hello"),
      });
      const dispatch = vi.fn<() => void>();
      const { result } = renderHook(() => useFileSelection(fs, dispatch));

      await act(async () => {
        await result.current.selectFile("/a.krs");
      });

      expect(fs.readFile).toHaveBeenCalledWith("/a.krs");
      expect(dispatch).toHaveBeenCalledWith({
        type: "SELECT_FILE",
        path: "/a.krs",
        content: "hello",
      });
    });

    it("falls back to empty content when the file does not exist", async () => {
      const fs = makeFs({
        readFile: vi.fn<(path: string) => Promise<string>>(async () => {
          throw new Error("not found");
        }),
        exists: vi.fn<(path: string) => Promise<boolean>>(async () => false),
      });
      const dispatch = vi.fn<() => void>();
      const { result } = renderHook(() => useFileSelection(fs, dispatch));

      await act(async () => {
        await result.current.selectFile("/missing.krs");
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: "SELECT_FILE",
        path: "/missing.krs",
        content: "",
      });
    });

    // #1536: a transient read failure on a file that EXISTS must not land the
    // editor on an empty buffer — the next keystroke would auto-save "" over
    // the real file. Abort the selection instead of clobbering.
    it("does not clobber an existing file when the read transiently fails", async () => {
      const fs = makeFs({
        readFile: vi.fn<(path: string) => Promise<string>>(async () => {
          throw new Error("I/O error");
        }),
        exists: vi.fn<(path: string) => Promise<boolean>>(async () => true),
      });
      const dispatch = vi.fn<() => void>();
      const { result } = renderHook(() => useFileSelection(fs, dispatch));

      await act(async () => {
        await result.current.selectFile("/exists.krs");
      });

      expect(dispatch).not.toHaveBeenCalled();
    });

    // #1536: rapid clicks A then B — if A's read resolves after B's, only B's
    // selection must win (no stale overwrite by the slower earlier read).
    it("lets the latest selection win when reads resolve out of order", async () => {
      const resolvers: Record<string, (content: string) => void> = {};
      const fs = makeFs({
        readFile: vi.fn<(path: string) => Promise<string>>(
          (path) => new Promise<string>((resolve) => (resolvers[path] = resolve)),
        ),
      });
      const dispatch = vi.fn<() => void>();
      const { result } = renderHook(() => useFileSelection(fs, dispatch));

      await act(async () => {
        const a = result.current.selectFile("/a.krs");
        const b = result.current.selectFile("/b.krs");
        // B resolves first, then the slower A — A must be discarded as stale.
        resolvers["/b.krs"]("B content");
        resolvers["/a.krs"]("A content");
        await Promise.all([a, b]);
      });

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith({
        type: "SELECT_FILE",
        path: "/b.krs",
        content: "B content",
      });
    });
  });

  describe("selectFileWithContent", () => {
    it("dispatches SELECT_FILE without reading from fs", () => {
      const fs = makeFs();
      const dispatch = vi.fn<() => void>();
      const { result } = renderHook(() => useFileSelection(fs, dispatch));

      act(() => {
        result.current.selectFileWithContent("/b.krs", "content");
      });

      expect(fs.readFile).not.toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledWith({
        type: "SELECT_FILE",
        path: "/b.krs",
        content: "content",
      });
    });
  });

  describe("referential stability", () => {
    it("returns stable callbacks when fs and dispatch do not change", () => {
      const fs = makeFs();
      const dispatch = vi.fn<() => void>();
      const { result, rerender } = renderHook(() => useFileSelection(fs, dispatch));

      const first = result.current;
      rerender();
      expect(result.current.selectFile).toBe(first.selectFile);
      expect(result.current.selectFileWithContent).toBe(first.selectFileWithContent);
    });
  });
});
