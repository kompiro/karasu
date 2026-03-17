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
    return `<g transform="translate(${ctx.x}, ${ctx.y}) scale(${scaleX}, ${scaleY})">${def.body}</g>`;
  });
}

/**
 * Reset the registry (useful for testing).
 */
export function clearRegistry(): void {
  shapeRegistry.clear();
  iconDefRegistry.clear();
}
