import { useCallback, useRef, type Dispatch } from "react";
import type { FileSystemProvider } from "@karasu-tools/core";
import type { AppAction } from "../state/app-reducer.js";

interface UseFileSelectionResult {
  selectFile: (path: string) => Promise<void>;
  selectFileWithContent: (path: string, content: string) => void;
}

/**
 * Shared file-selection logic for mode apps.
 *
 * - `selectFile(path)` reads from the filesystem and dispatches SELECT_FILE.
 *   A missing file falls back to empty content so the app still navigates
 *   (e.g. a freshly referenced path). A read failure on a file that *exists*
 *   does NOT fall back to an empty buffer — that buffer would be auto-saved
 *   over the real file on the next keystroke (#1536); the selection is aborted
 *   instead, leaving the current file intact.
 * - `selectFileWithContent(path, content)` dispatches SELECT_FILE directly for
 *   callers that already have the content (e.g. HTTP fetch in ServeMode,
 *   bootstrap sample in MemoryMode).
 */
export function useFileSelection(
  fs: FileSystemProvider,
  dispatch: Dispatch<AppAction>,
): UseFileSelectionResult {
  // Monotonic token so a slow read for an earlier click can't overwrite the
  // selection made by a later click (#1536).
  const latestSelectionRef = useRef(0);

  const selectFile = useCallback(
    async (path: string) => {
      const seq = ++latestSelectionRef.current;
      let content: string;
      try {
        content = await fs.readFile(path);
      } catch {
        // Distinguish "missing" (navigate to an empty buffer) from "exists but
        // the read transiently failed" — landing on an editable empty buffer in
        // the latter case lets the next keystroke clobber the real file (#1536).
        const stillExists = await fs.exists(path).catch(() => false);
        if (seq !== latestSelectionRef.current) return; // superseded by a newer selection
        if (stillExists) {
          // eslint-disable-next-line no-console
          console.error(`Failed to read existing file; keeping current selection: ${path}`);
          return;
        }
        content = "";
      }
      if (seq !== latestSelectionRef.current) return; // superseded by a newer selection
      dispatch({ type: "SELECT_FILE", path, content });
    },
    [fs, dispatch],
  );

  const selectFileWithContent = useCallback(
    (path: string, content: string) => {
      dispatch({ type: "SELECT_FILE", path, content });
    },
    [dispatch],
  );

  return { selectFile, selectFileWithContent };
}
