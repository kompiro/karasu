import { useEffect, useRef, type Dispatch } from "react";
import type { AppAction, ActiveView } from "../state/app-reducer.js";

interface UseAutoSwitchToOrgArgs {
  entryPath: string | null;
  activeView: ActiveView;
  hasOrg: boolean;
  hasSystem: boolean;
  hasDeployDiagram: boolean;
  dispatch: Dispatch<AppAction>;
}

/**
 * Auto-switch the active tab to "org" when opening an organization-only file
 * (Issue #817). Mirrors `useAutoSwitchToDeploy` (#766) — fires once per
 * `entryPath`, and yields to the deploy auto-switch when the file also has
 * a deploy block (priority: system > deploy > org, see
 * docs/design/deploy-only-render.md).
 */
export function useAutoSwitchToOrg({
  entryPath,
  activeView,
  hasOrg,
  hasSystem,
  hasDeployDiagram,
  dispatch,
}: UseAutoSwitchToOrgArgs): void {
  const switchedEntryRef = useRef<string | null>(null);
  useEffect(() => {
    if (!entryPath) return;
    if (switchedEntryRef.current === entryPath) return;
    if (activeView !== "system") return;
    if (!hasOrg) return;
    if (hasSystem) return;
    if (hasDeployDiagram) return;
    switchedEntryRef.current = entryPath;
    dispatch({ type: "SET_ACTIVE_VIEW", activeView: "org" });
  }, [entryPath, activeView, hasOrg, hasSystem, hasDeployDiagram, dispatch]);
}
