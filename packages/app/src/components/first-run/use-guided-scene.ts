import { useEffect, useRef, useState, type Dispatch } from "react";
import type { Project } from "@karasu-tools/core";
import type { AppAction } from "../../state/app-reducer.js";
import { requestReveal } from "../../state/preview-reveal.js";
import type { Scene } from "./tour-steps.js";
import type { FileSelectionStatus } from "../../hooks/useFileSelection.js";
import { endDeepLinkRestore } from "../../state/deep-link-restore.js";

/** A scene to show in the project at `root`. A new `key` applies it again. */
export interface PendingScene {
  root: string;
  scene: Scene;
  key: string;
  /**
   * Apply it again when the visitor comes back to its project. A tour step
   * is still on screen, so its scene comes back with it; a one-off scene
   * has done its job once and must not override where the visitor went.
   */
  reapplyOnReturn: boolean;
  /**
   * A tour step resumed at boot (#3598). The boot's URL already opened the
   * scene's file and view, so the file is not selected again when it is open:
   * a second SELECT_FILE would only reset what the restoration applied.
   */
  resumed?: boolean;
}

interface UseGuidedSceneArgs {
  pending: PendingScene | null;
  currentProject: Project | null;
  currentFilePath: string | null;
  selectFile: (path: string) => Promise<FileSelectionStatus>;
  dispatch: Dispatch<AppAction>;
}

/**
 * Applies a guide scene once its project is open (#3566).
 *
 * A guide usually starts by creating a project, and switching to a project
 * auto-selects its `index.krs` (`useProjectInitialization`). The scene waits
 * until that selection has landed: selecting the scene's file before it would
 * be overwritten by the slower auto-select. After that, the scene goes through
 * the same actions a click does, in the order the reducer needs: selecting a
 * file resets the view, so the view is set last.
 *
 * The file is selected even when it is already open: `selectFile` supersedes
 * an earlier, slower selection, so a scene left before its file loaded cannot
 * land over the next one. Its diff and view are dropped the same way, by
 * checking after the read that the scene is still the current one (TPL-1534).
 * Leaving the project of a scene that asks to be re-applied forgets it was
 * applied, so coming back shows it again: the switch back resets the file and
 * the diff. A visitor who switches projects during the read keeps the scene's
 * diff off the other project the same way.
 *
 * A scene that names a node asks the preview to keep it in view; a scene that
 * names none, or the guide ending, withdraws the request (#3583).
 *
 * Returns the key of the scene that has landed: its file opened and its view
 * and diff were set, while it was still the current scene in its project.
 * Leaving the project forgets it, as for re-applying. The tour judges a step's
 * ask only once its scene has landed (#3599), apart from `appliedKey`, which
 * is set before the read so the scene is not applied twice.
 */
export function useGuidedScene({
  pending,
  currentProject,
  currentFilePath,
  selectFile,
  dispatch,
}: UseGuidedSceneArgs): string | null {
  const appliedKey = useRef<string | null>(null);
  // Forgotten as soon as the open project is not the scene's, during render,
  // so a return to it waits for the scene to land again.
  const openRoot = currentProject?.rootPath ?? null;
  const [landed, setLanded] = useState<{ key: string; root: string } | null>(null);
  if (landed && landed.root !== openRoot) setLanded(null);
  // The scene the guide is on now and the open project, read after an await.
  // Synced in an effect, which runs before the apply effect below.
  const currentKey = useRef<string | null>(null);
  const currentRoot = useRef<string | null>(null);
  useEffect(() => {
    currentKey.current = pending?.key ?? null;
    currentRoot.current = currentProject?.rootPath ?? null;
  }, [pending, currentProject]);

  // The guide has ended, or the guide is gone: the preview may move freely again.
  useEffect(() => {
    if (!pending) requestReveal(null);
  }, [pending]);
  useEffect(() => () => requestReveal(null), []);

  useEffect(() => {
    if (!pending) return;
    if (currentProject?.rootPath !== pending.root) {
      // The scene's node belongs to its project; coming back re-applies it.
      requestReveal(null);
      if (pending.reapplyOnReturn) appliedKey.current = null;
      return;
    }
    if (appliedKey.current === pending.key) return;
    if (!currentFilePath?.startsWith(`${pending.root}/`)) return;
    appliedKey.current = pending.key;
    // The previous scene's node no longer applies; this one sets its own once it lands.
    requestReveal(null);
    // A scene the visitor moved to is their navigation: what a deep link's
    // restoration still holds must not land over it (#3598). A resumed step
    // is the restoration's own scene.
    if (!pending.resumed) endDeepLinkRestore();

    const { root, scene, key } = pending;
    void (async () => {
      // A read that failed or was superseded leaves another file open; a
      // diff or view meant for the scene's file must not land on it.
      const path = `${root}/${scene.file}`;
      const opened =
        (pending.resumed && currentFilePath === path) || (await selectFile(path)) === "opened";
      if (!opened || currentKey.current !== key || currentRoot.current !== root) return;
      dispatch({
        type: "SET_COMPARE_SOURCE",
        source: scene.compareWith ? { kind: "file", path: `${root}/${scene.compareWith}` } : null,
      });
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: scene.view });
      requestReveal(scene.reveal ?? null);
      setLanded({ key, root });
    })();
  }, [pending, currentProject, currentFilePath, selectFile, dispatch]);

  return landed?.key ?? null;
}
