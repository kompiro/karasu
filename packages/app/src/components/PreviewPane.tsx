import { useRef, useState, useCallback, useEffect, type WheelEvent, type MouseEvent } from "react";
import type { Diagnostic, NodeMetadata, DomainEdgeDetail } from "@karasu-tools/core";
import { NodeDetailPanel } from "./NodeDetailPanel.js";
import { EdgeDetailPanel } from "./EdgeDetailPanel.js";

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
}: PreviewPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const [detailPanel, setDetailPanel] = useState<DetailPanelState | null>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const mouseDownPos = useRef({ x: 0, y: 0 });

  const visibleDiagnostics = diagnostics.filter(
    (d) => d.severity === "error" || d.severity === "warning",
  );

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(0.1, Math.min(5, prev.scale * delta)),
    }));
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
        if (containerId && containerId !== "__unclassified__") {
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
    <div className="preview-pane">
      <div
        ref={containerRef}
        className="preview-container"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
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
      {visibleDiagnostics.length > 0 && (
        <div className="diagnostic-banner">
          {visibleDiagnostics.map((d) => (
            <div
              key={d.loc ? `${d.loc.start.line}:${d.message}` : d.message}
              className={`diagnostic-banner__item diagnostic-banner__item--${d.severity}`}
            >
              {d.loc ? `Line ${d.loc.start.line}: ${d.message}` : d.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
