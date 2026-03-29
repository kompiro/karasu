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

export function registerShape(name: string, render: ShapeRenderFn): void {
  shapeRegistry.set(name, render);
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
}
