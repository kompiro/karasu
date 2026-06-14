import { useCallback, useMemo } from "react";
import type { DeployBlock, NodeMetadata, OrganizationBlock, SystemNode } from "@karasu-tools/core";
import type { ActiveView } from "../state/app-reducer.js";
import type { AppAction } from "../state/app-reducer.js";
import type { OutlineNode } from "../components/OutlineView.js";
import { toDeployOutline, toOrgOutline, toSystemOutline } from "../components/outline-adapters.js";

interface UseOutlineArgs {
  activeView: ActiveView;
  deployTree: DeployBlock[];
  organizations: OrganizationBlock[];
  resolvedSystems: SystemNode[];
  /** System AST node metadata — source of the system/matrix drill `viewPath`. */
  systemNodeMetadata: Map<string, NodeMetadata>;
  /** Org node id → view path, for the org drill. */
  orgPathIndex: Map<string, string[]>;
  dispatch: (action: AppAction) => void;
  navigateViewPath: (path: string[]) => void;
}

interface Outline {
  nodes: OutlineNode[];
  /** Single click — highlight the node in the active view (no navigation). */
  onSelectNode: (nodeId: string) => void;
  /** Double click — drill the preview to reveal the node, then highlight it. */
  onActivateNode: (nodeId: string, ancestorIds: string[]) => void;
}

/**
 * Derives the active view's outline tree and owns the select (highlight) /
 * activate (drill) interactions. The drill resolution is per view: system and
 * matrix walk `systemNodeMetadata.viewPath`, org walks `orgPathIndex`, and
 * deploy switches the selected block. Extracted from AppShell (#1541).
 */
export function useOutline({
  activeView,
  deployTree,
  organizations,
  resolvedSystems,
  systemNodeMetadata,
  orgPathIndex,
  dispatch,
  navigateViewPath,
}: UseOutlineArgs): Outline {
  // The Outline reflects the active view's AST (Issue #1410): the system AST
  // for system/matrix, the deploy block tree for deploy, the org AST for org.
  const nodes = useMemo<OutlineNode[]>(() => {
    switch (activeView) {
      case "deploy":
        return toDeployOutline(deployTree);
      case "org":
        return toOrgOutline(organizations);
      default:
        // system and matrix both outline the system AST.
        return toSystemOutline(resolvedSystems);
    }
  }, [activeView, deployTree, organizations, resolvedSystems]);

  // Single click — highlight the node in the preview (no navigation). The
  // Outline already reflects the active view, so the highlight stays in it.
  // matrix is the exception: it has no per-node highlight, so a click drops
  // to the system view it derives from.
  const onSelectNode = useCallback(
    (nodeId: string) => {
      if (activeView === "matrix") {
        dispatch({ type: "SET_ACTIVE_VIEW", activeView: "system", highlightNodeId: nodeId });
      } else {
        dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId });
      }
    },
    [activeView, dispatch],
  );

  // Double click — drill the preview down to reveal the node, then highlight
  // it. Drill resolution is per view: system/matrix walk `nodeMetadata.viewPath`
  // (leaf nodes fall back to the nearest ancestor that carries one), org walks
  // `orgPathIndex`; deploy has no drill path — it switches the selected block.
  const onActivateNode = useCallback(
    (nodeId: string, ancestorIds: string[]) => {
      if (activeView === "deploy") {
        // The node's deploy block is the top-level ancestor, or the node
        // itself when a block row is activated.
        const blockId = ancestorIds[0] ?? nodeId;
        dispatch({ type: "SET_SELECTED_DEPLOY_BLOCK", id: blockId });
        dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId });
        return;
      }
      // Resolve to the view path of the first candidate (the node, then its
      // ancestors nearest-first) that carries one; empty path otherwise.
      const candidates = [nodeId, ...[...ancestorIds].reverse()];
      const resolveDrillPath = (lookup: (id: string) => string[] | undefined): string[] => {
        for (const id of candidates) {
          const vp = lookup(id);
          if (vp) return vp;
        }
        return [];
      };

      if (activeView === "org") {
        dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId });
        navigateViewPath(resolveDrillPath((id) => orgPathIndex.get(id)));
        return;
      }
      // system / matrix
      if (activeView === "matrix") {
        dispatch({ type: "SET_ACTIVE_VIEW", activeView: "system", highlightNodeId: nodeId });
      } else {
        dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId });
      }
      navigateViewPath(resolveDrillPath((id) => systemNodeMetadata.get(id)?.viewPath));
    },
    [activeView, dispatch, navigateViewPath, systemNodeMetadata, orgPathIndex],
  );

  return { nodes, onSelectNode, onActivateNode };
}
