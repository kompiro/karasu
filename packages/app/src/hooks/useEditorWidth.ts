import { useCallback, useEffect, useRef, useState } from "react";

export const EDITOR_WIDTH_STORAGE_KEY = "karasu:editor:width";
export const EDITOR_MIN_WIDTH = 320;
export const PREVIEW_MIN_WIDTH = 320;

function readPersistedWidth(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage?.getItem(EDITOR_WIDTH_STORAGE_KEY);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function clampToViewport(width: number, viewportWidth: number): number {
  const max = Math.max(EDITOR_MIN_WIDTH, viewportWidth - PREVIEW_MIN_WIDTH);
  return Math.min(max, Math.max(EDITOR_MIN_WIDTH, width));
}

interface UseEditorWidthResult {
  editorWidth: number | null;
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
}

export function useEditorWidth(
  containerRef: React.RefObject<HTMLElement | null>,
): UseEditorWidthResult {
  const [editorWidth, setEditorWidth] = useState<number | null>(readPersistedWidth);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (editorWidth == null) {
      window.localStorage?.removeItem(EDITOR_WIDTH_STORAGE_KEY);
    } else {
      window.localStorage?.setItem(EDITOR_WIDTH_STORAGE_KEY, String(editorWidth));
    }
  }, [editorWidth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      const container = containerRef.current;
      if (!container) return;
      setEditorWidth((current) => {
        if (current == null) return current;
        const viewport = container.getBoundingClientRect().width;
        const clamped = clampToViewport(current, viewport);
        return clamped === current ? current : clamped;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [containerRef]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const startWidth =
        editorWidth ??
        (e.currentTarget instanceof HTMLElement
          ? e.currentTarget.getBoundingClientRect().left - rect.left
          : rect.width / 2);
      dragStateRef.current = { startX: e.clientX, startWidth };
      setIsDragging(true);
    },
    [editorWidth, containerRef],
  );

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const state = dragStateRef.current;
      const container = containerRef.current;
      if (!state || !container) return;
      const viewport = container.getBoundingClientRect().width;
      const next = clampToViewport(state.startWidth + (e.clientX - state.startX), viewport);
      setEditorWidth(next);
    };
    const onUp = () => {
      dragStateRef.current = null;
      setIsDragging(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, containerRef]);

  const onDoubleClick = useCallback(() => {
    setEditorWidth(null);
  }, []);

  return { editorWidth, isDragging, onMouseDown, onDoubleClick };
}
