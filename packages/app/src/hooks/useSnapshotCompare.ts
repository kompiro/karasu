import { useCallback, useState } from "react";
import type { FileSystemProvider } from "@karasu-tools/core";
import type { SnapshotManager } from "../fs/snapshot-manager.js";
import { useTranslation } from "../i18n/index.js";

interface UseSnapshotCompareArgs {
  snapshotManager: SnapshotManager | null;
  projectRoot: string | null;
  currentFilePath: string | null;
  fileContent: string;
  fs: FileSystemProvider;
  /** Surface a failure to the user (banner / toast). */
  reportError: (message: string) => void;
}

interface SnapshotCompare {
  /** Absolute path whose snapshot picker is open, or null. */
  pickerFilePath: string | null;
  /** `pickerFilePath` relative to the project root (null when out of project). */
  pickerRelPath: string | null;
  /** Capture a manual snapshot of `path` (prompts for an optional label). */
  snapshotNow: (path: string) => Promise<void>;
  /** Open the snapshot picker for `path`. */
  compareWithSnapshot: (path: string) => void;
  closePicker: () => void;
}

const detailOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Manual snapshot capture + the compare-with-snapshot picker, extracted from
 * ProjectModeApp (#1547). `snapshotNow` catches capture failures and routes
 * them to `reportError` rather than letting them vanish (#1532).
 */
export function useSnapshotCompare({
  snapshotManager,
  projectRoot,
  currentFilePath,
  fileContent,
  fs,
  reportError,
}: UseSnapshotCompareArgs): SnapshotCompare {
  const { t } = useTranslation();
  const [pickerFilePath, setPickerFilePath] = useState<string | null>(null);

  const snapshotNow = useCallback(
    async (path: string) => {
      if (!snapshotManager || !projectRoot || !path.startsWith(`${projectRoot}/`)) return;
      const relPath = path.slice(projectRoot.length + 1);
      const label = window.prompt("Label this snapshot (optional):") ?? undefined;
      try {
        const content =
          path === currentFilePath ? fileContent : await fs.readFile(path).catch(() => "");
        await snapshotManager.capture(relPath, content, {
          trigger: "manual",
          label: label || undefined,
        });
      } catch (err) {
        reportError(t("project.error.snapshot", { detail: detailOf(err) }));
      }
    },
    [snapshotManager, projectRoot, currentFilePath, fileContent, fs, reportError, t],
  );

  const compareWithSnapshot = useCallback((path: string) => {
    setPickerFilePath(path);
  }, []);

  const closePicker = useCallback(() => setPickerFilePath(null), []);

  const pickerRelPath =
    pickerFilePath && projectRoot && pickerFilePath.startsWith(`${projectRoot}/`)
      ? pickerFilePath.slice(projectRoot.length + 1)
      : null;

  return { pickerFilePath, pickerRelPath, snapshotNow, compareWithSnapshot, closePicker };
}
