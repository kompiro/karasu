/**
 * Node focus (#3022 slice B, #3031): the hover tier between the canvas and the
 * focus canvas.
 *
 * Hovering a card keeps that node's edges at full strength and dims every
 * other edge, so one node's dependencies read on their own. A `⇄ Relations N`
 * pill appears across the card's top edge; pressing it opens the node's focus
 * canvas. The card itself cannot be the entry: clicking it is drill-down.
 *
 * Plain DOM, no React: the dim rule lives in a `<style>` element and the pill
 * is one `<button>` beside the diagram. Neither is React state and neither
 * touches the SVG's own DOM, so hovering never re-renders the pane and both
 * survive the diagram being re-injected (AT-1186 AT-D).
 */

export interface NodeFocusOptions {
  /** The pill's text for a node with `count` edges. */
  relationsLabel: (count: number) => string;
  /** The pill was pressed on node `id`. */
  onRelations: (id: string) => void;
  /** While true, hovering does nothing: the focus canvas is open over the diagram. */
  isSuspended: () => boolean;
}

let nextScope = 0;

/** A CSS string body for use inside double quotes. */
const quote = (value: string): string => value.replace(/["\\]/g, "\\$&");

/**
 * Attaches node focus to `container` (the element the diagram's `<svg>` is
 * injected into, or an ancestor of it). `options` is read on every event, so
 * a caller may pass an object it mutates. Returns the detach function.
 */
export function attachNodeFocus(container: HTMLElement, options: NodeFocusOptions): () => void {
  const doc = container.ownerDocument;
  // Scope the rule to this container: two diagrams on one page share node
  // ids, and focusing a node in one must not dim the other.
  const scopeId = String(nextScope++);
  container.setAttribute("data-node-focus", scopeId);
  const scope = `[data-node-focus="${scopeId}"] svg:not(.focus-canvas__svg)`;

  const style = doc.createElement("style");
  doc.head.appendChild(style);
  const pill = doc.createElement("button");
  pill.type = "button";
  pill.className = "node-focus-pill";
  pill.hidden = true;
  container.appendChild(pill);

  let focused: string | null = null;

  const clear = () => {
    focused = null;
    style.textContent = "";
    pill.hidden = true;
  };

  /**
   * The node's edges on the canvas on screen that the focus canvas can draw:
   * self-loops aside, and only between two cards (an edge to something that is
   * not a card has no card to place at its other end). The pill shows this
   * number, so it must count what the canvas will draw.
   */
  const countEdges = (id: string): number => {
    const cards = new Set(
      [...container.querySelectorAll(`${scope} [data-node-id]`)].map((c) =>
        c.getAttribute("data-node-id"),
      ),
    );
    let n = 0;
    for (const g of container.querySelectorAll(
      `${scope} .krs-edge[data-edge-from][data-edge-to]`,
    )) {
      const from = g.getAttribute("data-edge-from");
      const to = g.getAttribute("data-edge-to");
      if (from === to || !cards.has(from) || !cards.has(to)) continue;
      if (from === id || to === id) n++;
    }
    return n;
  };

  const onOver = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (!target?.closest || target === pill) return;
    // A pressed button is a pan in progress, not a reader pausing on a card.
    if (options.isSuspended() || e.buttons !== 0) {
      clear();
      return;
    }
    const card = target.closest(".krs-edge") ? null : target.closest(`${scope} [data-node-id]`);
    const id = card?.getAttribute("data-node-id") ?? null;
    if (!card || !id) {
      clear();
      return;
    }
    if (id === focused) return;
    const count = countEdges(id);
    if (count === 0) {
      clear();
      return;
    }
    focused = id;
    const mine = `:is([data-edge-from="${quote(id)}"],[data-edge-to="${quote(id)}"])`;
    style.textContent = `${scope} .krs-edge:not(${mine}){opacity:0.12 !important}`;
    pill.textContent = options.relationsLabel(count);
    // Not `data-node-id`: the pill is not a card, and every query that finds
    // cards by that attribute (the pane's, the e2e suite's) must not find it.
    pill.dataset.focusTarget = id;
    pill.hidden = false;
    // Across the card's top edge at the right: reachable from the card without
    // crossing anything else, and clear of the card's own text.
    const box = card.getBoundingClientRect();
    const host = container.getBoundingClientRect();
    pill.style.left = `${box.right - host.left - pill.offsetWidth - 8}px`;
    pill.style.top = `${box.top - host.top - pill.offsetHeight / 2}px`;
  };

  const onLeave = () => clear();

  // The pill is not part of the diagram: a press on it must not pan the
  // diagram or reach the pane's click handling underneath.
  const stop = (e: Event) => e.stopPropagation();
  const onPill = (e: MouseEvent) => {
    e.stopPropagation();
    const id = pill.dataset.focusTarget;
    clear();
    if (id) options.onRelations(id);
  };

  for (const type of ["mousedown", "mouseup", "dblclick", "contextmenu", "wheel"]) {
    pill.addEventListener(type, stop);
  }
  pill.addEventListener("click", onPill);
  container.addEventListener("mouseover", onOver);
  container.addEventListener("mouseleave", onLeave);
  return () => {
    container.removeEventListener("mouseover", onOver);
    container.removeEventListener("mouseleave", onLeave);
    container.removeAttribute("data-node-focus");
    style.remove();
    pill.remove();
  };
}
