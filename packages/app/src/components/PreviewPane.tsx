import { useRef, useState, useCallback, useEffect, type MouseEvent } from "react";
import type {
  Diagnostic,
  EdgeDirection,
  NodeMetadata,
  DomainEdgeDetail,
  NodeDiffMeta,
} from "@karasu-tools/core";
import { NodeDetailPanel } from "./NodeDetailPanel.js";
import { EdgeDetailPanel } from "./EdgeDetailPanel.js";
import { EdgeContextMenu } from "./EdgeContextMenu.js";
import { useFormattedDiagnostic } from "../i18n/format-diagnostic.js";

interface PreviewPaneProps {
  svg: string;
  diagnostics: Diagnostic[];
  viewPath?: string[];
  nodeMetadata: Map<string, NodeMetadata>;
  onDrillDown?: (newPath: string[]) => void;
  /** Called when user clicks a deploy container to cross-navigate to system view */
  onContainerClick?: (containerId: string) => void;
  /** Called when user clicks the deploy button on a system node to cross-navigate to deploy view */
  onDeployButtonClick?: (serviceId: string) => void;
  /** Called when user clicks the team label on a system node to cross-navigate to org view */
  onTeamButtonClick?: (teamId: string) => void;
  /** Called when user clicks an owned service link on an org team node to cross-navigate to system view */
  onOwnedServiceClick?: (serviceId: string) => void;
  /** Node or container id to highlight after cross-navigation */
  highlightedNodeId?: string | null;
  /** Called when a node interaction clears the cross-navigation highlight */
  onClearHighlight?: () => void;
  /** Called when user clicks "Jump to editor" in the detail panel */
  onJumpToEditor?: (nodeId: string) => void;
  /**
   * Per-node diff metadata from `compileSystemDiff`. When provided, the
   * detail panel surfaces the before/after annotation list as +/- lines
   * (Issue #738 / design doc D-2).
   */
  nodeDiff?: Map<string, NodeDiffMeta>;
  /**
   * Resolved path of the `.krs.style` file the GUI writer should append
   * to. `undefined` disables the right-click → Direction menu's
   * write path (the menu still shows but the items are disabled with a
   * hint).
   */
  styleTargetPath?: string;
  /**
   * Called when the user picks a direction from the edge context menu. The
   * caller is responsible for the actual file write; this prop only
   * forwards intent.
   */
  onPickEdgeDirection?: (canonicalId: string, direction: EdgeDirection) => void;
}

interface EdgeContextMenuState {
  x: number;
  y: number;
  canonicalId: string;
  displayLabel: string;
  edgeLabel?: string;
}

type DetailPanelState =
  | { kind: "node"; nodeId: string; anchorX: number; anchorY: number }
  | { kind: "edge"; domainEdges: DomainEdgeDetail[]; anchorX: number; anchorY: number };

const CLICK_THRESHOLD = 3;

export function PreviewPane({
  svg,
  diagnostics,
  viewPath = [],
  nodeMetadata,
  onDrillDown,
  onContainerClick,
  onDeployButtonClick,
  onTeamButtonClick,
  onOwnedServiceClick,
  highlightedNodeId,
  onClearHighlight,
  onJumpToEditor,
  nodeDiff,
  styleTargetPath,
  onPickEdgeDirection,
}: PreviewPaneProps) {
  const formatDiagnostic = useFormattedDiagnostic();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const [detailPanel, setDetailPanel] = useState<DetailPanelState | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<EdgeContextMenuState | null>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const mouseDownPos = useRef({ x: 0, y: 0 });

  const handleContextMenu = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    const edgeGroup = target.closest("[data-edge-canonical-id]");
    if (!edgeGroup) return;
    const canonicalId = edgeGroup.getAttribute("data-edge-canonical-id");
    const from = edgeGroup.getAttribute("data-edge-from") ?? "";
    const to = edgeGroup.getAttribute("data-edge-to") ?? "";
    const kind = edgeGroup.getAttribute("data-edge-kind");
    if (!canonicalId) return;
    e.preventDefault();
    const arrow = kind === "async" ? "→→" : "→";
    setEdgeMenu({
      x: e.clientX,
      y: e.clientY,
      canonicalId,
      displayLabel: `${from} ${arrow} ${to}`,
      edgeLabel: edgeGroup.getAttribute("data-edge-label") ?? undefined,
    });
  }, []);

  const handlePickDirection = useCallback(
    (direction: EdgeDirection) => {
      if (!edgeMenu) return;
      onPickEdgeDirection?.(edgeMenu.canonicalId, direction);
    },
    [edgeMenu, onPickEdgeDirection],
  );

  // Radix Popover handles outside-click + Escape dismissal internally via
  // its DismissableLayer (see EdgeContextMenu — Popover migration, #1368).
  // The bespoke document listeners are no longer needed.

  const visibleDiagnostics = diagnostics.filter(
    (d) => d.severity === "error" || d.severity === "warning" || d.severity === "info",
  );
  const hasErrors = diagnostics.some((d) => d.severity === "error");

  // Attach the zoom handler as a native, non-passive wheel listener. React's
  // synthetic onWheel is registered passively (React 17+), so a preventDefault
  // there is a no-op and the page/ancestor scrolls while zooming (#1537).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: globalThis.WheelEvent) => {
      // Subtrees that own their scrolling (e.g. the detail panels) opt out via
      // data-wheel-zoom-ignore. We can't rely on their React synthetic
      // stopPropagation here because this is a native listener on the ancestor
      // container, which fires first during the bubble phase (#1537).
      if ((e.target as Element | null)?.closest?.("[data-wheel-zoom-ignore]")) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setTransform((prev) => ({
        ...prev,
        scale: Math.max(0.1, Math.min(5, prev.scale * delta)),
      }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 0) return;
      isDraggingRef.current = true;
      setIsDragging(true);
      dragStart.current = {
        x: e.clientX - transform.x,
        y: e.clientY - transform.y,
      };
      mouseDownPos.current = { x: e.clientX, y: e.clientY };
    },
    [transform.x, transform.y],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      setTransform((prev) => ({
        ...prev,
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y,
      }));
    },
    [isDragging],
  );

  const calcAnchor = useCallback((target: Element) => {
    const rect = target.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return null;

    // Position panel to the right of the target
    let anchorX = rect.right - containerRect.left + 8;
    const anchorY = rect.top - containerRect.top;

    // If near right edge, position to the left
    if (anchorX + 360 > containerRect.width) {
      anchorX = rect.left - containerRect.left - 368;
      if (anchorX < 0) anchorX = 8;
    }

    return { anchorX, anchorY };
  }, []);

  const openDetailPanel = useCallback(
    (nodeId: string, target: Element) => {
      const anchor = calcAnchor(target);
      if (!anchor) return;
      setDetailPanel({ kind: "node", nodeId, ...anchor });
    },
    [calcAnchor],
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      const wasDragging = isDraggingRef.current;
      isDraggingRef.current = false;
      setIsDragging(false);

      if (!wasDragging) return;

      // Only trigger actions if mouse didn't move (click, not drag)
      const dx = Math.abs(e.clientX - mouseDownPos.current.x);
      const dy = Math.abs(e.clientY - mouseDownPos.current.y);
      if (dx > CLICK_THRESHOLD || dy > CLICK_THRESHOLD) return;

      const target = e.target as Element;

      // Check for domain-edge detail click (implicit aggregated edges)
      const edgeGroup = target.closest("[data-domain-edges]");
      if (edgeGroup) {
        const raw = edgeGroup.getAttribute("data-domain-edges");
        if (raw) {
          try {
            const domainEdges = JSON.parse(raw) as DomainEdgeDetail[];
            const anchor = calcAnchor(edgeGroup);
            if (anchor) {
              setDetailPanel({ kind: "edge", domainEdges, ...anchor });
            }
          } catch {
            // malformed JSON — ignore
          }
        }
        return;
      }

      // Check for info button click
      const infoButton = target.closest("[data-info-button]");
      if (infoButton) {
        const nodeId = infoButton.getAttribute("data-info-button");
        if (nodeId) {
          const nodeGroup = infoButton.closest("[data-node-id]") ?? infoButton;
          openDetailPanel(nodeId, nodeGroup);
        }
        return;
      }

      // Check for link button click
      const linkButton = target.closest("[data-link-button]");
      if (linkButton) {
        const nodeId = linkButton.getAttribute("data-link-button");
        if (nodeId) {
          const nodeGroup = linkButton.closest("[data-node-id]") ?? linkButton;
          openDetailPanel(nodeId, nodeGroup);
        }
        return;
      }

      // Check for deploy button click (system → deploy cross-navigation)
      const deployButton = target.closest("[data-deploy-button]");
      if (deployButton && onDeployButtonClick) {
        const serviceId = deployButton.getAttribute("data-deploy-button");
        if (serviceId) {
          onDeployButtonClick(serviceId);
          return;
        }
      }

      // Check for team button click (system → org cross-navigation)
      const teamButton = target.closest("[data-team-button]");
      if (teamButton && onTeamButtonClick) {
        const teamId = teamButton.getAttribute("data-team-button");
        if (teamId) {
          onTeamButtonClick(teamId);
          return;
        }
      }

      // Explicitly non-interactive elements (e.g. "+N more" overflow label)
      if (target.closest("[data-noop]")) return;

      // Check for owned service button click (org → system cross-navigation)
      const ownedServiceButton = target.closest("[data-owned-service-button]");
      if (ownedServiceButton && onOwnedServiceClick) {
        const serviceId = ownedServiceButton.getAttribute("data-owned-service-button");
        if (serviceId) {
          onOwnedServiceClick(serviceId);
          return;
        }
      }

      // Check for container click (deploy diagram cross-navigation)
      const containerGroup = target.closest("[data-container-id]");
      if (containerGroup && onContainerClick) {
        const containerId = containerGroup.getAttribute("data-container-id");
        // Synthetic deploy containers (`__unclassified__`, `__job_band__`) are
        // not real services — clicking them must not cross-navigate to a
        // non-existent system node.
        if (containerId && containerId !== "__unclassified__" && containerId !== "__job_band__") {
          onContainerClick(containerId);
          return;
        }
      }

      // Check for node click
      const nodeGroup = target.closest("[data-node-id]");
      if (!nodeGroup) {
        // Click outside any node — close detail panel
        setDetailPanel(null);
        return;
      }

      const hasChildren = nodeGroup.getAttribute("data-has-children") === "true";
      const nodeId = nodeGroup.getAttribute("data-node-id");

      if (hasChildren && nodeId && onDrillDown) {
        // Drill down into child level.
        // Use viewPath from nodeMetadata when available (includes system ID prefix for Phase 2).
        // Fall back to appending nodeId to the current viewPath for nodes not in the index.
        const drillPath = nodeMetadata.get(nodeId)?.viewPath ?? [...viewPath, nodeId];
        setDetailPanel(null);
        onClearHighlight?.();
        onDrillDown(drillPath);
      } else if (nodeId) {
        // Open detail panel for leaf nodes
        onClearHighlight?.();
        openDetailPanel(nodeId, nodeGroup);
      }
    },
    [
      nodeMetadata,
      viewPath,
      onDrillDown,
      calcAnchor,
      openDetailPanel,
      onContainerClick,
      onDeployButtonClick,
      onTeamButtonClick,
      onOwnedServiceClick,
      onClearHighlight,
    ],
  );

  const handleMouseLeave = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  // Apply highlight to the target node or container after SVG injection
  useEffect(() => {
    if (!svgRef.current) return;

    // Clear previous highlights
    const prev = svgRef.current.querySelectorAll(".karasu-highlighted");
    prev.forEach((el) => el.classList.remove("karasu-highlighted"));

    if (!highlightedNodeId) return;

    // Try node first, then container
    const target =
      svgRef.current.querySelector(`[data-node-id="${CSS.escape(highlightedNodeId)}"]`) ??
      svgRef.current.querySelector(`[data-container-id="${CSS.escape(highlightedNodeId)}"]`);
    if (target) target.classList.add("karasu-highlighted");
  }, [highlightedNodeId, svg]);

  const nodePanelMetadata =
    detailPanel?.kind === "node" ? nodeMetadata.get(detailPanel.nodeId) : undefined;

  return (
    <div className={`preview-pane${hasErrors ? " preview-pane--has-errors" : ""}`}>
      <div
        ref={containerRef}
        className="preview-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        style={{ cursor: isDragging ? "grabbing" : "grab", position: "relative" }}
      >
        <div
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: "center center",
          }}
          ref={svgRef}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {edgeMenu && (
          <EdgeContextMenu
            x={edgeMenu.x}
            y={edgeMenu.y}
            canonicalId={edgeMenu.canonicalId}
            displayLabel={edgeMenu.displayLabel}
            edgeLabel={edgeMenu.edgeLabel}
            styleTargetPath={styleTargetPath}
            onPickDirection={handlePickDirection}
            onClose={() => setEdgeMenu(null)}
          />
        )}
        {detailPanel?.kind === "node" && nodePanelMetadata && (
          <NodeDetailPanel
            nodeId={detailPanel.nodeId}
            metadata={nodePanelMetadata}
            anchorX={detailPanel.anchorX}
            anchorY={detailPanel.anchorY}
            onClose={() => setDetailPanel(null)}
            onNavigateToDeploy={onDeployButtonClick}
            onNavigateToOrg={onTeamButtonClick}
            onJumpToEditor={onJumpToEditor ? () => onJumpToEditor(detailPanel.nodeId) : undefined}
            annotationDiff={nodeDiff?.get(detailPanel.nodeId)?.changes?.annotations}
          />
        )}
        {detailPanel?.kind === "edge" && (
          <EdgeDetailPanel
            domainEdges={detailPanel.domainEdges}
            anchorX={detailPanel.anchorX}
            anchorY={detailPanel.anchorY}
            onClose={() => setDetailPanel(null)}
          />
        )}
      </div>
      {hasErrors && svg && (
        <div className="error-state-overlay" aria-hidden="true">
          <span className="error-state-badge">⚠ Diagram is outdated — fix errors to update</span>
        </div>
      )}
      {visibleDiagnostics.length > 0 && (
        <div className="diagnostic-banner">
          {visibleDiagnostics.map((d) => {
            const message = formatDiagnostic(d);
            return (
              <div
                key={d.loc ? `${d.loc.start.line}:${message}` : message}
                className={`diagnostic-banner__item diagnostic-banner__item--${d.severity}`}
              >
                {d.loc ? `Line ${d.loc.start.line}: ${message}` : message}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
