import { useRef, useState, useCallback, type WheelEvent, type MouseEvent } from "react";
import type { Diagnostic } from "@karasu/core";

interface PreviewPaneProps {
  svg: string;
  diagnostics: Diagnostic[];
  viewPath: string[];
  onDrillDown: (newPath: string[]) => void;
}

const CLICK_THRESHOLD = 3;

export function PreviewPane({ svg, diagnostics, viewPath, onDrillDown }: PreviewPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
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
    [transform.x, transform.y]
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
    [isDragging]
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      const wasDragging = isDragging;
      setIsDragging(false);

      if (!wasDragging) return;

      // Only trigger drill-down if mouse didn't move (click, not drag)
      const dx = Math.abs(e.clientX - mouseDownPos.current.x);
      const dy = Math.abs(e.clientY - mouseDownPos.current.y);
      if (dx > CLICK_THRESHOLD || dy > CLICK_THRESHOLD) return;

      // Find the clicked node
      const target = e.target as Element;
      const nodeGroup = target.closest("[data-node-id]");
      if (!nodeGroup) return;

      // Check if the node has cursor: pointer (means it has children)
      const style = nodeGroup.getAttribute("style");
      if (!style || !style.includes("cursor: pointer")) return;

      const nodeId = nodeGroup.getAttribute("data-node-id");
      if (nodeId) {
        onDrillDown([...viewPath, nodeId]);
      }
    },
    [isDragging, viewPath, onDrillDown]
  );

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

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
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
      >
        <div
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: "center center",
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      {errors.length > 0 && (
        <div className="error-banner">
          {errors.map((e, i) => (
            <div key={i}>
              {e.loc
                ? `Line ${e.loc.start.line}: ${e.message}`
                : e.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
