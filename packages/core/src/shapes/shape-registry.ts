/**
 * Shape registry — manages built-in and external shape definitions.
 *
 * Shapes are render functions that receive a bounding context and return
 * an SVG string. External icons (e.g. from the svg-icon skill) can be
 * registered and referenced by name in .krs.style files.
 */

export interface ShapeContext {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray: string;
  borderRadius: number;
  /** Text color — used for {{color}} placeholder injection in built-in icons */
  color: string;
}

export type ShapeRenderFn = (ctx: ShapeContext) => string;

/**
 * Per-side distance from the bounding box to the shape's usable interior
 * (#2366 proposal F). Text layout clamps its clearance to
 * `max(NODE_PADDING, inset)` per side and centres the stack on the inset
 * box, so a cylinder's top ellipse or a hexagon's side notches never touch
 * the text. Values may depend on the node's final width/height.
 */
export interface ShapeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type ShapeContentInsetFn = (width: number, height: number) => ShapeInsets;

/**
 * Where an edge may attach on one side of a shape, and how far in the drawn
 * outline sits there (#2422, the sibling of {@link ShapeContentInsetFn}).
 *
 * `spans` are fractions of the side's length, in ascending order — the parts
 * of the side the outline actually covers. A `user` card's top edge excludes
 * the interval under the medallion, where the bounding box has no outline at
 * all and an arrowhead used to end in mid-air; a hexagon's left side collapses
 * to the single point of its vertex.
 *
 * `depth` moves the attachment inward along the side's normal, in px, for the
 * outlines that sit inside the box: a cylinder's rim, a cloud's margin.
 */
export interface ShapePortSide {
  spans: readonly { from: number; to: number }[];
  /**
   * Constant, or a function of the position along the side (0..1) for the
   * outlines that curve — a cylinder's rim is deepest at the sides and
   * touches the box at its centre.
   */
  depth: number | ((along: number) => number);
}

export interface ShapePortFrame {
  top: ShapePortSide;
  right: ShapePortSide;
  bottom: ShapePortSide;
  left: ShapePortSide;
}

export type ShapePortFrameFn = (width: number, height: number) => ShapePortFrame;

/**
 * Text slot position extracted from an SVG icon's krs-label / krs-description elements.
 * Coordinates are in the icon's viewBox coordinate space.
 */
export interface SvgIconTextSlot {
  /** x position (viewBox coordinates) */
  x: number;
  /** y position (viewBox coordinates) */
  y: number;
  /** text-anchor attribute (default: "middle") */
  textAnchor?: string;
}

/**
 * An SVG icon definition that can be registered as a custom shape.
 * The `body` field holds the inner SVG content (without the outer <svg> tag
 * and without krs-label/krs-description text elements).
 */
export interface SvgIconDef {
  /** Unique name used to reference this icon in styles */
  name: string;
  /** viewBox width (default 24) */
  viewBoxWidth?: number;
  /** viewBox height (default 24) */
  viewBoxHeight?: number;
  /** Inner SVG content (paths, circles, etc.) with krs-* text elements removed */
  body: string;
  /** Label text position extracted from class="krs-label" */
  labelSlot?: SvgIconTextSlot;
  /** Description text position extracted from class="krs-description" */
  descriptionSlot?: SvgIconTextSlot;
  /** Whether this is a built-in icon that receives placeholder injection ({{color}}, {{fill}}, etc.) */
  builtIn?: boolean;
  /**
   * Inner content of the <g class="krs-pictogram"> element (path/circle/etc. only).
   * Coordinates are in 0–20px space. Used to render a standalone 20×20 pictogram
   * (e.g. in NodeDetailPanel) without the full icon card layout.
   */
  pictogramBody?: string;
}

const shapeRegistry = new Map<string, ShapeRenderFn>();
const iconDefRegistry = new Map<string, SvgIconDef>();
const contentInsetRegistry = new Map<string, ShapeContentInsetFn>();
const portFrameRegistry = new Map<string, ShapePortFrameFn>();

export function registerShape(
  name: string,
  render: ShapeRenderFn,
  contentInset?: ShapeContentInsetFn,
  portFrame?: ShapePortFrameFn,
): void {
  shapeRegistry.set(name, render);
  if (contentInset) contentInsetRegistry.set(name, contentInset);
  else contentInsetRegistry.delete(name);
  if (portFrame) portFrameRegistry.set(name, portFrame);
  else portFrameRegistry.delete(name);
}

/** Content-inset function for a registered shape, if it declares one. */
export function getShapeContentInset(name: string): ShapeContentInsetFn | undefined {
  return contentInsetRegistry.get(name);
}

/**
 * Port-frame function for a registered shape, if it declares one. A shape
 * without one attaches edges on its bounding box, which is exactly right for
 * a rectangle.
 */
export function getShapePortFrame(name: string): ShapePortFrameFn | undefined {
  return portFrameRegistry.get(name);
}

export function getShape(name: string): ShapeRenderFn | undefined {
  return shapeRegistry.get(name);
}

export function hasShape(name: string): boolean {
  return shapeRegistry.has(name);
}

export function getRegisteredShapeNames(): string[] {
  return Array.from(shapeRegistry.keys());
}

/**
 * Get the original icon definition (if the shape was registered via registerIcon).
 * Used by the renderer to access text slot information.
 */
export function getIconDef(name: string): SvgIconDef | undefined {
  return iconDefRegistry.get(name);
}

/**
 * Render the pictogram for a registered icon as an inline SVG string.
 * The returned SVG has a fixed viewBox of "0 0 20 20" and the given pixel size.
 * Returns undefined if the icon or its pictogramBody is not found.
 *
 * @param iconName - The registered icon name (e.g. "service", "user-card")
 * @param color    - Fill color for {{color}} placeholder (built-in icons only)
 * @param size     - Width and height in pixels (default: 20)
 */
export function renderPictogram(iconName: string, color: string, size = 20): string | undefined {
  const def = iconDefRegistry.get(iconName);
  if (!def?.pictogramBody) return undefined;

  let body = def.pictogramBody;
  if (def.builtIn) {
    body = body.replace(/\{\{color\}\}/g, color);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="${size}" height="${size}">${body}</svg>`;
}

/**
 * Register an SVG icon as a shape.
 * The icon body is scaled/translated to fit the node's bounding box.
 */
export function registerIcon(def: SvgIconDef): void {
  const vw = def.viewBoxWidth ?? 24;
  const vh = def.viewBoxHeight ?? 24;

  iconDefRegistry.set(def.name, def);

  registerShape(def.name, (ctx) => {
    const scaleX = ctx.width / vw;
    const scaleY = ctx.height / vh;
    let body = def.body;
    if (def.builtIn) {
      body = body
        .replace(/\{\{color\}\}/g, ctx.color)
        .replace(/\{\{fill\}\}/g, ctx.fill)
        .replace(/\{\{stroke\}\}/g, ctx.stroke)
        .replace(/\{\{strokeWidth\}\}/g, String(ctx.strokeWidth));
    }
    return `<g transform="translate(${ctx.x}, ${ctx.y}) scale(${scaleX}, ${scaleY})">${body}</g>`;
  });
}

/**
 * Reset the registry (useful for testing).
 * @internal Not intended for production use — exposed for test isolation only.
 */
export function clearRegistry(): void {
  shapeRegistry.clear();
  iconDefRegistry.clear();
  contentInsetRegistry.clear();
  portFrameRegistry.clear();
}
