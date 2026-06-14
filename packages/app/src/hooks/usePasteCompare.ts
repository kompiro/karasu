import { useCallback, useEffect, useState } from "react";
import type { Dispatch } from "react";
import type { FileSystemProvider } from "@karasu-tools/core";
import type { AppAction } from "../state/app-reducer.js";
import type { CompareSource } from "../fs/compare-source.js";

type PasteDialog = { mode: "edit"; initial: string } | { mode: "view"; content: string } | null;

interface UsePasteCompareArgs {
  fs: FileSystemProvider;
  projectRoot: string | null;
  compareSource: CompareSource | null;
  dispatch: Dispatch<AppAction>;
}

interface PasteCompare {
  pasteDialog: PasteDialog;
  /** Hidden temp-file path holding the pasted blob while diff mode is active. */
  pastedPath: string | null;
  openPasteDialog: () => void;
  viewPasted: () => Promise<void>;
  confirmPaste: (content: string) => Promise<void>;
  closePasteDialog: () => void;
}

/**
 * Paste-compare dialog state machine plus the hidden temp-file lifecycle,
 * extracted from ProjectModeApp (#1547). The pasted blob lives in a
 * dot-prefixed file the file-tree loader hides (Issue #739); this hook owns
 * writing it on confirm and deleting it whenever diff mode leaves the pasted
 * source, keeping OPFS clean across project switches.
 */
export function usePasteCompare({
  fs,
  projectRoot,
  compareSource,
  dispatch,
}: UsePasteCompareArgs): PasteCompare {
  const [pasteDialog, setPasteDialog] = useState<PasteDialog>(null);

  const pastedPath = projectRoot ? `${projectRoot}/.karasu-paste-compare.krs` : null;

  // Clean up the temp pasted file whenever diff mode exits (or the source is
  // no longer "pasted").
  useEffect(() => {
    if (!pastedPath) return;
    if (compareSource?.kind === "pasted" && compareSource.path === pastedPath) return;
    void (async () => {
      if (await fs.exists(pastedPath)) {
        await fs.delete(pastedPath);
      }
    })();
  }, [fs, pastedPath, compareSource]);

  const openPasteDialog = useCallback(() => {
    setPasteDialog({ mode: "edit", initial: "" });
  }, []);

  const viewPasted = useCallback(async () => {
    if (!pastedPath) return;
    const content = await fs.readFile(pastedPath);
    setPasteDialog({ mode: "view", content });
  }, [fs, pastedPath]);

  const confirmPaste = useCallback(
    async (content: string) => {
      if (!pastedPath) return;
      await fs.writeFile(pastedPath, content);
      dispatch({ type: "SET_COMPARE_SOURCE", source: { kind: "pasted", path: pastedPath } });
      setPasteDialog(null);
    },
    [fs, pastedPath, dispatch],
  );

  const closePasteDialog = useCallback(() => setPasteDialog(null), []);

  return { pasteDialog, pastedPath, openPasteDialog, viewPasted, confirmPaste, closePasteDialog };
}
