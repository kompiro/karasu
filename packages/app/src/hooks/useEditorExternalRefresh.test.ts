// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { ObservableFileSystemProvider } from "../fs/observable-provider.js";
import type { AppAction } from "../state/app-reducer.js";
import { useEditorExternalRefresh } from "./useEditorExternalRefresh.js";

function makeFs(): ObservableFileSystemProvider {
  return new ObservableFileSystemProvider(new InMemoryFileSystemProvider());
}

describe("useEditorExternalRefresh", () => {
  it("dispatches UPDATE_FILE_CONTENT when an external write changes the open file", async () => {
    const fs = makeFs();
    await fs.writeFile("/site.krs.style", "edge { color: red; }\n");
    const dispatch = vi.fn<(a: AppAction) => void>();
    renderHook(() =>
      useEditorExternalRefresh({
        fs,
        currentFilePath: "/site.krs.style",
        fileContent: "edge { color: red; }\n",
        dispatch,
      }),
    );

    // Reset the mock so the initial subscription doesn't count.
    dispatch.mockClear();

    // External write — direct call against the observable fs simulating a
    // GUI direction append.
    await fs.writeFile("/site.krs.style", "edge { color: red; }\nedge#A->B { direction: down; }\n");

    await waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_FILE_CONTENT",
        content: "edge { color: red; }\nedge#A->B { direction: down; }\n",
      });
    });
  });

  it("calls onRefresh after dispatch (recompile hook)", async () => {
    const fs = makeFs();
    await fs.writeFile("/a.krs.style", "/* original */\n");
    const dispatch = vi.fn<(a: AppAction) => void>();
    const onRefresh = vi.fn<() => void>();
    renderHook(() =>
      useEditorExternalRefresh({
        fs,
        currentFilePath: "/a.krs.style",
        fileContent: "/* original */\n",
        dispatch,
        onRefresh,
      }),
    );

    await fs.writeFile("/a.krs.style", "/* changed */\n");
    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("suppresses echo writes when disk content matches state.fileContent", async () => {
    const fs = makeFs();
    const content = "edge { color: red; }\n";
    await fs.writeFile("/echo.krs.style", content);
    const dispatch = vi.fn<(a: AppAction) => void>();
    renderHook(() =>
      useEditorExternalRefresh({
        fs,
        currentFilePath: "/echo.krs.style",
        fileContent: content, // already matches disk
        dispatch,
      }),
    );

    // Simulate the editor's own write: state and disk both equal `content`.
    await fs.writeFile("/echo.krs.style", content);

    // Give the watcher a beat to fire.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("ignores writes to other files", async () => {
    const fs = makeFs();
    await fs.writeFile("/open.krs.style", "open\n");
    await fs.writeFile("/other.krs.style", "other\n");
    const dispatch = vi.fn<(a: AppAction) => void>();
    renderHook(() =>
      useEditorExternalRefresh({
        fs,
        currentFilePath: "/open.krs.style",
        fileContent: "open\n",
        dispatch,
      }),
    );

    await fs.writeFile("/other.krs.style", "other-changed\n");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does nothing when currentFilePath is null", () => {
    const fs = makeFs();
    const dispatch = vi.fn<(a: AppAction) => void>();
    expect(() =>
      renderHook(() =>
        useEditorExternalRefresh({
          fs,
          currentFilePath: null,
          fileContent: "",
          dispatch,
        }),
      ),
    ).not.toThrow();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("disposes the previous subscription when currentFilePath changes", async () => {
    const fs = makeFs();
    await fs.writeFile("/first.krs.style", "first\n");
    await fs.writeFile("/second.krs.style", "second\n");
    const dispatch = vi.fn<(a: AppAction) => void>();
    const { rerender } = renderHook(
      ({ path, content }: { path: string; content: string }) =>
        useEditorExternalRefresh({
          fs,
          currentFilePath: path,
          fileContent: content,
          dispatch,
        }),
      { initialProps: { path: "/first.krs.style", content: "first\n" } },
    );

    rerender({ path: "/second.krs.style", content: "second\n" });

    // Touch the previously-watched file. Should not dispatch since we're
    // now subscribed to /second.krs.style.
    await fs.writeFile("/first.krs.style", "first-changed\n");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(dispatch).not.toHaveBeenCalled();

    // Touch the currently-watched file. Should dispatch.
    await fs.writeFile("/second.krs.style", "second-changed\n");
    await waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_FILE_CONTENT",
        content: "second-changed\n",
      });
    });
  });

  it("does not throw on a delete event for the open file", async () => {
    const fs = makeFs();
    await fs.writeFile("/x.krs.style", "x\n");
    const dispatch = vi.fn<(a: AppAction) => void>();
    renderHook(() =>
      useEditorExternalRefresh({
        fs,
        currentFilePath: "/x.krs.style",
        fileContent: "x\n",
        dispatch,
      }),
    );

    await fs.delete("/x.krs.style");
    await new Promise((resolve) => setTimeout(resolve, 10));
    // We don't have a "the file disappeared" UX yet — the hook just
    // ignores delete events. UPDATE_FILE_CONTENT must not be dispatched
    // with a stale read.
    expect(dispatch).not.toHaveBeenCalled();
  });
});
