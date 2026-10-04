import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "../../i18n/index.js";
import { buildFocusCanvas, chooseLayout, type Focus, type FocusSource } from "./build.js";

/** The overlay's padding on each side, which the panel cannot use. */
const OVERLAY_PADDING = 24;

export interface FocusCanvasProps {
  source: FocusSource;
  /** What the canvas has shown, oldest first. The last entry is on screen. */
  trail: readonly Focus[];
  /** Show `focus` next, keeping the trail for Back. */
  onNavigate: (focus: Focus) => void;
  onBack: () => void;
  onClose: () => void;
}

// A press on the overlay is not a press on the diagram under it: it must not
// start a pan, open a panel or a context menu, or drill down.
const stop = (e: MouseEvent) => e.stopPropagation();

/**
 * The focus canvas (#3031): one edge, or one node with its neighbours, drawn
 * over the preview with every label in full. Not modal: it covers the preview
 * pane only, so the editor stays usable, and it is rebuilt from each new
 * diagram (`source`).
 */
export function FocusCanvas({ source, trail, onNavigate, onBack, onClose }: FocusCanvasProps) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState(0);
  const focus = trail[trail.length - 1];

  useLayoutEffect(() => {
    const measure = () =>
      setPaneWidth(Math.max(0, (overlayRef.current?.clientWidth ?? 0) - OVERLAY_PADDING * 2));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const drawing = useMemo(() => {
    const layout = focus.kind === "node" ? chooseLayout(source, focus.id, paneWidth) : undefined;
    return buildFocusCanvas(source, focus, layout);
  }, [source, focus, paneWidth]);
  const html = useMemo(() => ({ __html: drawing.svg }), [drawing]);

  // Not a Radix Dialog (that is for modal dialogs, `.claude/rules/dialog.md`),
  // so Esc is ours to handle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A canvas taller than the panel opens on the node it is about, not on its
  // first neighbour.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const centre =
      focus.kind === "node"
        ? body.querySelector(`[data-focus-node="${CSS.escape(focus.id)}"]`)
        : null;
    if (!centre) {
      body.scrollTop = 0;
      return;
    }
    const card = centre.getBoundingClientRect();
    const view = body.getBoundingClientRect();
    body.scrollTop += card.top - view.top - (view.height - card.height) / 2;
    // `html` is a trigger, not a value this body reads: each new drawing
    // replaces the body's content, so the scroll has to be set again.
    // eslint-disable-next-line react/exhaustive-effect-dependencies
  }, [html, focus]);

  const name = (id: string) => source.cards.get(id)?.name ?? id;
  const title = focus.kind === "edge" ? `${name(focus.from)} → ${name(focus.to)}` : name(focus.id);

  const onBodyClick = (e: MouseEvent) => {
    const target = e.target as Element;
    const card = target.closest("[data-focus-node]")?.getAttribute("data-focus-node");
    if (card) {
      if (!(focus.kind === "node" && focus.id === card)) onNavigate({ kind: "node", id: card });
      return;
    }
    const lane = target.closest("[data-focus-from]");
    if (lane && focus.kind === "node") {
      onNavigate({
        kind: "edge",
        from: lane.getAttribute("data-focus-from") ?? "",
        to: lane.getAttribute("data-focus-to") ?? "",
      });
    }
  };

  return (
    <div
      ref={overlayRef}
      className="focus-canvas"
      // The pane's wheel zoom is a native listener; this is how a subtree that
      // scrolls on its own opts out of it (#1537).
      data-wheel-zoom-ignore=""
      onMouseDown={stop}
      onMouseUp={stop}
      onDoubleClick={stop}
      onContextMenu={stop}
      onClick={(e) => {
        stop(e);
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="focus-canvas__panel"
        role="region"
        aria-label={t("focusCanvas.region")}
        data-focus={focus.kind}
        data-focus-layout={drawing.layout ?? undefined}
      >
        <div className="focus-canvas__bar">
          {trail.length > 1 && (
            <Button className="focus-canvas__back" onClick={onBack}>
              {t("focusCanvas.back")}
            </Button>
          )}
          <span className="focus-canvas__title">{title}</span>
          {focus.kind === "node" && (
            <span className="focus-canvas__count">
              {t("focusCanvas.counts", { incoming: drawing.incoming, outgoing: drawing.outgoing })}
            </span>
          )}
          <Button className="focus-canvas__close" onClick={onClose}>
            {t("focusCanvas.close")}
          </Button>
        </div>
        <div
          ref={bodyRef}
          className="focus-canvas__body"
          onClick={onBodyClick}
          dangerouslySetInnerHTML={html}
        />
      </div>
    </div>
  );
}
