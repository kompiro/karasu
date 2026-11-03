import { useEffect, useLayoutEffect, useSyncExternalStore, type RefObject } from "react";

/**
 * A request to keep one node of the preview in view (#3583). The first-run
 * tour asks for the node its step talks about: a diagram taller than the pane
 * opens centered, and its top cannot be scrolled to, so the step's node can
 * start half outside the pane.
 *
 * It lives outside the app state because only the tour asks and only the
 * preview pane answers; threading it through the preview context would touch
 * every view for one caller. `seq` makes a repeated request for the same node
 * a new value.
 */
export interface RevealRequest {
  nodeId: string;
  seq: number;
}

let current: RevealRequest | null = null;
let nextSeq = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Asks the preview to keep `nodeId` in view, or withdraws the request (`null`). */
export function requestReveal(nodeId: string | null): void {
  if (nodeId === null && current === null) return;
  current = nodeId === null ? null : { nodeId, seq: nextSeq++ };
  emit();
}

/** Withdraws the current request: the user has panned or zoomed themselves. */
export function dismissReveal(): void {
  requestReveal(null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): RevealRequest | null {
  return current;
}

export function useRevealRequest(): RevealRequest | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** How far the pane keeps a revealed node from its edges. */
export const REVEAL_MARGIN = 24;

function axisDelta(start: number, end: number, paneStart: number, paneEnd: number): number {
  const min = paneStart + REVEAL_MARGIN;
  const max = paneEnd - REVEAL_MARGIN;
  // Larger than the pane: show its start, where the node's name is.
  if (end - start > max - min) return min - start;
  if (start < min) return min - start;
  if (end > max) return max - end;
  return 0;
}

/**
 * The smallest shift that brings `node` inside `pane` (both in screen
 * coordinates). Zero when it is already inside, so applying it again after
 * every render never moves a node that is in view.
 */
export function revealDelta(node: Rect, pane: Rect): { x: number; y: number } {
  return {
    x: axisDelta(node.left, node.right, pane.left, pane.right),
    y: axisDelta(node.top, node.bottom, pane.top, pane.bottom),
  };
}

type Pan = { scale: number; x: number; y: number };

/**
 * Keeps the requested node inside the preview pane by panning it (#3583). A
 * diagram taller than the pane opens centered with its top out of reach, so
 * the node a tour step names can start half outside. Re-applied when the
 * request, the diagram or its key changes, because the scene's diagram can
 * land after the request. The pan is set from where the node sits with no pan
 * (only a reveal moves it while a request stands: a press or wheel in the pane
 * withdraws the request), so the result does not depend on the steps the
 * visitor took to get here, and it never fights the user.
 *
 * While a request stands it applies to whatever this pane shows, so a visitor
 * who switches tabs during a tour step sees the node kept in view there too.
 * It keeps the node inside the pane only: whether the tour panel, which floats
 * over the editor, stays clear of it is checked at the default desktop size
 * by the first-run e2e, not guaranteed here.
 */
export function useRevealNode(
  containerRef: RefObject<HTMLElement | null>,
  svgRef: RefObject<HTMLElement | null>,
  setTransform: (update: (prev: Pan) => Pan) => void,
  svg: string,
  diagramKey: string | undefined,
): void {
  const reveal = useRevealRequest();
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Scrolling a subtree that owns its wheel (a detail panel) does not pan.
    const onWheel = (e: WheelEvent) => {
      if (!(e.target as Element | null)?.closest?.("[data-wheel-zoom-ignore]")) dismissReveal();
    };
    el.addEventListener("pointerdown", dismissReveal);
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", dismissReveal);
      el.removeEventListener("wheel", onWheel);
    };
  }, [containerRef]);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!reveal || !container || !svgRef.current) return;
    const target = svgRef.current.querySelector(`[data-node-id="${CSS.escape(reveal.nodeId)}"]`);
    if (!target) return;
    const node = target.getBoundingClientRect();
    const pane = container.getBoundingClientRect();
    setTransform((prev) => {
      // The translate is in screen pixels, so taking it off gives the node's
      // box with no pan; the reveal's shift from there is the pan to set.
      const d = revealDelta(
        {
          left: node.left - prev.x,
          right: node.right - prev.x,
          top: node.top - prev.y,
          bottom: node.bottom - prev.y,
        },
        pane,
      );
      return d.x === prev.x && d.y === prev.y ? prev : { ...prev, x: d.x, y: d.y };
    });
    // `svg` and `diagramKey` are triggers: a new diagram (or the transform
    // reset that comes with a new key) moves the node again.
    // eslint-disable-next-line react/exhaustive-effect-dependencies
  }, [reveal, svg, diagramKey, containerRef, svgRef, setTransform]);
}
