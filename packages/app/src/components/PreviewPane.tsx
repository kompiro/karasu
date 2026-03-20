import { useRef, useState, useCallback, type WheelEvent, type MouseEvent } from "react";
import type { Diagnostic, NodeMetadata } from "@karasu/core";
import { NodeDetailPanel } from "./NodeDetailPanel.js";

interface PreviewPaneProps {
  svg: string;
  diagnostics: Diagnostic[];
  viewPath: string[];
  nodeMetadata: Map<string, NodeMetadata>;
  onDrillDown: (newPath: string[]) => void;
}

interface DetailPanelState {
  nodeId: string;
  anchorX: number;
  anchorY: number;
}

const CLICK_THRESHOLD = 3;

export function PreviewPane({
  svg,
  diagnostics,
  viewPath,
  nodeMetadata,
  onDrillDown,
}: PreviewPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [detailPanel, setDetailPanel] = useState<DetailPanelState | null>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const mouseDownPos = useRef({ x: 0, y: 0 });

  const errors = diagnostics.filter((d) => d.severity === "error");

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
      setIsDragging(true);
      dragStart.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
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

  const openDetailPanel = useCallback((nodeId: string, target: Element) => {
    const rect = target.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    // Position panel to the right of the node
    let anchorX = rect.right - containerRect.left + 8;
    const anchorY = rect.top - containerRect.top;

    // If near right edge, position to the left
    if (anchorX + 360 > containerRect.width) {
      anchorX = rect.left - containerRect.left - 368;
      if (anchorX < 0) anchorX = 8;
    }

    setDetailPanel({ nodeId, anchorX, anchorY });
  }, []);

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      const wasDragging = isDragging;
      setIsDragging(false);

      if (!wasDragging) return;

      // Only trigger actions if mouse didn't move (click, not drag)
      const dx = Math.abs(e.clientX - mouseDownPos.current.x);
      const dy = Math.abs(e.clientY - mouseDownPos.current.y);
      if (dx > CLICK_THRESHOLD || dy > CLICK_THRESHOLD) return;

      const target = e.target as Element;

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

      // Check for node click
      const nodeGroup = target.closest("[data-node-id]");
      if (!nodeGroup) {
        // Click outside any node — close detail panel
        setDetailPanel(null);
        return;
      }

      const hasChildren = nodeGroup.getAttribute("data-has-children") === "true";
      const nodeId = nodeGroup.getAttribute("data-node-id");

      if (hasChildren && nodeId) {
        // Drill down
        setDetailPanel(null);
        onDrillDown([...viewPath, nodeId]);
      } else if (nodeId) {
        // Open detail panel for leaf nodes
        openDetailPanel(nodeId, nodeGroup);
      }
    },
    [isDragging, viewPath, onDrillDown, openDetailPanel],
  );

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const panelMetadata = detailPanel ? nodeMetadata.get(detailPanel.nodeId) : undefined;

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
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {detailPanel && panelMetadata && (
          <NodeDetailPanel
            metadata={panelMetadata}
            anchorX={detailPanel.anchorX}
            anchorY={detailPanel.anchorY}
            onClose={() => setDetailPanel(null)}
          />
        )}
      </div>
      {errors.length > 0 && (
        <div className="error-banner">
          {errors.map((e) => (
            <div key={e.loc ? `${e.loc.start.line}:${e.message}` : e.message}>
              {e.loc ? `Line ${e.loc.start.line}: ${e.message}` : e.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
