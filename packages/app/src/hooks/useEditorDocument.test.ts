// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
import { format, tidyStyleSheet, InMemoryFileSystemProvider } from "@karasu-tools/core";
import { ObservableFileSystemProvider } from "../fs/observable-provider.js";
import type { AppAction } from "../state/app-reducer.js";
import { useEditorDocument } from "./useEditorDocument.js";

afterEach(cleanup);

function makeFs(): ObservableFileSystemProvider {
  return new ObservableFileSystemProvider(new InMemoryFileSystemProvider());
}

function setup({ currentFilePath = "/index.krs" as string | null, fileContent = "" } = {}) {
  const fs = makeFs();
  const dispatch = vi.fn<(a: AppAction) => void>();
  const recompile = vi.fn<() => void>();
  const { result } = renderHook(() =>
    useEditorDocument({ fs, currentFilePath, fileContent, dispatch, recompile }),
  );
  return { fs, dispatch, recompile, result };
}

describe("useEditorDocument — handleEditorChange", () => {
  it("dispatches UPDATE_FILE_CONTENT, persists the write, and recompiles", async () => {
    const { fs, dispatch, recompile, result } = setup({ currentFilePath: "/index.krs" });
    await act(async () => {
      await result.current.handleEditorChange('system S { service App { label "App" } }\n');
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_FILE_CONTENT",
      content: 'system S { service App { label "App" } }\n',
    });
    expect(recompile).toHaveBeenCalled();
    expect(await fs.readFile("/index.krs")).toBe('system S { service App { label "App" } }\n');
  });

  it("updates state but skips the write+recompile when no file is open", async () => {
    const { dispatch, recompile, result } = setup({ currentFilePath: null });
    await act(async () => {
      await result.current.handleEditorChange("x");
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "UPDATE_FILE_CONTENT", content: "x" });
    expect(recompile).not.toHaveBeenCalled();
  });
});

describe("useEditorDocument — handleFormat", () => {
  it("rewrites the source through format() when it changes", async () => {
    const messy = 'system S {\n\n\n  service App { label "App" }\n}\n';
    const formatted = format(messy);
    // Guard: this fixture must actually be reformatted, or the test is vacuous.
    expect(formatted).not.toBe(messy);

    const { dispatch, result } = setup({ currentFilePath: "/index.krs", fileContent: messy });
    act(() => result.current.handleFormat());
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: "UPDATE_FILE_CONTENT", content: formatted }),
    );
  });

  it("no-ops on empty content", () => {
    const { dispatch, result } = setup({ fileContent: "" });
    act(() => result.current.handleFormat());
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("swallows a FormatError (unparseable source) without dispatching", () => {
    const { dispatch, result } = setup({ fileContent: "system {{{ broken" });
    expect(() => act(() => result.current.handleFormat())).not.toThrow();
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("useEditorDocument — handleTidyStyle", () => {
  it("rewrites a .krs.style sheet through tidyStyleSheet() when it changes", async () => {
    const messy = "edge {\n\n\n  color: red;\n}\n";
    const tidied = tidyStyleSheet(messy);
    expect(tidied.changed).toBe(true);

    const { dispatch, result } = setup({
      currentFilePath: "/index.krs.style",
      fileContent: messy,
    });
    act(() => result.current.handleTidyStyle());
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_FILE_CONTENT",
        content: tidied.output,
      }),
    );
  });

  it("no-ops on empty content", () => {
    const { dispatch, result } = setup({ fileContent: "" });
    act(() => result.current.handleTidyStyle());
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("useEditorDocument — isStyleFile", () => {
  it("is true for a .krs.style file and false otherwise", () => {
    const style = setup({ currentFilePath: "/theme.krs.style" });
    expect(style.result.current.isStyleFile).toBe(true);
    const krs = setup({ currentFilePath: "/index.krs" });
    expect(krs.result.current.isStyleFile).toBe(false);
    const none = setup({ currentFilePath: null });
    expect(none.result.current.isStyleFile).toBe(false);
  });
});
