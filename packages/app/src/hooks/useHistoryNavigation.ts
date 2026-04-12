import { useCallback, useEffect, useRef } from "react";
import { sanitizeId } from "@karasu-tools/core";
import type { Dispatch } from "react";
import type { AppAction, ActiveView } from "../state/app-reducer.js";

// ─── Utilities (exported for testing) ────────────────────────────────────────

/**
 * Encodes activeView + viewPath into a URL hash string.
 *
 * Examples:
 *   ("deploy", [])                          → "#krs-deploy"
 *   ("deploy", [], false, "ECommerce")      → "#krs-deploy:ECommerce"
 *   ("system", [])                          → "#krs-system-root"
 *   ("system", ["Payment"])                 → "#krs-system-Payment"
 *   ("org", ["a", "b"])                     → "#krs-org-b"  (last segment only)
 *   ("org", [], true)                       → "#krs-org-tree"  (Tree View mode)
 *   ("org", [], false, "ecTeam")            → "#krs-org-root:ecTeam"
 */
export function buildHash(
  activeView: ActiveView,
  viewPath: string[],
  isOrgTreeView = false,
  highlightNodeId?: string | null,
): string {
  let base: string;
  if (activeView === "deploy") base = "#krs-deploy";
  else if (activeView === "org" && isOrgTreeView) base = "#krs-org-tree";
  else {
    const prefix = activeView === "org" ? "org" : "system";
    base =
      viewPath.length === 0
        ? `#krs-${prefix}-root`
        : `#krs-${prefix}-${sanitizeId(viewPath[viewPath.length - 1])}`;
  }
  return highlightNodeId ? `${base}:${highlightNodeId}` : base;
}

/**
 * Decodes a URL hash string into { activeView, nodeId, isOrgTreeView, highlightNodeId }.
 * nodeId is null for root and tree-view hashes.
 * highlightNodeId is extracted from the optional colon-suffixed segment (e.g. "#krs-deploy:ECommerce").
 * Returns null for unrecognized hashes.
 */
export function parseHash(hash: string): {
  activeView: ActiveView;
  nodeId: string | null;
  isOrgTreeView: boolean;
  highlightNodeId: string | null;
} | null {
  // Extract optional highlight suffix: "#krs-deploy:ECommerce" → base="#krs-deploy", highlight="ECommerce"
  const colonIdx = hash.indexOf(":", 1);
  let highlightNodeId: string | null = null;
  let base = hash;
  if (colonIdx !== -1) {
    highlightNodeId = hash.slice(colonIdx + 1) || null;
    base = hash.slice(0, colonIdx);
  }

  if (base === "#krs-deploy")
    return { activeView: "deploy", nodeId: null, isOrgTreeView: false, highlightNodeId };
  if (base === "#krs-org-tree")
    return { activeView: "org", nodeId: null, isOrgTreeView: true, highlightNodeId };
  const m = base.match(/^#krs-(system|org)-(.+)$/);
  if (!m) return null;
  const activeView = m[1] as "system" | "org";
  const nodeId = m[2] === "root" ? null : m[2];
  return { activeView, nodeId, isOrgTreeView: false, highlightNodeId };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useHistoryNavigation({
  activeView,
  viewPath,
  currentFilePath,
  nodePathIndex,
  orgPathIndex,
  dispatch,
  isOrgTreeView,
  setIsOrgTreeView,
  highlightedNodeId,
}: {
  activeView: ActiveView;
  viewPath: string[];
  currentFilePath: string | null;
  /** Maps system service/domain IDs to their viewPath in the system/deploy view. */
  nodePathIndex: Map<string, string[]>;
  /** Maps org team IDs to the viewPath needed to show that team's children. Optional. */
  orgPathIndex?: Map<string, string[]>;
  dispatch: Dispatch<AppAction>;
  isOrgTreeView: boolean;
  setIsOrgTreeView: (v: boolean) => void;
  highlightedNodeId: string | null;
}): {
  navigateActiveView: (view: ActiveView) => void;
  navigateViewPath: (path: string[]) => void;
} {
  // Tracks the current activeView without causing stale closures in effects
  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;

  // Stable ref for setIsOrgTreeView to avoid re-running mount-only effects
  const setIsOrgTreeViewRef = useRef(setIsOrgTreeView);
  setIsOrgTreeViewRef.current = setIsOrgTreeView;

  // When true, state changes are caused by popstate — skip pushing another history entry
  const isProgrammaticNavRef = useRef(false);

  // nodeId extracted from the initial hash, resolved once the relevant path index is ready
  const pendingNodeIdRef = useRef<string | null>(null);
  // activeView associated with the pending nodeId (determines which index to use)
  const pendingActiveViewRef = useRef<ActiveView>("system");

  // Skip the file-reset effect on initial mount
  const isFirstMountRef = useRef(true);

  // ① Parse initial hash on mount and set pending resolution if needed
  useEffect(() => {
    const parsed = parseHash(location.hash);
    if (!parsed) {
      history.replaceState(null, "", buildHash(activeView, viewPath, isOrgTreeView));
      return;
    }
    // Restore activeView from hash if different (include highlightNodeId in the transition)
    if (parsed.activeView !== activeViewRef.current) {
      dispatch({
        type: "SET_ACTIVE_VIEW",
        activeView: parsed.activeView,
        highlightNodeId: parsed.highlightNodeId,
      });
    } else if (parsed.highlightNodeId !== null) {
      dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: parsed.highlightNodeId });
    }
    // Restore org tree view mode
    if (parsed.isOrgTreeView) {
      setIsOrgTreeViewRef.current(true);
    }
    if (parsed.nodeId === null) {
      dispatch({ type: "SET_VIEW_PATH", path: [] });
    } else {
      pendingNodeIdRef.current = parsed.nodeId;
      pendingActiveViewRef.current = parsed.activeView;
      // Resolution is deferred to effect ② once the relevant path index is populated
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ② Resolve pendingNodeId once the relevant path index is available
  useEffect(() => {
    const nodeId = pendingNodeIdRef.current;
    if (nodeId === null) return;

    const isOrgPending = pendingActiveViewRef.current === "org";
    const index = isOrgPending ? orgPathIndex : nodePathIndex;
    if (!index || index.size === 0) return;

    const resolvedPath = index.get(nodeId) ?? [];
    pendingNodeIdRef.current = null;
    dispatch({ type: "SET_VIEW_PATH", path: resolvedPath });
  }, [nodePathIndex, orgPathIndex, dispatch]);

  // ③ Sync state changes → hash (push new history entry)
  useEffect(() => {
    if (isProgrammaticNavRef.current) return;
    const newHash = buildHash(activeView, viewPath, isOrgTreeView, highlightedNodeId);
    if (location.hash !== newHash) {
      history.pushState(null, "", newHash);
    }
  }, [activeView, viewPath, isOrgTreeView, highlightedNodeId]);

  // ④ Reset hash on file switch (skip initial mount)
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    history.replaceState(null, "", buildHash("system", []));
  }, [currentFilePath]);

  // ⑤ popstate handler — browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseHash(location.hash);
      if (!parsed) return;

      isProgrammaticNavRef.current = true;

      if (parsed.activeView !== activeViewRef.current) {
        dispatch({
          type: "SET_ACTIVE_VIEW",
          activeView: parsed.activeView,
          highlightNodeId: parsed.highlightNodeId,
        });
      } else {
        dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: parsed.highlightNodeId });
      }
      setIsOrgTreeViewRef.current(parsed.isOrgTreeView);

      const path =
        parsed.nodeId === null
          ? []
          : parsed.activeView === "org"
            ? (orgPathIndex?.get(parsed.nodeId) ?? [])
            : (nodePathIndex.get(parsed.nodeId) ?? []);
      dispatch({ type: "SET_VIEW_PATH", path });

      queueMicrotask(() => {
        isProgrammaticNavRef.current = false;
      });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [dispatch, nodePathIndex]);

  // ─── Public API ─────────────────────────────────────────────────────────────
  // Hash updates are handled by effect ③ watching state changes.

  const navigateActiveView = useCallback(
    (view: ActiveView) => {
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: view });
    },
    [dispatch],
  );

  const navigateViewPath = useCallback(
    (path: string[]) => {
      dispatch({ type: "SET_VIEW_PATH", path });
    },
    [dispatch],
  );

  return { navigateActiveView, navigateViewPath };
}
