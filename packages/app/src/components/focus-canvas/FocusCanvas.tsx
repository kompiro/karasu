import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "../../i18n/index.js";
import { buildFocusCanvas, type Focus, type FocusSource } from "./build.js";

/** Text on the canvas that a press selects instead of panning: edge labels and what the cards say. */
const SELECTABLE = ".focus-canvas__label, .focus-canvas__card text";

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
  /**
   * Where keyboard focus goes on close when the element that had it at open
   * time is gone. Opened from the command palette, that element was the
   * palette's own input; the place the reader came from is the caller's to say.
   */
  returnFocus?: () => HTMLElement | null;
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
export function FocusCanvas({
  source,
  trail,
  onNavigate,
  onBack,
  onClose,
  returnFocus,
}: FocusCanvasProps) {
  const { t } = useTranslation();
  const bodyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // An edit redraws the canvas without a move: the card or lane that had
  // focus is replaced with the drawing. Keep focus in the canvas then, but
  // only if it was there: an edit typed in the editor keeps the editor's.
  const focusInDrawing = useRef(false);
  /** Focus the panel itself: no card or lane of the drawing has focus after. */
  const focusPanel = useCallback(() => {
    focusInDrawing.current = false;
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  // Keyboard focus (#3057): the canvas takes it when it opens and after every
  // move (a card or lane that was pressed is gone with the drawing it was in),
  // and hands it back to whatever had it before when the canvas closes.
  const returnFocusRef = useRef(returnFocus);
  useEffect(() => {
    returnFocusRef.current = returnFocus;
  });
  useEffect(() => {
    const before = document.activeElement;
    return () => {
      const target =
        before instanceof HTMLElement && before.isConnected ? before : returnFocusRef.current?.();
      target?.focus();
    };
  }, []);
  useEffect(() => {
    focusPanel();
    // `trail` is a trigger, not a value this body reads: each move replaces
    // the drawing, and the control that had focus with it.
    // eslint-disable-next-line react/exhaustive-effect-dependencies
  }, [trail, focusPanel]);
  // Drag to move the view, as on the main canvas: a press anywhere in the
  // canvas starts a pan, and one that moved past the threshold is not a click
  // on whatever card or line it ended over.
  const pan = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(
    null,
  );
  const suppressClick = useRef(false);
  // Whether the press that ends in a click began on the backdrop. A drag that
  // starts in the canvas and ends on the backdrop also clicks the backdrop
  // (the click goes to the two targets' common ancestor); that is a pan, not
  // a request to close.
  const pressedBackdrop = useRef(false);
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
    // Capture phase: the overlay stops a release inside it from bubbling (so
    // the diagram underneath never sees it), which would also keep it from a
    // bubbling listener here and leave the pan running after the button is up.
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
    return () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
    };
  }, [panning]);

  const onBodyMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || !bodyRef.current) return;
    // A press on text (a label, or what a card says) is for selecting it: the
    // browser's selection, not a pan. Panning starts from anywhere else.
    if ((e.target as Element).closest(SELECTABLE)) return;
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

  useEffect(() => {
    const active = document.activeElement;
    if (focusInDrawing.current && !(active && bodyRef.current?.contains(active))) focusPanel();
    // `html` is a trigger, not a value this body reads: a new drawing
    // replaces the control that had focus.
    // eslint-disable-next-line react/exhaustive-effect-dependencies
  }, [html, focusPanel]);

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

  /** What a press on `target` does: move to its card's node, or to its lane's pair. */
  const activate = (target: Element) => {
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

  const onBodyClick = (e: MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    // The end of a text selection is not a click on the card or lane under it.
    if (window.getSelection()?.toString()) return;
    activate(e.target as Element);
  };

  // A card or lane is a button (`role="button"`, `tabindex="0"`): Enter and
  // Space press it, as a click does (#3057).
  const onBodyKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const control = (e.target as Element).closest('[role="button"]');
    if (!control || !bodyRef.current?.contains(control)) return;
    e.preventDefault();
    activate(control);
  };

  return (
    <div
      className="focus-canvas"
      // The pane's wheel zoom is a native listener; this is how a subtree that
      // scrolls on its own opts out of it (#1537).
      data-wheel-zoom-ignore=""
      onMouseDown={(e) => {
        stop(e);
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={stop}
      onDoubleClick={stop}
      onContextMenu={stop}
      onClick={(e) => {
        stop(e);
        if (e.target === e.currentTarget && pressedBackdrop.current) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="focus-canvas__panel"
        tabIndex={-1}
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
          onKeyDown={onBodyKeyDown}
          onFocus={() => {
            focusInDrawing.current = true;
          }}
          onBlur={(e) => {
            // A blur toward somewhere else is a real move. A control removed
            // by a redraw blurs (if at all) toward nothing.
            if (e.relatedTarget && !bodyRef.current?.contains(e.relatedTarget)) {
              focusInDrawing.current = false;
            }
          }}
          dangerouslySetInnerHTML={html}
        />
      </div>
    </div>
  );
}
