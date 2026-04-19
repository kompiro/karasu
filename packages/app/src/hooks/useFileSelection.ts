import { useCallback, type Dispatch } from "react";
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
 *   On read failure (missing file, I/O error) falls back to empty content so
 *   the app still navigates; the mode-specific UI decides how to surface this.
 * - `selectFileWithContent(path, content)` dispatches SELECT_FILE directly for
 *   callers that already have the content (e.g. HTTP fetch in ServeMode,
 *   bootstrap sample in MemoryMode).
 */
export function useFileSelection(
  fs: FileSystemProvider,
  dispatch: Dispatch<AppAction>,
): UseFileSelectionResult {
  const selectFile = useCallback(
    async (path: string) => {
      try {
        const content = await fs.readFile(path);
        dispatch({ type: "SELECT_FILE", path, content });
      } catch {
        dispatch({ type: "SELECT_FILE", path, content: "" });
      }
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
