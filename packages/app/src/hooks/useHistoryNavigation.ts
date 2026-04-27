import { useCallback, useEffect, useRef } from "react";
import { sanitizeId } from "@karasu-tools/core";
import type { Dispatch } from "react";
import type { AppAction, ActiveView } from "../state/app-reducer.js";

// ─── Utilities (exported for testing) ────────────────────────────────────────

/**
 * Encodes activeView + viewPath + open file into a URL hash string.
 *
 * Examples:
 *   ("deploy", [])                                    → "#krs-deploy"
 *   ("deploy", [], false, "ECommerce")                → "#krs-deploy:ECommerce"
 *   ("system", [])                                    → "#krs-system-root"
 *   ("system", ["Payment"])                           → "#krs-system-Payment"
 *   ("org", ["a", "b"])                               → "#krs-org-b"  (last segment only)
 *   ("org", [], true)                                 → "#krs-org-tree"  (Tree View mode)
 *   ("org", [], false, "ecTeam")                      → "#krs-org-root:ecTeam"
 *   ("system", [], false, null, "/p/before.krs")      → "#krs-system-root?file=%2Fp%2Fbefore.krs"
 */
export function buildHash(
  activeView: ActiveView,
  viewPath: string[],
  isOrgTreeView = false,
  highlightNodeId?: string | null,
  filePath?: string | null,
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
  const withHighlight = highlightNodeId ? `${base}:${highlightNodeId}` : base;
  return filePath ? `${withHighlight}?file=${encodeURIComponent(filePath)}` : withHighlight;
}

/**
 * Decodes a URL hash string into { activeView, nodeId, isOrgTreeView, highlightNodeId, filePath }.
 * nodeId is null for root and tree-view hashes.
 * highlightNodeId is extracted from the optional colon-suffixed segment (e.g. "#krs-deploy:ECommerce").
 * filePath is extracted from the optional `?file=<encoded>` suffix (Issue #811).
 * Returns null for unrecognized hashes.
 */
export function parseHash(hash: string): {
  activeView: ActiveView;
  nodeId: string | null;
  isOrgTreeView: boolean;
  highlightNodeId: string | null;
  filePath: string | null;
} | null {
  // Strip the `?file=` suffix first so it doesn't interfere with `:` parsing.
  let filePath: string | null = null;
  let core = hash;
  const queryIdx = hash.indexOf("?", 1);
  if (queryIdx !== -1) {
    const query = hash.slice(queryIdx + 1);
    core = hash.slice(0, queryIdx);
    const params = new URLSearchParams(query);
    const f = params.get("file");
    if (f) filePath = f;
  }

  // Extract optional highlight suffix: "#krs-deploy:ECommerce" → base="#krs-deploy", highlight="ECommerce"
  const colonIdx = core.indexOf(":", 1);
  let highlightNodeId: string | null = null;
  let base = core;
  if (colonIdx !== -1) {
    highlightNodeId = core.slice(colonIdx + 1) || null;
    base = core.slice(0, colonIdx);
  }

  if (base === "#krs-deploy")
    return { activeView: "deploy", nodeId: null, isOrgTreeView: false, highlightNodeId, filePath };
  if (base === "#krs-org-tree")
    return { activeView: "org", nodeId: null, isOrgTreeView: true, highlightNodeId, filePath };
  const m = base.match(/^#krs-(system|org)-(.+)$/);
  if (!m) return null;
  const activeView = m[1] as "system" | "org";
  const nodeId = m[2] === "root" ? null : m[2];
  return { activeView, nodeId, isOrgTreeView: false, highlightNodeId, filePath };
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
  onFileChange,
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
  /**
   * Called when popstate (or initial-mount hash) requests a different file.
   * Implementations should read the file's content and dispatch SELECT_FILE.
   * Optional — when omitted, file changes are not restored from the URL
   * (used by modes without per-file navigation, e.g. ServeMode/MemoryMode).
   * Issue #811.
   */
  onFileChange?: (path: string) => Promise<void> | void;
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

  // Stable ref for onFileChange — referenced inside long-lived effects without re-running them.
  const onFileChangeRef = useRef(onFileChange);
  onFileChangeRef.current = onFileChange;

  // Tracks the latest currentFilePath without re-binding the popstate listener.
  const currentFilePathRef = useRef(currentFilePath);
  currentFilePathRef.current = currentFilePath;

  // Tracks the *previous* currentFilePath so effect ③ can distinguish
  // user-initiated file switches (push) from project-switch initialization
  // (replace) and transient null states (skip). Issue #811.
  const prevFilePathRef = useRef<string | null>(currentFilePath);

  // ① Parse initial hash on mount and set pending resolution if needed
  useEffect(() => {
    const parsed = parseHash(location.hash);
    if (!parsed) {
      history.replaceState(
        null,
        "",
        buildHash(activeView, viewPath, isOrgTreeView, null, currentFilePath),
      );
      return;
    }
    // Restore the open file from the hash if it differs (Issue #811).
    // The file load is async; downstream restoration (viewPath, etc.) still
    // proceeds with the parsed values — SELECT_FILE resets viewPath in the
    // reducer, but the deferred-resolution effect ② re-applies the parsed
    // nodeId once the path index is ready.
    if (parsed.filePath && parsed.filePath !== currentFilePath && onFileChangeRef.current) {
      void onFileChangeRef.current(parsed.filePath);
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

  // ③ Sync state changes → hash (Issue #811)
  // Includes `currentFilePath` so file switches participate in browser
  // history. The push/replace/skip decision depends on the file transition:
  //
  //   non-null → null         skip      project switch transient (reducer
  //                                     resets currentFilePath; auto-select
  //                                     of index.krs follows)
  //   null     → non-null     replace   initial file load (mount or after
  //                                     project init) — must NOT push, or
  //                                     it wipes the forward stack
  //   non-null → non-null *   push      user-initiated file switch within
  //                                     the same project
  //
  // Without this, pressing Back across a project switch and then Forward
  // would not restore the project: the auto-`selectFile(index.krs)` after
  // SET_CURRENT_PROJECT triggers a pushState that clears forward history.
  useEffect(() => {
    if (isProgrammaticNavRef.current) return;
    const prev = prevFilePathRef.current;

    // Project-switch transient — currentFilePath momentarily null. Don't
    // emit a hash entry; the next SELECT_FILE will replaceState.
    if (currentFilePath === null && prev !== null) {
      prevFilePathRef.current = null;
      return;
    }

    const newHash = buildHash(
      activeView,
      viewPath,
      isOrgTreeView,
      highlightedNodeId,
      currentFilePath,
    );
    if (location.hash !== newHash) {
      const isInitialLoad = prev === null && currentFilePath !== null;
      if (isInitialLoad) {
        history.replaceState(null, "", newHash);
      } else {
        history.pushState(null, "", newHash);
      }
    }
    prevFilePathRef.current = currentFilePath;
  }, [activeView, viewPath, isOrgTreeView, highlightedNodeId, currentFilePath]);

  // ④ popstate handler — browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseHash(location.hash);
      if (!parsed) return;

      isProgrammaticNavRef.current = true;

      // Restore the open file first (Issue #811). Downstream dispatches
      // happen synchronously below; the async file load completes later
      // and SELECT_FILE will reset viewPath in the reducer, but by that
      // point the user-intended viewPath has already been pushed.
      if (parsed.filePath !== currentFilePathRef.current && onFileChangeRef.current) {
        if (parsed.filePath) {
          void onFileChangeRef.current(parsed.filePath);
        }
      }

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
  }, [dispatch, nodePathIndex, orgPathIndex]);

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
