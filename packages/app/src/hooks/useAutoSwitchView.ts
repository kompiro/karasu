import { useEffect, useRef, type Dispatch } from "react";
import type { AppAction, ActiveView } from "../state/app-reducer.js";

interface UseAutoSwitchViewArgs {
  entryPath: string | null;
  activeView: ActiveView;
  /** The view to switch to when `shouldSwitch` holds. */
  target: ActiveView;
  /**
   * Caller-computed predicate: the opened file warrants the switch (e.g.
   * deploy-only → deploy per #766, org-only → org per #817). Priority between
   * multiple auto-switch instances is encoded in these predicates (org yields
   * when the file also has a deploy block — see docs/design/deploy-only-render.md),
   * not in hook call order.
   */
  shouldSwitch: boolean;
  dispatch: Dispatch<AppAction>;
}

/**
 * Auto-switch the active tab away from "system" when opening a file that has
 * no system view but does have the `target` view. Fires once per `entryPath` —
 * if the user later clicks the system tab on the same file, we do not keep
 * re-forcing them onto the target view.
 */
export function useAutoSwitchView({
  entryPath,
  activeView,
  target,
  shouldSwitch,
  dispatch,
}: UseAutoSwitchViewArgs): void {
  const switchedEntryRef = useRef<string | null>(null);
  useEffect(() => {
    if (!entryPath) return;
    if (switchedEntryRef.current === entryPath) return;
    if (activeView !== "system") return;
    if (!shouldSwitch) return;
    switchedEntryRef.current = entryPath;
    dispatch({ type: "SET_ACTIVE_VIEW", activeView: target });
  }, [entryPath, activeView, target, shouldSwitch, dispatch]);
}
