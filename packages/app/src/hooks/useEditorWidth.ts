import { useCallback, useEffect, type MouseEvent, type RefObject } from "react";
import { usePersistedPanelWidth } from "./usePersistedPanelWidth.js";

export const EDITOR_WIDTH_STORAGE_KEY = "karasu:editor:width";
export const EDITOR_MIN_WIDTH = 320;
export const PREVIEW_MIN_WIDTH = 320;

function clampToViewport(width: number, viewportWidth: number): number {
  const max = Math.max(EDITOR_MIN_WIDTH, viewportWidth - PREVIEW_MIN_WIDTH);
  return Math.min(max, Math.max(EDITOR_MIN_WIDTH, width));
}

interface UseEditorWidthResult {
  editorWidth: number | null;
  isDragging: boolean;
  onMouseDown: (e: MouseEvent) => void;
  onDoubleClick: () => void;
}

/**
 * Editor/preview split width. Built on {@link usePersistedPanelWidth} (#1543)
 * with the editor-specific policy: a nullable width (null = unconstrained
 * default), a viewport-relative clamp (editor min vs viewport − preview min),
 * and a window-resize listener that re-clamps when the viewport shrinks.
 */
export function useEditorWidth(containerRef: RefObject<HTMLElement | null>): UseEditorWidthResult {
  const clamp = useCallback(
    (width: number) => {
      const container = containerRef.current;
      if (!container) return Math.max(EDITOR_MIN_WIDTH, width);
      return clampToViewport(width, container.getBoundingClientRect().width);
    },
    [containerRef],
  );

  const measureStart = useCallback(
    (e: MouseEvent) => {
      const container = containerRef.current;
      const rect = container?.getBoundingClientRect();
      if (rect && e.currentTarget instanceof HTMLElement) {
        return e.currentTarget.getBoundingClientRect().left - rect.left;
      }
      return rect ? rect.width / 2 : EDITOR_MIN_WIDTH;
    },
    [containerRef],
  );

  const { width, isDragging, onMouseDown, onDoubleClick, reclamp } = usePersistedPanelWidth({
    storageKey: EDITOR_WIDTH_STORAGE_KEY,
    defaultWidth: null,
    clamp,
    measureStart,
  });

  // Re-clamp when the viewport shrinks so the editor never exceeds
  // viewport − preview-min.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("resize", reclamp);
    return () => window.removeEventListener("resize", reclamp);
  }, [reclamp]);

  return { editorWidth: width, isDragging, onMouseDown, onDoubleClick };
}
