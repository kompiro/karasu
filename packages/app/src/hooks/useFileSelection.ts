import { useCallback, useRef, type Dispatch } from "react";
import type { FileSystemProvider } from "@karasu-tools/core";
import type { AppAction } from "../state/app-reducer.js";

interface InFlightSelection {
  path: string;
  fallback: string | undefined;
  landed: Promise<boolean>;
}

interface UseFileSelectionResult {
  /**
   * Resolves to whether the selection landed (false when superseded by
   * another file or aborted). A request for the file already being read
   * joins that read. When the read fails and nothing newer was asked for,
   * `fallback` is selected instead (#3598).
   */
  selectFile: (path: string, fallback?: string) => Promise<boolean>;
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
  // The latest selection while its read is in flight. Asking for the same
  // file again joins it instead of superseding it (#3598): the boot opens the
  // file a deep link names from the project switch and from the hash, and
  // neither should read the other's request as failed.
  const inFlightRef = useRef<InFlightSelection | null>(null);

  const selectFile = useCallback(
    (path: string, fallback?: string) => {
      const select = (target: string, orElse?: string): Promise<boolean> => {
        const joined = inFlightRef.current;
        if (joined?.path === target) {
          joined.fallback ??= orElse;
          return joined.landed;
        }
        const seq = ++latestSelectionRef.current;
        // A later request for the same file may add the fallback while this reads.
        const request: Omit<InFlightSelection, "landed"> = { path: target, fallback: orElse };
        const landed = (async () => {
          let content: string;
          try {
            content = await fs.readFile(target);
          } catch {
            // Distinguish "missing" (navigate to an empty buffer) from "exists but
            // the read transiently failed" — landing on an editable empty buffer in
            // the latter case lets the next keystroke clobber the real file (#1536).
            const stillExists = await fs.exists(target).catch(() => false);
            if (seq !== latestSelectionRef.current) return false; // superseded by a newer selection
            if (stillExists) {
              // eslint-disable-next-line no-console
              console.error(`Failed to read existing file; keeping current selection: ${target}`);
              // Nothing newer was asked for, so the fallback opens instead.
              if (request.fallback) void select(request.fallback);
              return false;
            }
            content = "";
          }
          if (seq !== latestSelectionRef.current) return false; // superseded by a newer selection
          dispatch({ type: "SELECT_FILE", path: target, content });
          return true;
        })().finally(() => {
          if (seq === latestSelectionRef.current) inFlightRef.current = null;
        });
        inFlightRef.current = Object.assign(request, { landed });
        return landed;
      };
      return select(path, fallback);
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
