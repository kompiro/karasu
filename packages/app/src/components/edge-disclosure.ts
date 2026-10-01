/**
 * Progressive disclosure of edges on the preview (#3022, spike): the two tiers
 * past the canvas.
 *
 * - **Node focus.** Hovering a card keeps that node's edges at full strength
 *   and dims every other edge, so one node's dependencies read on their own.
 * - **Edge hover.** Hovering an edge whose label the canvas truncated or
 *   withheld (`data-edge-label-withheld`) shows the authored text in a tooltip.
 *
 * Plain DOM, no React: the focus rule lives in a `<style>` element and the
 * tooltip in one `<div>` beside the diagram. Neither is React state and neither
 * touches the SVG's own DOM, so both survive the diagram being re-injected and
 * never re-render the pane (the AT-1186 constraint). It also lets a spike
 * report attach the same behaviour to a diagram outside the app.
 *
 * The tooltip is HTML on purpose. Edges paint before node cards, so a label
 * revealed inside the SVG's edge group is buried by any card it overlaps.
 */

let nextScope = 0;

/** A CSS string body for use inside double quotes. */
const quote = (value: string): string => value.replace(/["\\]/g, "\\$&");

export function attachEdgeDisclosure(container: HTMLElement): () => void {
  const doc = container.ownerDocument;
  // Scope the injected rule to this container: two diagrams on one page share
  // node ids, and focusing a node in one must not dim the other.
  const scopeId = String(nextScope++);
  container.setAttribute("data-edge-disclosure", scopeId);
  const scope = `[data-edge-disclosure="${scopeId}"] svg`;

  const style = doc.createElement("style");
  doc.head.appendChild(style);
  const tip = doc.createElement("div");
  tip.className = "edge-label-tip";
  tip.hidden = true;
  container.appendChild(tip);

  let ruleKey = "";
  const setRule = (key: string, css: string) => {
    if (key === ruleKey) return;
    ruleKey = key;
    style.textContent = css;
  };

  const placeTip = (e: MouseEvent) => {
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left + 14;
    const y = e.clientY - rect.top + 18;
    const maxX = rect.width - tip.offsetWidth - 8;
    const below = y + tip.offsetHeight + 8 <= rect.height;
    tip.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
    tip.style.top = `${below ? y : Math.max(8, y - tip.offsetHeight - 30)}px`;
  };

  const onOver = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (!target?.closest) return;
    const edge = target.closest(".krs-edge");
    const node = edge ? null : target.closest("[data-node-id]");

    if (node) {
      const id = quote(node.getAttribute("data-node-id") ?? "");
      const mine = `:is([data-edge-from="${id}"],[data-edge-to="${id}"])`;
      const myHops = `:is([data-hop-from="${id}"],[data-hop-to="${id}"])`;
      setRule(
        `node:${id}`,
        `${scope} .krs-edge:not(${mine}){opacity:0.12 !important}` +
          `${scope} .crossing-marks > :not(${myHops}){opacity:0.12}`,
      );
    } else if (edge) {
      // The peer dim itself is the stylesheet's (AT-1186). This only makes the
      // other edges' hop marks follow their lines down.
      const from = quote(edge.getAttribute("data-edge-from") ?? "");
      const to = quote(edge.getAttribute("data-edge-to") ?? "");
      setRule(
        `edge:${from}->${to}`,
        `${scope} .crossing-marks > :not([data-hop-from="${from}"][data-hop-to="${to}"]){opacity:0.25}`,
      );
    } else {
      setRule("", "");
    }

    const withheld = edge?.hasAttribute("data-edge-label-withheld")
      ? edge.getAttribute("data-edge-label")
      : null;
    // A pressed button is a pan in progress, not a reader pausing on an edge.
    if (withheld && e.buttons === 0) {
      tip.textContent = withheld;
      tip.hidden = false;
      placeTip(e);
    } else {
      tip.hidden = true;
    }
  };

  const onMove = (e: MouseEvent) => {
    if (tip.hidden) return;
    if (e.buttons !== 0) {
      tip.hidden = true;
      return;
    }
    placeTip(e);
  };

  const onLeave = () => {
    setRule("", "");
    tip.hidden = true;
  };

  container.addEventListener("mouseover", onOver);
  container.addEventListener("mousemove", onMove);
  container.addEventListener("mouseleave", onLeave);
  return () => {
    container.removeEventListener("mouseover", onOver);
    container.removeEventListener("mousemove", onMove);
    container.removeEventListener("mouseleave", onLeave);
    container.removeAttribute("data-edge-disclosure");
    style.remove();
    tip.remove();
  };
}
