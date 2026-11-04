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

    it("reports whether the selection landed: a superseded read resolves to false", async () => {
      let releaseSlow: (content: string) => void = () => {};
      const fs = makeFs({
        readFile: vi.fn<(path: string) => Promise<string>>((path) =>
          path === "/slow.krs"
            ? new Promise<string>((resolve) => {
                releaseSlow = resolve;
              })
            : Promise.resolve("fast"),
        ),
      });
      const dispatch = vi.fn<() => void>();
      const { result } = renderHook(() => useFileSelection(fs, dispatch));

      let slow: Promise<boolean> = Promise.resolve(true);
      let fast = false;
      await act(async () => {
        slow = result.current.selectFile("/slow.krs");
        fast = await result.current.selectFile("/fast.krs");
        releaseSlow("slow");
      });

      expect(fast).toBe(true);
      expect(await slow).toBe(false);
    });

    // #3598: the boot opens a deep link's file from the project switch and
    // from the hash; neither request may read the other as superseding it.
    it("joins a request for the file already being read, and reads it once", async () => {
      let release: (content: string) => void = () => {};
      const fs = makeFs({
        readFile: vi.fn<(path: string) => Promise<string>>(
          () =>
            new Promise<string>((resolve) => {
              release = resolve;
            }),
        ),
      });
      const dispatch = vi.fn<() => void>();
      const { result } = renderHook(() => useFileSelection(fs, dispatch));

      let landed: boolean[] = [];
      await act(async () => {
        const first = result.current.selectFile("/a.krs");
        const second = result.current.selectFile("/a.krs");
        release("A");
        landed = await Promise.all([first, second]);
      });

      expect(landed).toEqual([true, true]);
      expect(fs.readFile).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledTimes(1);

      // Once it has landed, asking again reads the file again.
      await act(async () => {
        const again = result.current.selectFile("/a.krs");
        release("A2");
        await again;
      });
      expect(fs.readFile).toHaveBeenCalledTimes(2);
    });

    // #3598: the boot opens a deep link's file with index.krs as the
    // fallback, so a file that exists but cannot be read does not leave the
    // editor empty, unless the visitor asked for something else meanwhile.
    it("selects the fallback when the read of an existing file fails, unless a newer selection came", async () => {
      let failA: () => void = () => {};
      const fs = makeFs({
        readFile: vi.fn<(path: string) => Promise<string>>((path) =>
          path === "/a.krs"
            ? new Promise<string>((_, reject) => {
                failA = () => reject(new Error("I/O error"));
              })
            : Promise.resolve(`content of ${path}`),
        ),
        exists: vi.fn<(path: string) => Promise<boolean>>(async () => true),
      });
      vi.spyOn(console, "error").mockImplementation(() => {});
      const dispatch = vi.fn<() => void>();
      const { result } = renderHook(() => useFileSelection(fs, dispatch));

      let landed = true;
      await act(async () => {
        const a = result.current.selectFile("/a.krs");
        // A request for the same file joins the read and brings the fallback.
        void result.current.selectFile("/a.krs", "/index.krs");
        failA();
        landed = await a;
      });
      expect(landed).toBe(false);
      expect(dispatch).toHaveBeenCalledWith({
        type: "SELECT_FILE",
        path: "/index.krs",
        content: "content of /index.krs",
      });

      dispatch.mockClear();
      await act(async () => {
        const a = result.current.selectFile("/a.krs", "/index.krs");
        await result.current.selectFile("/b.krs");
        failA();
        await a;
      });
      expect(dispatch.mock.calls).toEqual([
        [{ type: "SELECT_FILE", path: "/b.krs", content: "content of /b.krs" }],
      ]);
      vi.restoreAllMocks();
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

      let landed = false;
      await act(async () => {
        landed = await result.current.selectFile("/missing.krs");
      });

      expect(landed).toBe(true);
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

      let landed = true;
      await act(async () => {
        landed = await result.current.selectFile("/exists.krs");
      });

      expect(landed).toBe(false);
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
