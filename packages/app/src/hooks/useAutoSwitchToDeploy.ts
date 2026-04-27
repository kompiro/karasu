import { useEffect, useRef, type Dispatch } from "react";
import type { AppAction, ActiveView } from "../state/app-reducer.js";

interface UseAutoSwitchToDeployArgs {
  entryPath: string | null;
  activeView: ActiveView;
  hasDeployDiagram: boolean;
  hasSystem: boolean;
  dispatch: Dispatch<AppAction>;
}

/**
 * Auto-switch the active tab to "deploy" when opening a deploy-only file
 * (Issue #766). Fires once per `entryPath` — if the user later clicks the
 * system tab on the same file, we do not keep re-forcing them onto deploy.
 */
export function useAutoSwitchToDeploy({
  entryPath,
  activeView,
  hasDeployDiagram,
  hasSystem,
  dispatch,
}: UseAutoSwitchToDeployArgs): void {
  const switchedEntryRef = useRef<string | null>(null);
  useEffect(() => {
    if (!entryPath) return;
    if (switchedEntryRef.current === entryPath) return;
    if (activeView !== "system") return;
    if (!hasDeployDiagram) return;
    if (hasSystem) return;
    switchedEntryRef.current = entryPath;
    dispatch({ type: "SET_ACTIVE_VIEW", activeView: "deploy" });
  }, [entryPath, activeView, hasDeployDiagram, hasSystem, dispatch]);
}
