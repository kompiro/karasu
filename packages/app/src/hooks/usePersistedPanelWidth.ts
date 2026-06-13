import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";

function readPersistedWidth(storageKey: string): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage?.getItem(storageKey);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

interface PersistedPanelWidthOptions {
  /** localStorage key the width is persisted under. */
  storageKey: string;
  /**
   * Width used when nothing is persisted and on double-click reset. `null`
   * means "no explicit width" (the panel falls back to a layout default and
   * persists nothing) — used by the editor split where the width is optional;
   * a number is a fixed default — used by the sidebar.
   */
  defaultWidth: number | null;
  /**
   * Clamp a candidate width to the panel's allowed range. The caller closes
   * over its own min/max (and, for viewport-relative panels, the live
   * container width), so this hook stays agnostic to the clamping policy.
   */
  clamp: (width: number) => number;
  /**
   * Width to seed a drag from when there is no current width yet (the editor's
   * first drag, where width starts null). Receives the mousedown event.
   */
  measureStart: (e: MouseEvent) => number;
  /**
   * Clamp the persisted value on hydration. Use when `clamp` is
   * viewport-independent (fixed min/max), so an out-of-range stored value never
   * renders unclamped before the first interaction. Leave off when `clamp`
   * depends on a container that isn't measurable at first render (the editor
   * defers its viewport clamp to its resize listener). Default false.
   */
  clampInitial?: boolean;
}

interface PersistedPanelWidthResult {
  /** `null` only when `defaultWidth` is null and nothing is persisted. */
  width: number | null;
  isDragging: boolean;
  onMouseDown: (e: MouseEvent) => void;
  /** Double-click the handle to reset to `defaultWidth`. */
  onDoubleClick: () => void;
  /** Re-apply `clamp` to the current width — e.g. from a window resize listener. */
  reclamp: () => void;
}

/**
 * Drag-to-resize state for a persisted panel width (#1543). Shared by the
 * editor/preview split (`useEditorWidth`) and the sidebar (`EditArea`), which
 * previously each hand-rolled the identical drag-state ref, window
 * mousemove/mouseup listener lifecycle, localStorage persistence, and
 * double-click reset. The per-panel policy (fixed min/max vs viewport-relative,
 * nullable vs fixed default) is injected via `clamp` / `defaultWidth` /
 * `measureStart`, keeping the hook policy-agnostic.
 *
 * Callers must pass stable `clamp` / `measureStart` (e.g. via `useCallback`) so
 * the drag effect does not re-subscribe on every render.
 */
export function usePersistedPanelWidth({
  storageKey,
  defaultWidth,
  clamp,
  measureStart,
  clampInitial = false,
}: PersistedPanelWidthOptions): PersistedPanelWidthResult {
  const [width, setWidth] = useState<number | null>(() => {
    const persisted = readPersistedWidth(storageKey);
    if (persisted == null) return defaultWidth;
    // Clamp on hydration only when the clamp is viewport-independent, so an
    // out-of-range stored value can't render unclamped before the first drag
    // (restores the sidebar's prior read-time clamp). The editor opts out and
    // re-clamps via its resize listener after the container mounts.
    return clampInitial ? clamp(persisted) : persisted;
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Persist on change: a number is stored, null clears the key.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (width == null) {
      window.localStorage?.removeItem(storageKey);
    } else {
      window.localStorage?.setItem(storageKey, String(width));
    }
  }, [storageKey, width]);

  const onMouseDown = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      dragStateRef.current = { startX: e.clientX, startWidth: width ?? measureStart(e) };
      setIsDragging(true);
    },
    [width, measureStart],
  );

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: globalThis.MouseEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      setWidth(clamp(drag.startWidth + (e.clientX - drag.startX)));
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
  }, [isDragging, clamp]);

  const onDoubleClick = useCallback(() => {
    setWidth(defaultWidth);
  }, [defaultWidth]);

  const reclamp = useCallback(() => {
    setWidth((current) => (current == null ? current : clamp(current)));
  }, [clamp]);

  return { width, isDragging, onMouseDown, onDoubleClick, reclamp };
}
