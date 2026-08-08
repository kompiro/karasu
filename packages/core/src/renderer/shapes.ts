import type { ResolvedNodeStyle } from "../types/style.js";
import { el } from "./svg-builder.js";
import {
  registerShape,
  getShape,
  type ShapeContext,
  type ShapeRenderFn,
  type ShapeContentInsetFn,
} from "../shapes/shape-registry.js";

// ---------------------------------------------------------------------------
// Built-in shape definitions
// ---------------------------------------------------------------------------

const box: ShapeRenderFn = (ctx) =>
  el("rect", {
    x: ctx.x,
    y: ctx.y,
    width: ctx.width,
    height: ctx.height,
    rx: ctx.borderRadius,
    ry: ctx.borderRadius,
    fill: ctx.fill,
    stroke: ctx.stroke,
    "stroke-width": ctx.strokeWidth,
    "stroke-dasharray": ctx.strokeDasharray || undefined,
  });

/** Fixed medallion radius of the user card's person pictogram (never scales). */
const USER_MEDALLION_R = 13;

/**
 * #2366 proposal G: a rounded card with a fixed-size person medallion
 * straddling the top edge. The old silhouette scaled the whole body to the
 * node's W×H, so any node wide enough for a real label degraded into a
 * "tent with a dot" — the pictogram now keeps its aspect at every width.
 * The medallion stays inside the bounding box (its top touches y) so edge
 * attachment points are unaffected; the declared content inset makes the
 * text stack centre on the card area below the medallion equator.
 */
const user: ShapeRenderFn = (ctx) => {
  const { x, y, width: w, height: h, fill, stroke, strokeWidth: sw, strokeDasharray: dash } = ctx;
  const cx = x + w / 2;
  const medR = USER_MEDALLION_R;
  const medCy = y + medR;
  const cardTop = y + medR; // card straddles the medallion's equator

  const card = el("rect", {
    x,
    y: cardTop,
    width: w,
    height: h - medR,
    rx: 8,
    ry: 8,
    fill,
    stroke,
    "stroke-width": sw,
    "stroke-dasharray": dash || undefined,
  });

  const medallion = el("circle", {
    cx,
    cy: medCy,
    r: medR,
    fill,
    stroke,
    "stroke-width": sw,
    "stroke-dasharray": dash || undefined,
  });

  // Person pictogram drawn in the node's text color: head + shoulders,
  // contained inside the medallion by construction (no clipPath).
  const head = el("circle", { cx, cy: medCy - 3.5, r: 3.4, fill: ctx.color });
  const shoulders = el("path", {
    d: `M${cx - 6} ${medCy + 8.5} a6 6.5 0 0 1 12 0 Z`,
    fill: ctx.color,
  });

  return [card, medallion, head, shoulders].join("\n");
};

const userInset: ShapeContentInsetFn = () => ({
  top: USER_MEDALLION_R,
  right: 0,
  bottom: 0,
  left: 0,
});

const cylinder: ShapeRenderFn = (ctx) => {
  const { x, y, width: w, height: h, fill, stroke, strokeWidth: sw, strokeDasharray: dash } = ctx;
  const ry = Math.min(h * 0.12, 15);
  const bodyH = h - ry * 2;

  return [
    el("path", {
      d: `M${x} ${y + ry} L${x} ${y + ry + bodyH} A${w / 2} ${ry} 0 0 0 ${x + w} ${y + ry + bodyH} L${x + w} ${y + ry} A${w / 2} ${ry} 0 0 1 ${x} ${y + ry}`,
      fill,
      stroke,
      "stroke-width": sw,
      "stroke-dasharray": dash || undefined,
    }),
    el("ellipse", {
      cx: x + w / 2,
      cy: y + ry,
      rx: w / 2,
      ry,
      fill,
      stroke,
      "stroke-width": sw,
      "stroke-dasharray": dash || undefined,
    }),
  ].join("\n");
};

const queue: ShapeRenderFn = (ctx) => {
  const { x, y, width: w, height: h, fill, stroke, strokeWidth: sw, strokeDasharray: dash } = ctx;
  const rx = Math.min(w * 0.1, 15);
  const bodyW = w - rx * 2;

  return [
    el("path", {
      d: `M${x + rx} ${y} L${x + rx + bodyW} ${y} A${rx} ${h / 2} 0 0 1 ${x + rx + bodyW} ${y + h} L${x + rx} ${y + h} A${rx} ${h / 2} 0 0 0 ${x + rx} ${y}`,
      fill,
      stroke,
      "stroke-width": sw,
      "stroke-dasharray": dash || undefined,
    }),
    el("ellipse", {
      cx: x + rx + bodyW,
      cy: y + h / 2,
      rx,
      ry: h / 2,
      fill,
      stroke,
      "stroke-width": sw,
      "stroke-dasharray": dash || undefined,
    }),
  ].join("\n");
};

const hexagon: ShapeRenderFn = (ctx) => {
  const { x, y, width: w, height: h, fill, stroke, strokeWidth: sw, strokeDasharray: dash } = ctx;
  const inset = w * 0.2;
  const points = [
    `${x + inset},${y}`,
    `${x + w - inset},${y}`,
    `${x + w},${y + h / 2}`,
    `${x + w - inset},${y + h}`,
    `${x + inset},${y + h}`,
    `${x},${y + h / 2}`,
  ].join(" ");

  return el("polygon", {
    points,
    fill,
    stroke,
    "stroke-width": sw,
    "stroke-dasharray": dash || undefined,
  });
};

const cloud: ShapeRenderFn = (ctx) => {
  const { x, y, width: w, height: h, fill, stroke, strokeWidth: sw, strokeDasharray: dash } = ctx;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;

  const path = [
    `M${x + rx * 0.3} ${cy + ry * 0.3}`,
    `C${x - rx * 0.1} ${cy + ry * 0.8}, ${x + rx * 0.1} ${cy + ry}, ${cx} ${cy + ry * 0.7}`,
    `C${cx + rx * 0.3} ${cy + ry}, ${x + w + rx * 0.1} ${cy + ry * 0.6}, ${x + w - rx * 0.2} ${cy}`,
    `C${x + w + rx * 0.1} ${cy - ry * 0.5}, ${cx + rx * 0.5} ${cy - ry}, ${cx} ${cy - ry * 0.7}`,
    `C${cx - rx * 0.3} ${cy - ry * 0.9}, ${x - rx * 0.1} ${cy - ry * 0.3}, ${x + rx * 0.3} ${cy + ry * 0.3}`,
    `Z`,
  ].join(" ");

  return el("path", {
    d: path,
    fill,
    stroke,
    "stroke-width": sw,
    "stroke-dasharray": dash || undefined,
  });
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Content insets (#2366 proposal F) — each mirrors its render function's
// geometry so text never touches the drawn outline. Zero-inset shapes (box)
// simply do not register one.
// ---------------------------------------------------------------------------

const cylinderInset: ShapeContentInsetFn = (_w, h) => {
  const ry = Math.min(h * 0.12, 15);
  // Top ellipse spans 2*ry from the box top; the bottom arc dips ry deep.
  return { top: ry * 2, right: 0, bottom: ry, left: 0 };
};

const queueInset: ShapeContentInsetFn = (w) => {
  const rx = Math.min(w * 0.1, 15);
  // Right end-cap ellipse spans 2*rx; the concave left arc also reaches
  // 2*rx into the box at mid-height (its ellipse centre sits at x+rx and
  // bulges rightward), so both sides inset by the full cap depth.
  return { top: 0, right: rx * 2, bottom: 0, left: rx * 2 };
};

const hexagonInset: ShapeContentInsetFn = (w) => ({
  top: 0,
  right: w * 0.2,
  bottom: 0,
  left: w * 0.2,
});

const cloudInset: ShapeContentInsetFn = (w, h) => ({
  // The blob outline wanders inside the box. The deepest excursion is the
  // lower-left anchor at x + 0.15w (the path's start point), so the left
  // margin is 0.15w; the other sides' anchors stay within these bounds.
  top: h * 0.15,
  right: w * 0.12,
  bottom: h * 0.15,
  left: w * 0.15,
});

export function registerBuiltinShapes(): void {
  registerShape("box", box);
  registerShape("user", user, userInset);
  registerShape("cylinder", cylinder, cylinderInset);
  registerShape("queue", queue, queueInset);
  registerShape("hexagon", hexagon, hexagonInset);
  registerShape("cloud", cloud, cloudInset);
}

// Auto-register on import
registerBuiltinShapes();

// ---------------------------------------------------------------------------
// Public render entry point (used by svg-renderer)
// ---------------------------------------------------------------------------

export function renderShape(
  x: number,
  y: number,
  width: number,
  height: number,
  style: ResolvedNodeStyle,
): string {
  const shapeName = typeof style.shape === "string" ? style.shape : style.shape.url;
  const render = getShape(shapeName) ?? getShape("box")!;

  const ctx: ShapeContext = {
    x,
    y,
    width,
    height,
    fill: style.backgroundColor,
    stroke: style.borderColor,
    strokeWidth: style.borderWidth,
    strokeDasharray:
      style.borderStyle === "dashed" ? "8 4" : style.borderStyle === "dotted" ? "2 2" : "",
    borderRadius: style.borderRadius,
    color: style.color,
  };

  return render(ctx);
}
