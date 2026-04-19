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

    it("falls back to empty content when fs.readFile throws", async () => {
      const fs = makeFs({
        readFile: vi.fn<(path: string) => Promise<string>>(async () => {
          throw new Error("not found");
        }),
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
