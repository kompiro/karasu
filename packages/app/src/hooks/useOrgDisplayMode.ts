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
      const next = typeof action === "function" ? action(prev === "tree") : action;
      // `false` returns to the grid from *any* mode, not just from Tree View.
      // The only caller that passes it is the history restore, which is an
      // authoritative statement of what the URL addresses: a hash with no
      // `#krs-org-tree` token means the grid. Leaving the dependency graph
      // drawn there would put the address bar and the pane in disagreement
      // with no way for the reader to reconcile them — and the dependency mode
      // has no token of its own to be restored from (#2636).
      return next ? "tree" : "grid";
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
