import { useCallback, useMemo } from "react";
import { format, FormatError, tidyStyleSheet } from "@karasu-tools/core";
import type { FileSystemProvider } from "@karasu-tools/core";
import type { AppAction } from "../state/app-reducer.js";
import { useEditorExternalRefresh } from "./useEditorExternalRefresh.js";
import { useSerializedFileWrite } from "./useSerializedFileWrite.js";

interface UseEditorDocumentArgs {
  fs: FileSystemProvider;
  currentFilePath: string | null;
  fileContent: string;
  dispatch: (action: AppAction) => void;
  /** Re-run the active view's compile after a document mutation. */
  recompile: () => void;
}

interface EditorDocument {
  /** Persist an editor edit: update state, serialize the write, recompile. */
  handleEditorChange: (value: string) => Promise<void>;
  /** Format the current `.krs` source; no-op on parse error or no change. */
  handleFormat: () => void;
  /** Tidy the current `.krs.style` source; no-op when nothing changes. */
  handleTidyStyle: () => void;
  /** True when the open file is a `.krs.style` stylesheet. */
  isStyleFile: boolean;
}

/**
 * Owns the editor document lifecycle that AppShell previously inlined:
 * serialized auto-save, the external-refresh watcher that reconciles Monaco
 * with disk (skipping our own write echoes — #1535), and the Format / Tidy
 * actions. Extracted from AppShell to shrink its god-component surface (#1541).
 */
export function useEditorDocument({
  fs,
  currentFilePath,
  fileContent,
  dispatch,
  recompile,
}: UseEditorDocumentArgs): EditorDocument {
  // Auto-save writes are serialized so per-keystroke writes can't reorder on
  // disk, and tracked so the external-refresh watcher recognizes them as
  // echoes (#1535).
  const { write: saveCurrentFile, isOwnWrite } = useSerializedFileWrite(fs, currentFilePath);

  const handleEditorChange = useCallback(
    async (value: string) => {
      dispatch({ type: "UPDATE_FILE_CONTENT", content: value });
      if (!currentFilePath) return;
      await saveCurrentFile(currentFilePath, value);
      recompile();
    },
    [currentFilePath, saveCurrentFile, dispatch, recompile],
  );

  // External writes (GUI direction append, AI translate, snapshot writes, …)
  // reach the editor via the ObservableFileSystemProvider. Refresh Monaco's
  // buffer when disk diverges from state — but not for our own serialized
  // auto-save echoes (#1535).
  useEditorExternalRefresh({
    fs,
    currentFilePath,
    fileContent,
    dispatch,
    onRefresh: recompile,
    isOwnWrite,
  });

  const handleFormat = useCallback(() => {
    if (!fileContent) return;
    let formatted: string;
    try {
      formatted = format(fileContent);
    } catch (e) {
      if (e instanceof FormatError) return;
      throw e;
    }
    if (formatted !== fileContent) {
      handleEditorChange(formatted);
    }
  }, [fileContent, handleEditorChange]);

  const handleTidyStyle = useCallback(() => {
    if (!fileContent) return;
    const result = tidyStyleSheet(fileContent);
    if (result.changed) {
      handleEditorChange(result.output);
    }
  }, [fileContent, handleEditorChange]);

  const isStyleFile = useMemo(
    () => currentFilePath?.endsWith(".krs.style") ?? false,
    [currentFilePath],
  );

  return { handleEditorChange, handleFormat, handleTidyStyle, isStyleFile };
}
