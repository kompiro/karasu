import type { ResolvedNodeStyle } from "../types/style.js";
import { el } from "./svg-builder.js";
import {
  registerShape,
  getShape,
  type ShapeContext,
  type ShapeRenderFn,
} from "./shape-registry.js";

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

const user: ShapeRenderFn = (ctx) => {
  const { x, y, width: w, height: h, fill, stroke, strokeWidth: sw, strokeDasharray: dash } = ctx;
  const cx = x + w / 2;
  const headR = Math.min(w, h) * 0.13;
  const headCy = y + headR + 2;
  const gap = 3;
  const shoulderTop = headCy + headR + gap;
  const bodyBottom = y + h;
  const shoulderW = w * 0.45;
  const torsoW = w * 0.7;
  const shoulderH = (bodyBottom - shoulderTop) * 0.25;
  const torsoTop = shoulderTop + shoulderH;
  const cornerR = 4;

  const bodyPath = [
    `M${cx - shoulderW / 2} ${shoulderTop}`,
    `L${cx + shoulderW / 2} ${shoulderTop}`,
    `L${cx + torsoW / 2} ${torsoTop}`,
    `L${cx + torsoW / 2} ${bodyBottom - cornerR}`,
    `Q${cx + torsoW / 2} ${bodyBottom} ${cx + torsoW / 2 - cornerR} ${bodyBottom}`,
    `L${cx - torsoW / 2 + cornerR} ${bodyBottom}`,
    `Q${cx - torsoW / 2} ${bodyBottom} ${cx - torsoW / 2} ${bodyBottom - cornerR}`,
    `L${cx - torsoW / 2} ${torsoTop}`,
    `Z`,
  ].join(" ");

  return [
    el("circle", {
      cx,
      cy: headCy,
      r: headR,
      fill,
      stroke,
      "stroke-width": sw,
      "stroke-dasharray": dash || undefined,
    }),
    el("path", {
      d: bodyPath,
      fill,
      stroke,
      "stroke-width": sw,
      "stroke-dasharray": dash || undefined,
    }),
  ].join("\n");
};

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

export function registerBuiltinShapes(): void {
  registerShape("box", box);
  registerShape("user", user);
  registerShape("cylinder", cylinder);
  registerShape("queue", queue);
  registerShape("hexagon", hexagon);
  registerShape("cloud", cloud);
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
  };

  return render(ctx);
}
