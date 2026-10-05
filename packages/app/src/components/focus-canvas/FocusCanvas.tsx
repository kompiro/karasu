import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "../../i18n/index.js";
import { buildFocusCanvas, type Focus, type FocusSource } from "./build.js";

/** Movement under which a press is a click, as on the main canvas (`PreviewPane`). */
const CLICK_THRESHOLD = 3;

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
  const bodyRef = useRef<HTMLDivElement>(null);
  // Drag to move the view, as on the main canvas: a press anywhere in the
  // canvas starts a pan, and one that moved past the threshold is not a click
  // on whatever card or line it ended over.
  const pan = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(
    null,
  );
  const suppressClick = useRef(false);
  const [panning, setPanning] = useState(false);

  useEffect(() => {
    if (!panning) return;
    const onMove = (e: globalThis.MouseEvent) => {
      const body = bodyRef.current;
      const start = pan.current;
      if (!body || !start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) > CLICK_THRESHOLD || Math.abs(dy) > CLICK_THRESHOLD) start.moved = true;
      if (!start.moved) return;
      body.scrollLeft = start.left - dx;
      body.scrollTop = start.top - dy;
    };
    const onUp = () => {
      suppressClick.current = pan.current?.moved ?? false;
      pan.current = null;
      setPanning(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [panning]);

  const onBodyMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || !bodyRef.current) return;
    e.preventDefault(); // no text selection while dragging
    suppressClick.current = false;
    pan.current = {
      x: e.clientX,
      y: e.clientY,
      left: bodyRef.current.scrollLeft,
      top: bodyRef.current.scrollTop,
      moved: false,
    };
    setPanning(true);
  };
  const focus = trail[trail.length - 1];

  // One layout at its natural size, whatever the pane's width: the panel
  // scrolls instead of the picture rearranging.
  const drawing = useMemo(() => buildFocusCanvas(source, focus), [source, focus]);
  const html = useMemo(() => ({ __html: drawing.svg }), [drawing]);

  // Not a Radix Dialog (that is for modal dialogs, `.claude/rules/dialog.md`),
  // so Esc is ours to handle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // The canvas is not modal: Esc in the editor (closing its suggestions)
      // or in any other field belongs to that field.
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [contenteditable], .monaco-editor")) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A canvas larger than the panel opens on what it is about: the node, or the
  // middle of the pair (where the labels are). Both axes, so a narrow pane
  // shows the subject first and scrolls to the rest.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const centre =
      focus.kind === "node"
        ? body.querySelector(`[data-focus-node="${CSS.escape(focus.id)}"]`)
        : body.querySelector(".focus-canvas__svg");
    if (!centre) return;
    const target = centre.getBoundingClientRect();
    const view = body.getBoundingClientRect();
    body.scrollLeft += target.left - view.left - (view.width - target.width) / 2;
    body.scrollTop += target.top - view.top - (view.height - target.height) / 2;
    // `html` is a trigger, not a value this body reads: each new drawing
    // replaces the body's content, so the scroll has to be set again.
    // eslint-disable-next-line react/exhaustive-effect-dependencies
  }, [html, focus]);

  const name = (id: string) => source.cards.get(id)?.name ?? id;
  const title = focus.kind === "edge" ? `${name(focus.from)} → ${name(focus.to)}` : name(focus.id);

  const onBodyClick = (e: MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
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
          data-panning={panning ? "" : undefined}
          onMouseDown={onBodyMouseDown}
          onClick={onBodyClick}
          dangerouslySetInnerHTML={html}
        />
      </div>
    </div>
  );
}
