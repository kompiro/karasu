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
 *
 * The crossing marks (hops, count chips, trunk bands) are drawn in layers of
 * their own, outside the edge groups, so a rule on `.krs-edge` leaves them
 * bright. Each mark names its edges in `data-edges` and those edges carry the
 * index in `data-edge-index`, so the rule dims the marks of the dimmed edges
 * too (#3090). The same goes for edge hover (#1186): `preview.css` dims the
 * peer edges with `:hover`, which cannot reach the marks, so this module dims
 * theirs.
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
 * The edges whose hover dims their peers (#1186). `preview.css` dims the peer
 * edges on the same selector and this module dims their marks, so widening it
 * (#2632) means changing both.
 */
const EDGE_HOVER_TRIGGER = ".krs-edge--interactive";

/** What node focus dims the other edges to. */
const NODE_FOCUS_DIM = 0.12;
/** What edge hover dims the other edges to; `preview.css` uses the same value. */
const EDGE_HOVER_DIM = 0.25;

/**
 * A rule dimming, inside `scope`, every crossing mark that belongs to none of
 * the edges in `keep` (their `data-edge-index` values). A chip or band carries
 * several edges and stays bright while any of them is kept: it is part of the
 * path in focus. With nothing to keep, every mark dims.
 */
function marksDimRule(scope: string, keep: readonly string[], opacity: number): string {
  const kept =
    keep.length > 0 ? `:not(:is(${keep.map((i) => `[data-edges~="${quote(i)}"]`).join(",")}))` : "";
  return `${scope} [data-edges]${kept}{opacity:${opacity} !important}`;
}

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

  /** What the rule is for: `node:<id>` or `edge:<index>`. */
  let focused: string | null = null;

  const clear = () => {
    focused = null;
    style.textContent = "";
    pill.hidden = true;
  };

  /** Hovering an edge dims the other edges' marks; the edges dim in CSS. */
  const focusEdge = (edge: Element) => {
    if (!edge.matches(`${scope} ${EDGE_HOVER_TRIGGER}`)) {
      clear();
      return;
    }
    // An edge with no index has no marks, so every mark belongs to a peer.
    const index = edge.getAttribute("data-edge-index");
    const key = `edge:${index ?? ""}`;
    if (key === focused) return;
    focused = key;
    pill.hidden = true;
    style.textContent = marksDimRule(scope, index === null ? [] : [index], EDGE_HOVER_DIM);
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
    const edge = target.closest(".krs-edge");
    if (edge) {
      focusEdge(edge);
      return;
    }
    const card = target.closest(`${scope} [data-node-id]`);
    const id = card?.getAttribute("data-node-id") ?? null;
    if (!card || !id) {
      clear();
      return;
    }
    if (`node:${id}` === focused) return;
    const count = countEdges(id);
    if (count === 0) {
      clear();
      return;
    }
    focused = `node:${id}`;
    const mine = `:is([data-edge-from="${quote(id)}"],[data-edge-to="${quote(id)}"])`;
    const keep = [...container.querySelectorAll(`${scope} .krs-edge${mine}[data-edge-index]`)].map(
      (g) => g.getAttribute("data-edge-index")!,
    );
    style.textContent =
      `${scope} .krs-edge:not(${mine}){opacity:${NODE_FOCUS_DIM} !important}` +
      marksDimRule(scope, keep, NODE_FOCUS_DIM);
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
