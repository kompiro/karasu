import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Which of the org tab's modes is drawn.
 *
 * `grid` is the drill-down the tab has always opened in; `tree` is ADR-309's
 * second mode; `dependencies` is the derived team-dependency graph (#2636).
 */
type OrgDisplayMode = "grid" | "tree" | "dependencies";

export interface OrgDisplayModeControls {
  mode: OrgDisplayMode;
  isOrgTreeViewOpen: boolean;
  isTeamDependenciesOpen: boolean;
  /**
   * Boolean setter for Tree View, kept in the shape `useHistoryNavigation`
   * already consumes — a deep permalink restores the mode by setting this.
   */
  setOrgTreeView: Dispatch<SetStateAction<boolean>>;
  toggleOrgTreeView: () => void;
  toggleTeamDependencies: () => void;
}

/**
 * Own the org tab's mode as **one** value, and project the booleans the
 * consumers read.
 *
 * The alternative — one `useState<boolean>` per mode — has to keep an
 * invariant ("at most one is true") that nothing enforces, and every consumer
 * that reads both has to decide what two `true`s mean. Holding a single value
 * and deriving the flags removes the question instead of answering it in
 * several places (TPL-1032: no second copy of state to drift).
 *
 * The flags stay in the public shape because the permalink and share paths
 * address Tree View by name (`#krs-org-tree`), and renaming that would break
 * links people have already saved.
 */
export function useOrgDisplayMode(): OrgDisplayModeControls {
  const [mode, setMode] = useState<OrgDisplayMode>("grid");

  const setOrgTreeView = useCallback<Dispatch<SetStateAction<boolean>>>((action) => {
    setMode((prev) => {
      const wasOpen = prev === "tree";
      const next = typeof action === "function" ? action(wasOpen) : action;
      if (next) return "tree";
      // Turning Tree View off returns to the grid only if it was on. A `false`
      // arriving while the dependency graph is drawn must not close that too —
      // the permalink restore writes `false` on every navigation that is not a
      // tree link.
      return wasOpen ? "grid" : prev;
    });
  }, []);

  const toggleOrgTreeView = useCallback(() => {
    setMode((prev) => (prev === "tree" ? "grid" : "tree"));
  }, []);

  const toggleTeamDependencies = useCallback(() => {
    setMode((prev) => (prev === "dependencies" ? "grid" : "dependencies"));
  }, []);

  return {
    mode,
    isOrgTreeViewOpen: mode === "tree",
    isTeamDependenciesOpen: mode === "dependencies",
    setOrgTreeView,
    toggleOrgTreeView,
    toggleTeamDependencies,
  };
}
