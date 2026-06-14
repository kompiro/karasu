import type { Diagnostic, EdgeDirection, NodeDiffMeta, Warning } from "@karasu-tools/core";
import { usePreview, type PreviewContextValue } from "./preview-context.js";

type BreadcrumbItem = { id: string; label: string };

/**
 * The active diagram view normalized to one flat shape. Fields a given view
 * doesn't have (deploy has no breadcrumbs/drill, only system carries
 * `nodeDiff` / edge-direction writes, …) are `undefined`, so `PreviewColumn`
 * can read `view.svg` / `view.warnings` / `view.onContainerClick` without the
 * `activeView === "system" ? … : activeView === "deploy" ? … : …` chains that
 * were repeated ~12 times (#1542).
 */
interface ActiveViewData {
  svg: string;
  diagnostics: Diagnostic[];
  warnings: Warning[];
  viewPath: string[];
  breadcrumbItems: BreadcrumbItem[];
  /** Breadcrumb / drill navigation — undefined for deploy (no view path). */
  onBreadcrumbNavigate?: (path: string[]) => void;
  highlightedNodeId?: string | null;
  onClearHighlight?: () => void;
  /** "Show All Layers" SVG for the active view — system / org only. */
  allLayersSvg?: string;
  /** Drill-down (CSS `:target`) export SVG for the active view — system / org only. */
  drillDownSvg?: string;
  /** system: click a service's deploy badge → switch to deploy. */
  onDeployButtonClick?: (serviceId: string) => void;
  /** system: click a node's team badge → switch to org. */
  onTeamButtonClick?: (teamId: string) => void;
  /** deploy: click a container group → highlight it as a system node. */
  onContainerClick?: (containerId: string) => void;
  /** org: click an owned service → switch to system. */
  onOwnedServiceClick?: (serviceId: string) => void;
  /** system diff mode: per-node diff metadata. */
  nodeDiff?: Map<string, NodeDiffMeta>;
  /** system: the `.krs.style` file a GUI edge-direction rule targets. */
  styleTargetPath?: string;
  /** system: apply a GUI edge-direction override. */
  onPickEdgeDirection?: (canonicalId: string, direction: EdgeDirection) => void;
}

/**
 * Pure projection of the preview context onto the active view. `matrix` shares
 * the system projection (it derives from the system AST and only ever consumes
 * `systemView.systems` downstream), so its slice is never rendered but stays
 * coherent.
 */
export function selectActiveViewData(ctx: PreviewContextValue): ActiveViewData {
  const { activeView, systemView, deployView, orgView } = ctx;
  switch (activeView) {
    case "deploy":
      return {
        svg: deployView.svg,
        diagnostics: deployView.diagnostics,
        warnings: deployView.warnings,
        viewPath: [],
        breadcrumbItems: [],
        highlightedNodeId: deployView.highlightedNodeId,
        onClearHighlight: deployView.onClearHighlight,
        onContainerClick: deployView.onContainerClick,
      };
    case "org":
      return {
        svg: orgView.svg,
        diagnostics: orgView.diagnostics,
        warnings: orgView.warnings,
        viewPath: orgView.viewPath,
        breadcrumbItems: orgView.breadcrumbItems,
        onBreadcrumbNavigate: orgView.onBreadcrumbNavigate,
        highlightedNodeId: orgView.highlightedNodeId,
        onClearHighlight: orgView.onClearHighlight,
        allLayersSvg: ctx.orgAllLayersSvg,
        drillDownSvg: ctx.orgDrillDownSvg,
        onOwnedServiceClick: orgView.onOwnedServiceClick,
      };
    // system / matrix — explicit (no `default`) so a new ActiveView member
    // becomes a compile error here instead of silently getting this projection.
    case "system":
    case "matrix":
      return {
        svg: systemView.svg,
        diagnostics: systemView.diagnostics,
        warnings: systemView.warnings,
        viewPath: systemView.viewPath,
        breadcrumbItems: systemView.breadcrumbItems,
        onBreadcrumbNavigate: systemView.onBreadcrumbNavigate,
        highlightedNodeId: systemView.highlightedNodeId,
        onClearHighlight: systemView.onClearHighlight,
        allLayersSvg: ctx.allLayersSvg,
        drillDownSvg: ctx.drillDownSvg,
        onDeployButtonClick: systemView.onDeployButtonClick,
        onTeamButtonClick: systemView.onTeamButtonClick,
        nodeDiff: systemView.nodeDiff,
        styleTargetPath: ctx.styleTargetPath,
        onPickEdgeDirection: ctx.onPickEdgeDirection,
      };
  }
}

/** Hook form of {@link selectActiveViewData} reading the preview context. */
export function useActiveViewData(): ActiveViewData {
  return selectActiveViewData(usePreview());
}
