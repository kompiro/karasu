import { useEffect } from "react";
import type { FileSystemProvider } from "@karasu-tools/core";
import { normalizePath } from "@karasu-tools/core";
import type { AppAction } from "../state/app-reducer.js";

interface UseEditorExternalRefreshArgs {
  fs: FileSystemProvider;
  currentFilePath: string | null;
  fileContent: string;
  dispatch: (action: AppAction) => void;
  /**
   * Called after a refresh dispatch lands so the surrounding shell can
   * re-run the compile pipeline. Mirrors the recompile() invocation in
   * `handleEditorChange`. Optional — modes that drive recompile through
   * other channels can omit it.
   */
  onRefresh?: () => void;
}

/**
 * Subscribe to the wrapping `ObservableFileSystemProvider`'s watch events
 * for the file currently open in the editor. When an external write to
 * that path lands, refresh `state.fileContent` so Monaco's buffer matches
 * disk.
 *
 * Echo-loop guard: the editor's own auto-save flow
 * (`handleEditorChange` → `dispatch(UPDATE_FILE_CONTENT)` →
 * `fs.writeFile`) updates `state.fileContent` *before* the watch event
 * lands. Comparing the freshly-read disk content against `fileContent`
 * naturally suppresses our own writes — the diff is empty in that case.
 *
 * Conflict semantics for genuine external writes (GUI direction append,
 * AI translate output, snapshot writes): the cascade-tail-wins rule from
 * ADR-20260506-01 makes "later write wins" the authoritative outcome, so
 * surfacing the disk content into the buffer is the correct behaviour
 * even when the user has been typing — the disk already reflects the
 * merged state.
 */
export function useEditorExternalRefresh({
  fs,
  currentFilePath,
  fileContent,
  dispatch,
  onRefresh,
}: UseEditorExternalRefreshArgs): void {
  useEffect(() => {
    if (!currentFilePath || !fs.watch) return;
    const watchedPath = normalizePath(currentFilePath);
    let cancelled = false;
    const disposable = fs.watch(watchedPath, (event) => {
      if (cancelled) return;
      // We only care about changes to the file we're currently editing.
      // The watcher already filters to descendants of the watched path,
      // but on a `change` event for a sibling file the descendant filter
      // can still let it through, so guard explicitly on the path.
      if (event.type === "delete") return;
      if (normalizePath(event.path) !== watchedPath) return;
      void (async () => {
        let fresh: string;
        try {
          fresh = await fs.readFile(watchedPath);
        } catch {
          return;
        }
        if (cancelled) return;
        // Diff guard: skip our own writes. Comparing against the latest
        // `fileContent` (closure-captured below) is enough because state
        // is updated before the write completes.
        if (fresh === fileContent) return;
        dispatch({ type: "UPDATE_FILE_CONTENT", content: fresh });
        onRefresh?.();
      })();
    });
    return () => {
      cancelled = true;
      disposable?.dispose();
    };
  }, [fs, currentFilePath, fileContent, dispatch, onRefresh]);
}
