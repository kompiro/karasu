import { useCallback, useEffect, useRef } from "react";
import { sanitizeId } from "@karasu-tools/core";
import type { Dispatch } from "react";
import type { AppAction, ActiveView } from "../state/app-reducer.js";

// ─── Utilities (exported for testing) ────────────────────────────────────────

/**
 * Encodes activeView + viewPath into a URL hash string.
 *
 * Examples:
 *   ("deploy", [])             → "#krs-deploy"
 *   ("system", [])             → "#krs-system-root"
 *   ("system", ["Payment"])    → "#krs-system-Payment"
 *   ("org", ["a", "b"])        → "#krs-org-b"  (last segment only)
 */
export function buildHash(activeView: ActiveView, viewPath: string[]): string {
  if (activeView === "deploy") return "#krs-deploy";
  const prefix = activeView === "org" ? "org" : "system";
  if (viewPath.length === 0) return `#krs-${prefix}-root`;
  return `#krs-${prefix}-${sanitizeId(viewPath[viewPath.length - 1])}`;
}

/**
 * Decodes a URL hash string into { activeView, nodeId }.
 * nodeId is null for root views.
 * Returns null for unrecognized hashes.
 */
export function parseHash(hash: string): { activeView: ActiveView; nodeId: string | null } | null {
  if (hash === "#krs-deploy") return { activeView: "deploy", nodeId: null };
  const m = hash.match(/^#krs-(system|org)-(.+)$/);
  if (!m) return null;
  const activeView = m[1] as "system" | "org";
  const nodeId = m[2] === "root" ? null : m[2];
  return { activeView, nodeId };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useHistoryNavigation({
  activeView,
  viewPath,
  currentFilePath,
  nodePathIndex,
  dispatch,
}: {
  activeView: ActiveView;
  viewPath: string[];
  currentFilePath: string | null;
  nodePathIndex: Map<string, string[]>;
  dispatch: Dispatch<AppAction>;
}): {
  navigateActiveView: (view: ActiveView) => void;
  navigateViewPath: (path: string[]) => void;
} {
  // Tracks the current activeView without causing stale closures in effects
  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;

  // When true, state changes are caused by popstate — skip pushing another history entry
  const isProgrammaticNavRef = useRef(false);

  // nodeId extracted from the initial hash, resolved once nodePathIndex is ready
  const pendingNodeIdRef = useRef<string | null>(null);

  // Skip the file-reset effect on initial mount
  const isFirstMountRef = useRef(true);

  // ① Parse initial hash on mount and set pending resolution if needed
  useEffect(() => {
    const parsed = parseHash(location.hash);
    if (!parsed) {
      history.replaceState(null, "", buildHash(activeView, viewPath));
      return;
    }
    // Restore activeView from hash if different
    if (parsed.activeView !== activeViewRef.current) {
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: parsed.activeView });
    }
    if (parsed.nodeId === null) {
      dispatch({ type: "SET_VIEW_PATH", path: [] });
    } else {
      pendingNodeIdRef.current = parsed.nodeId;
      // Resolution is deferred to effect ③ once nodePathIndex is populated
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ② Resolve pendingNodeId once nodePathIndex is available
  useEffect(() => {
    const nodeId = pendingNodeIdRef.current;
    if (nodeId === null) return;
    if (nodePathIndex.size === 0) return;

    const resolvedPath = nodePathIndex.get(nodeId) ?? [nodeId];
    pendingNodeIdRef.current = null;
    dispatch({ type: "SET_VIEW_PATH", path: resolvedPath });
  }, [nodePathIndex, dispatch]);

  // ③ Sync state changes → hash (push new history entry)
  useEffect(() => {
    if (isProgrammaticNavRef.current) return;
    const newHash = buildHash(activeView, viewPath);
    if (location.hash !== newHash) {
      history.pushState(null, "", newHash);
    }
  }, [activeView, viewPath]);

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
        dispatch({ type: "SET_ACTIVE_VIEW", activeView: parsed.activeView });
      }

      const path =
        parsed.nodeId === null ? [] : (nodePathIndex.get(parsed.nodeId) ?? [parsed.nodeId]);
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
