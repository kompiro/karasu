import type { ResolvedNodeStyle } from "../types/style.js";
import { el } from "./svg-builder.js";
import { NODE_PADDING_Y } from "./rendering-constants.js";
import {
  registerShape,
  getShape,
  type ShapeContext,
  type ShapeRenderFn,
  type ShapeContentInsetFn,
  type ShapePortFrameFn,
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

/** Medallion radius of the user card's person pictogram at full size. */
const USER_MEDALLION_R = 13;

/** Medallion radius for a given card height — full size from ~72px up. */
function userMedallionRadius(h: number): number {
  return Math.min(USER_MEDALLION_R, h * 0.18);
}

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
  // Scale the medallion down on short cards (the 56px icon-mode card): a
  // fixed 13px radius put the shoulders glyph exactly on the box-centred
  // label baseline there (#2412 review). s scales the pictogram with it.
  const medR = userMedallionRadius(h);
  const s = medR / USER_MEDALLION_R;
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
  const head = el("circle", { cx, cy: medCy - 3.5 * s, r: 3.4 * s, fill: ctx.color });
  const shoulders = el("path", {
    d: `M${cx - 6 * s} ${medCy + 8.5 * s} a${6 * s} ${6.5 * s} 0 0 1 ${12 * s} 0 Z`,
    fill: ctx.color,
  });

  return [card, medallion, head, shoulders].join("\n");
};

// Insets are CONTENT-SAFE boundaries: text may sit flush against them, so a
// shape bakes any breathing room it wants into the value. The user card adds
// a full padding below the medallion so its interior top gap matches the
// bottom one; measurement and rendering both clamp per side to
// max(NODE_PADDING, inset).
const userInset: ShapeContentInsetFn = (_w, h) => ({
  top: userMedallionRadius(h) + NODE_PADDING_Y,
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
  // A little breathing room is baked in so text never kisses the rim.
  return { top: ry * 2 + 8, right: 0, bottom: ry + 4, left: 0 };
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
  // The blob outline is wavy and non-convex, so per-axis extremes do not
  // compose into a safe box — these margins are the numerically verified
  // rectangle: every corner and edge sample lies inside the flattened
  // bezier path (see the point-in-polygon check in
  // shape-content-inset.test.ts, added after the #2412 review found the
  // previous values left 3 of 4 corners outside the fill).
  top: h * 0.26,
  right: w * 0.16,
  bottom: h * 0.2,
  left: w * 0.2,
});

// ---------------------------------------------------------------------------
// Port frames (#2422) — where an edge may attach, and how far in the outline
// sits there. Each mirrors its render function above, the way the content
// insets do. `box` declares none: its outline *is* the bounding box.
// ---------------------------------------------------------------------------

/** Half of an ellipse's sagitta at `along` ∈ [0,1]: 0 at the middle, r at the ends. */
function ellipseDepth(r: number, along: number): number {
  const u = 2 * along - 1;
  return r - r * Math.sqrt(Math.max(0, 1 - u * u));
}

const userPortFrame: ShapePortFrameFn = (w, h) => {
  const medR = userMedallionRadius(h);
  // The card's top border runs a medallion radius below the box, and the
  // medallion straddles it at the centre: an edge aimed at the middle of the
  // top used to stop in the empty corner beside it (the #2366 P10 report).
  const half = w > 0 ? medR / w : 0;
  const cardTop = h > 0 ? medR / h : 0;
  return {
    top: {
      spans: [
        { from: 0, to: Math.max(0, 0.5 - half) },
        { from: Math.min(1, 0.5 + half), to: 1 },
      ],
      depth: medR,
    },
    right: { spans: [{ from: cardTop, to: 1 }], depth: 0 },
    bottom: { spans: [{ from: 0, to: 1 }], depth: 0 },
    left: { spans: [{ from: cardTop, to: 1 }], depth: 0 },
  };
};

const cylinderPortFrame: ShapePortFrameFn = (_w, h) => {
  const ry = Math.min(h * 0.12, 15);
  const rim = h > 0 ? ry / h : 0;
  return {
    // Top and bottom are ellipse arcs: they touch the box at the centre and
    // fall away to `ry` at the sides, so the depth follows the arc.
    top: { spans: [{ from: 0, to: 1 }], depth: (along) => ellipseDepth(ry, along) },
    bottom: { spans: [{ from: 0, to: 1 }], depth: (along) => ellipseDepth(ry, along) },
    // The straight body runs between the two rims.
    right: { spans: [{ from: rim, to: 1 - rim }], depth: 0 },
    left: { spans: [{ from: rim, to: 1 - rim }], depth: 0 },
  };
};

const queuePortFrame: ShapePortFrameFn = (w) => {
  const rx = Math.min(w * 0.1, 15);
  const cap = w > 0 ? rx / w : 0;
  return {
    // The flat top and bottom span the body between the two caps.
    top: { spans: [{ from: cap, to: 1 - cap }], depth: 0 },
    bottom: { spans: [{ from: cap, to: 1 - cap }], depth: 0 },
    // Right is the convex end cap; left is the concave arc that bulges *into*
    // the body, so its depth grows towards mid-height instead of shrinking.
    right: { spans: [{ from: 0, to: 1 }], depth: (along) => ellipseDepth(rx, along) },
    left: { spans: [{ from: 0, to: 1 }], depth: (along) => rx + (rx - ellipseDepth(rx, along)) },
  };
};

const hexagonPortFrame: ShapePortFrameFn = () => ({
  // Flat spans only: the slanted corners are cut away.
  top: { spans: [{ from: 0.2, to: 0.8 }], depth: 0 },
  bottom: { spans: [{ from: 0.2, to: 0.8 }], depth: 0 },
  // Left and right are single vertices, so every edge on that side meets there.
  right: { spans: [{ from: 0.5, to: 0.5 }], depth: 0 },
  left: { spans: [{ from: 0.5, to: 0.5 }], depth: 0 },
});

const cloudPortFrame: ShapePortFrameFn = (w, h) => {
  // The one shape whose port sits *inside* the outline rather than on it: the
  // blob is wavy and non-convex, so a side has no single boundary to land on.
  // The content-safe margins (verified against the flattened path in #2412)
  // are the closest honest answer — inside the fill everywhere, never floating.
  const inset = cloudInset(w, h);
  return {
    top: { spans: [{ from: 0.25, to: 0.75 }], depth: inset.top },
    bottom: { spans: [{ from: 0.25, to: 0.75 }], depth: inset.bottom },
    right: { spans: [{ from: 0.3, to: 0.7 }], depth: inset.right },
    left: { spans: [{ from: 0.3, to: 0.7 }], depth: inset.left },
  };
};

export function registerBuiltinShapes(): void {
  registerShape("box", box);
  registerShape("user", user, userInset, userPortFrame);
  registerShape("cylinder", cylinder, cylinderInset, cylinderPortFrame);
  registerShape("queue", queue, queueInset, queuePortFrame);
  registerShape("hexagon", hexagon, hexagonInset, hexagonPortFrame);
  registerShape("cloud", cloud, cloudInset, cloudPortFrame);
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
