import { useCallback, useEffect, useRef } from "react";
import type { Dispatch } from "react";
import type { AppAction, ActiveView, HighlightAttribute } from "../state/app-reducer.js";
import { buildHash, parseHash } from "./history-hash.js";
import { useLatestRef } from "./useLatestRef.js";

/**
 * The attribute a `:<highlight>` restored from the hash is matched against
 * (#2818). The hash carries no id space of its own; on the deploy view the
 * suffix is what the deploy-jump button and a share link write, a node id,
 * which the deploy view marks on the container realizing it. Every other view
 * marks nodes directly.
 */
function hashHighlightAttribute(view: ActiveView): HighlightAttribute {
  return view === "deploy" ? "data-realized-node-id" : "data-node-id";
}

function samePath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((segment, i) => segment === b[i]);
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
  isEntityView,
  setIsEntityView,
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
  /** Entity sub-mode: system view drilled into a domain, showing its entity view. */
  isEntityView: boolean;
  setIsEntityView: (v: boolean) => void;
  highlightedNodeId: string | null;
  /**
   * Called when popstate (or initial-mount hash) requests a different file.
   * Implementations should read the file's content and dispatch SELECT_FILE.
   * Optional — when omitted, file changes are not restored from the URL
   * (used by modes without per-file navigation, e.g. ServeMode/MemoryMode).
   * Issue #811.
   */
  onFileChange?: (path: string) => Promise<unknown> | void;
}): {
  navigateActiveView: (view: ActiveView) => void;
  navigateViewPath: (path: string[]) => void;
} {
  // Tracks the current activeView without causing stale closures in effects
  const activeViewRef = useLatestRef(activeView);

  // Stable ref for setIsOrgTreeView to avoid re-running mount-only effects
  const setIsOrgTreeViewRef = useLatestRef(setIsOrgTreeView);

  // Stable ref for setIsEntityView (same rationale as setIsOrgTreeView).
  const setIsEntityViewRef = useLatestRef(setIsEntityView);

  // When true, state changes are caused by popstate — skip pushing another history entry
  const isProgrammaticNavRef = useRef(false);

  // nodeId extracted from the initial hash, resolved once the relevant path index is ready
  const pendingNodeIdRef = useRef<string | null>(null);
  // activeView associated with the pending nodeId (determines which index to use)
  const pendingActiveViewRef = useRef<ActiveView>("system");
  // highlight extracted from the initial hash, re-applied once the model-derived
  // index is ready (Issue #1842). On a shared open, the project-seed effect's
  // SELECT_FILE → VIEW_RESET runs *after* effect ① and wipes the highlight it
  // dispatched on mount. This deferral mirrors the node re-resolution so the
  // selected node stays focus-highlighted.
  const pendingHighlightRef = useRef<string | null>(null);
  // The attribute that highlight is matched against (#2818), decided from the
  // hash's own view at parse time. Effect ② must not derive it from
  // `activeViewRef`: that ref lags a commit, and when the index is already
  // populated on mount effect ② runs in the same flush as effect ①'s
  // SET_ACTIVE_VIEW, so it would read the view being left, not the one the
  // hash names, and overwrite the attribute effect ① set.
  const pendingHighlightAttributeRef = useRef<HighlightAttribute>("data-node-id");
  // The non-system view the initial hash names, re-applied once the index is
  // ready (#3208). The seed's VIEW_RESET sets `activeView: "system"` after
  // effect ① restored the tab, the same wipe as the highlight above (TPL-1842:
  // every restored field needs the deferral, not only the node). `system` is
  // what the reset leaves, so it has nothing to restore.
  const pendingActiveViewRestoreRef = useRef<ActiveView | null>(null);
  // A cold boot on a deep link is one history entry (#3208, #3284). Until
  // every field the hash names has been re-applied and committed, the state
  // effect ③ sees is a pre-restore one: the mount's initial `system` root, the
  // seed's reset, or the commit right before effect ②'s dispatches land. Each
  // of those writes replaces the entry; pushing them left `#krs-system-root`
  // (and the reset tab) behind the deep link, so Back went through them.
  // Set on mount when the hash parses; cleared by effect ③ once nothing is
  // pending and the state holds the values in `restoreTargetRef`.
  const restoringDeepLinkRef = useRef(false);
  // The values effect ② dispatched, which the state must hold before the
  // restoration counts as committed. A field absent here is not waited on.
  const restoreTargetRef = useRef<{
    activeView?: ActiveView;
    viewPath?: string[];
    highlightedNodeId?: string;
  }>({});

  // Stable ref for onFileChange — referenced inside long-lived effects without re-running them.
  const onFileChangeRef = useLatestRef(onFileChange);

  // Tracks the latest currentFilePath without re-binding the popstate listener.
  const currentFilePathRef = useLatestRef(currentFilePath);

  // Tracks the *previous* currentFilePath so effect ③ can distinguish
  // user-initiated file switches (push) from project-switch initialization
  // (replace) and transient null states (skip). Issue #811.
  const prevFilePathRef = useRef<string | null>(currentFilePath);

  // ① Parse initial hash on mount and set pending resolution if needed
  useEffect(() => {
    const parsed = parseHash(location.hash);
    restoringDeepLinkRef.current = parsed !== null;
    if (!parsed) {
      history.replaceState(
        null,
        "",
        buildHash(activeView, viewPath, {
          orgTree: isOrgTreeView,
          entityView: isEntityView,
          file: currentFilePath,
        }),
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
    // Stash the highlight for deferred re-application in effect ②. The immediate
    // dispatch below sets it on mount, but the seed's VIEW_RESET wipes it; the
    // pending ref restores it once the index is ready (Issue #1842).
    if (parsed.highlightNodeId !== null) {
      pendingHighlightRef.current = parsed.highlightNodeId;
      pendingHighlightAttributeRef.current = hashHighlightAttribute(parsed.activeView);
    }
    if (parsed.activeView !== "system") {
      pendingActiveViewRestoreRef.current = parsed.activeView;
    }
    // Restore activeView from hash if different (include highlightNodeId in the transition)
    if (parsed.activeView !== activeViewRef.current) {
      dispatch({
        type: "SET_ACTIVE_VIEW",
        activeView: parsed.activeView,
        highlightNodeId: parsed.highlightNodeId,
        highlightAttribute: hashHighlightAttribute(parsed.activeView),
      });
    } else if (parsed.highlightNodeId !== null) {
      dispatch({
        type: "SET_HIGHLIGHTED_NODE",
        nodeId: parsed.highlightNodeId,
        highlightAttribute: hashHighlightAttribute(parsed.activeView),
      });
    }
    // Restore org tree view mode
    if (parsed.isOrgTreeView) {
      setIsOrgTreeViewRef.current(true);
    }
    // Restore entity sub-mode
    if (parsed.isEntityView) {
      setIsEntityViewRef.current(true);
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

  // ② Re-apply the pending view, resolve pendingNodeId and re-apply the
  // pending highlight once the relevant path index is available.
  useEffect(() => {
    // Gate on a populated index: it derives from the seeded file content, so a
    // non-empty one proves the seed's SELECT_FILE (and its VIEW_RESET) has run.
    const indexReady =
      (!!nodePathIndex && nodePathIndex.size > 0) || (!!orgPathIndex && orgPathIndex.size > 0);

    // The view first (#3208): SET_ACTIVE_VIEW clears viewPath and the
    // highlight, so the node and highlight below must land after it, and an
    // org drill must resolve against the org index of the restored tab.
    if (pendingActiveViewRestoreRef.current !== null) {
      if (!indexReady) return;
      const view = pendingActiveViewRestoreRef.current;
      pendingActiveViewRestoreRef.current = null;
      restoreTargetRef.current.activeView = view;
      dispatch({
        type: "SET_ACTIVE_VIEW",
        activeView: view,
        highlightNodeId: pendingHighlightRef.current,
        highlightAttribute: pendingHighlightAttributeRef.current,
      });
    }

    const nodeId = pendingNodeIdRef.current;
    const isOrgPending = pendingActiveViewRef.current === "org";
    const index = isOrgPending ? orgPathIndex : nodePathIndex;

    if (nodeId !== null) {
      if (!index || index.size === 0) return;
      const resolvedPath = index.get(nodeId) ?? [];
      pendingNodeIdRef.current = null;
      restoreTargetRef.current.viewPath = resolvedPath;
      dispatch({ type: "SET_VIEW_PATH", path: resolvedPath });
    }

    // Re-apply the highlight wiped by the seed's VIEW_RESET (Issue #1842).
    // Gate on a populated index so this lands *after* the SELECT_FILE that
    // cleared it — the index derives from the seeded file content, so a
    // non-empty index proves the reset has already happened. This also covers
    // the highlight-only-at-root case (no pending node), which effect ① could
    // not defer on its own.
    if (pendingHighlightRef.current !== null) {
      if (!indexReady) return;
      const highlight = pendingHighlightRef.current;
      pendingHighlightRef.current = null;
      restoreTargetRef.current.highlightedNodeId = highlight;
      dispatch({
        type: "SET_HIGHLIGHTED_NODE",
        nodeId: highlight,
        highlightAttribute: pendingHighlightAttributeRef.current,
      });
    }
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

    const newHash = buildHash(activeView, viewPath, {
      orgTree: isOrgTreeView,
      entityView: isEntityView,
      highlight: highlightedNodeId,
      file: currentFilePath,
    });
    if (location.hash !== newHash) {
      const isInitialLoad = prev === null && currentFilePath !== null;
      if (isInitialLoad || restoringDeepLinkRef.current) {
        history.replaceState(null, "", newHash);
      } else {
        history.pushState(null, "", newHash);
      }
    }
    if (restoringDeepLinkRef.current) {
      // Effect ② runs before this one in the same commit, so a dispatch it
      // just made is not in this run's state yet: the targets are compared,
      // not only the pending refs, and the next commit's write is replaced
      // too. A target already equal to the state matches here and now.
      const target = restoreTargetRef.current;
      const pending =
        pendingActiveViewRestoreRef.current !== null ||
        pendingNodeIdRef.current !== null ||
        pendingHighlightRef.current !== null;
      const landed =
        (target.activeView === undefined || target.activeView === activeView) &&
        (target.viewPath === undefined || samePath(target.viewPath, viewPath)) &&
        (target.highlightedNodeId === undefined || target.highlightedNodeId === highlightedNodeId);
      if (currentFilePath !== null && !pending && landed) {
        restoringDeepLinkRef.current = false;
        restoreTargetRef.current = {};
      }
    }
    prevFilePathRef.current = currentFilePath;
  }, [activeView, viewPath, isOrgTreeView, isEntityView, highlightedNodeId, currentFilePath]);

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
          highlightAttribute: hashHighlightAttribute(parsed.activeView),
        });
      } else {
        dispatch({
          type: "SET_HIGHLIGHTED_NODE",
          nodeId: parsed.highlightNodeId,
          highlightAttribute: hashHighlightAttribute(parsed.activeView),
        });
      }
      setIsOrgTreeViewRef.current(parsed.isOrgTreeView);
      setIsEntityViewRef.current(parsed.isEntityView);

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
    // The `*Ref` deps are stable ref objects (their `.current` is read inside
    // the listener, not captured), so listing them satisfies exhaustive-deps
    // without changing when this effect re-registers.
  }, [
    dispatch,
    nodePathIndex,
    orgPathIndex,
    activeViewRef,
    currentFilePathRef,
    onFileChangeRef,
    setIsOrgTreeViewRef,
    setIsEntityViewRef,
  ]);

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
