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
 * the node a tour step names can start half outside. Re-applied after every
 * render while the request stands, because the scene's diagram can land after
 * the request; the shift is zero once the node is inside, and a press or
 * wheel in the pane withdraws the request, so it never fights the user.
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
    el.addEventListener("mousedown", dismissReveal);
    el.addEventListener("wheel", dismissReveal, { passive: true });
    return () => {
      el.removeEventListener("mousedown", dismissReveal);
      el.removeEventListener("wheel", dismissReveal);
    };
  }, [containerRef]);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!reveal || !container || !svgRef.current) return;
    const target = svgRef.current.querySelector(`[data-node-id="${CSS.escape(reveal.nodeId)}"]`);
    if (!target) return;
    const d = revealDelta(target.getBoundingClientRect(), container.getBoundingClientRect());
    if (d.x === 0 && d.y === 0) return;
    setTransform((prev) => ({ ...prev, x: prev.x + d.x, y: prev.y + d.y }));
    // `svg` and `diagramKey` are triggers: a new diagram (or the transform
    // reset that comes with a new key) moves the node again.
    // eslint-disable-next-line react/exhaustive-effect-dependencies
  }, [reveal, svg, diagramKey, containerRef, svgRef, setTransform]);
}
