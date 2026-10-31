import type {
  ResolvedBoundaryFrames,
  ResolvedTeamFrames,
  ResolvedNodeStyle,
  ResolvedStyles,
} from "../types/style.js";
import type { ContainerRect, LayoutNode, LayoutResult, Rect } from "./layout-types.js";
import { rectUnionOutline } from "./frame-geometry.js";
import { frameBorder, type FrameBorder } from "./label-placement.js";
import { layoutDegradedTabs } from "./degraded-tabs.js";
import { DY_CENTER, el, escapeXml } from "./svg-builder.js";
import { GHOST_OPACITY } from "./rendering-constants.js";
import { displayGroupId } from "../types/ast.js";
import type { DiagramPalette } from "./palette.js";
import { nodePathRefId } from "../parser/node-path.js";

/**
 * The outline of a union of axis-aligned rects, as an SVG path `d` (#2179).
 * The corners come from {@link rectUnionOutline}, which the label placement
 * pass also reads, so a label avoids exactly the border the canvas strokes.
 *
 * Returns `null` for a single rect and for a set that is not one polygon, so the
 * caller falls back to the plain `<rect>`.
 */
export function rectUnionPath(rects: readonly Rect[]): string | null {
  const corners = rectUnionOutline(rects);
  if (corners === null) return null;
  const round = (v: number): number => Math.round(v * 100) / 100;
  return `M ${corners.map(({ x, y }) => `${round(x)} ${round(y)}`).join(" L ")} Z`;
}

/** Frame tint opacity — low enough that two overlapping fills stay distinguishable. */
/** Boundary-frame tint alpha — exported for the contrast guard (#2366 E). */
export const BOUNDARY_TINT_ALPHA = 0.1;
/**
 * `border-style` as the renderer draws it. `dashed` is the frames' default, and
 * `dotted` has to be visibly different from it or the keyword is accepted with
 * no effect.
 */
const FRAME_DASH_ARRAY: Record<"solid" | "dashed" | "dotted", string | undefined> = {
  solid: undefined,
  dashed: "8 4",
  dotted: "2 4",
};

/** Alpha every group-frame tint is drawn at, on both axes. */
const FRAME_FILL_OPACITY = String(BOUNDARY_TINT_ALPHA);

/**
 * The muted strength a group frame's title is drawn at while no style sheet has
 * named a colour for it. The frame is a structural hint at that point, and a
 * full-strength title competes with the cards inside it (ADR-1858).
 *
 * Exported because it is half of what the title's legibility is: the colour is
 * only ever seen composited at this alpha, so the contrast guard has to measure
 * the composite rather than the palette entry (#2662).
 */
export const MUTED_FRAME_TITLE_OPACITY = 0.7;

/**
 * The cycled default for a boundary, before any `.krs.style` rule is consulted.
 * Callers want {@link resolveBoundaryPaint}, which is the answer surfaces read.
 *
 * `hueIndex` is the boundary's position in the declared order (#2179), so the
 * assignment is stable for a model regardless of band order or collapse state.
 */
function boundaryHueAt(hueIndex: number | undefined, palette?: DiagramPalette): string | undefined {
  if (hueIndex === undefined || palette === undefined) return undefined;
  const hues = palette.boundaryHues;
  return hues.length > 0 ? hues[hueIndex % hues.length] : undefined;
}

/** How one group frame is painted, on every surface that paints it. */
interface FramePaint {
  stroke: string;
  /** The low-alpha frame fill. `undefined` leaves the frame unfilled. */
  fill?: string;
  /** Alpha for {@link fill}; read only when `fill` is set. */
  fillOpacity?: string;
  /** The frame title. */
  title: string;
  /** Title opacity. `undefined` draws it at full strength. */
  titleOpacity?: number;
  strokeWidth: number;
  /**
   * The outline's `stroke-dasharray`, or `undefined` for a solid line. Carries
   * the pattern rather than a `dashed` boolean because `border-style` offers
   * three values: collapsing `dotted` onto the dashed pattern would accept the
   * keyword and render something else (TPL-1503).
   */
  dashArray?: string;
}

/**
 * A boundary's paint, and the only place that answers the question: the author's
 * `.krs.style` rule where there is one, the cycled hue otherwise (#2234 over
 * #2179).
 *
 * A boundary's colour is painted on more than one surface, its frame (stroke,
 * tint and title) and the `◇` 縮退 tab on any card the frame could not reach.
 * Those are drawn by different functions, so the colour is decided once here and
 * read from here by both. Derive it twice and a boundary's identity splits
 * across two colours the moment the derivations stop agreeing, which is exactly
 * what an override does to a second, unaware reader (TPL-2234).
 *
 * `border-color` alone repaints the stroke, the fill and the title together.
 * #2179 established one colour per boundary as a legibility condition rather
 * than a preference, so letting a single declaration split a boundary across
 * two colours would undo the thing the hue exists for. An author who wants them
 * apart says so with `background-color` / `color`.
 */
function resolveBoundaryPaint(
  boundaryId: string | undefined,
  hueIndex: number | undefined,
  frames: ResolvedBoundaryFrames | undefined,
  palette: DiagramPalette | undefined,
): FramePaint | undefined {
  const cycled = boundaryHueAt(hueIndex, palette);
  if (cycled === undefined) return undefined;
  // By the author-facing id, not the group id. A scoped `boundary` (#2036) has
  // identity (declaring scope, id) and carries a scope-qualified group id, while
  // a style sheet only ever writes the bare name. Keying the lookup on the group
  // id would make `boundary#pci` silently inert for every scoped boundary, which
  // reads as a typo rather than as a limitation (TPL-1666 / TPL-1352).
  //
  // So an unqualified selector matches that id in every scope, which is the
  // plain reading of "no qualifier means the qualifier is not being asked
  // about". A way to name one scope can be added later without changing this.
  const key = boundaryId !== undefined ? displayGroupId(boundaryId) : undefined;
  const sheet = (key !== undefined ? frames?.byId.get(key) : undefined) ?? frames?.base;
  const stroke = sheet?.borderColor ?? cycled;
  return {
    stroke,
    fill: sheet?.backgroundColor ?? stroke,
    fillOpacity: FRAME_FILL_OPACITY,
    title: sheet?.color ?? stroke,
    strokeWidth: sheet?.borderWidth ?? 2,
    dashArray: FRAME_DASH_ARRAY[sheet?.borderStyle ?? "dashed"],
  };
}

/**
 * A team frame's paint (#2269), or `undefined` when no author sheet has said
 * anything about this team and the frame keeps the muted dashed look ADR-1858
 * gave it.
 *
 * A team is one entity with two renderings, so the selector that paints its card
 * in the org tree view paints this frame too. Each property lands on the part of
 * the frame that answers to the part of the card it paints there:
 *
 * - `border-color` -> the outline, as it draws the card's border
 * - `background-color` -> the low-alpha tint, as it fills the card
 * - `color` -> the title, as it colours the card's label
 *
 * This is where the team axis parts company with {@link resolveBoundaryPaint},
 * and the asymmetry is deliberate. There, one `border-color` drives all three,
 * because boundary frames overlap and a boundary split across two colours stops
 * reading as an overlap at all (#2179). Team frames never overlap, the axis
 * being 1:1, so nothing forces the three together and following the card is the
 * reading an author can predict from the one declaration they wrote.
 *
 * `frames` holds only what an author declared (`resolveTeamFrames` keeps the
 * built-in sheet out), so an empty answer here really does mean "unstyled"
 * rather than "styled with the card's defaults".
 */
function resolveTeamFramePaint(
  teamId: string | undefined,
  style: ResolvedNodeStyle,
  frames: ResolvedTeamFrames | undefined,
): FramePaint | undefined {
  const named = teamId !== undefined ? frames?.byId.get(teamId) : undefined;
  const sheet = named ?? frames?.base;
  if (sheet === undefined || Object.keys(sheet).length === 0) return undefined;
  return {
    stroke: sheet.borderColor ?? style.borderColor,
    fill: sheet.backgroundColor,
    fillOpacity: sheet.backgroundColor !== undefined ? FRAME_FILL_OPACITY : undefined,
    title: sheet.color ?? style.color,
    // Only a named colour lifts the title out of its muted default: an author
    // who set nothing but `border-width` has not asked for a louder title.
    titleOpacity: sheet.color !== undefined ? undefined : MUTED_FRAME_TITLE_OPACITY,
    strokeWidth: sheet.borderWidth ?? style.borderWidth,
    dashArray: FRAME_DASH_ARRAY[sheet.borderStyle ?? "dashed"],
  };
}

/**
 * The paint for whichever kind of group frame `container` is (#2269).
 *
 * Dispatches on the recorded axis rather than guessing: `groupId` is a boundary
 * id on one axis and an org team id on the other, and an expansion frame sits on
 * neither, so reading the wrong map would let a rule paint a frame it never
 * named.
 */
function resolveFramePaint(
  container: ContainerRect,
  style: ResolvedNodeStyle,
  palette: DiagramPalette | undefined,
  boundaryFrames: ResolvedBoundaryFrames | undefined,
  teamFrames: ResolvedTeamFrames | undefined,
): FramePaint | undefined {
  if (container.groupAxis === "team") {
    return resolveTeamFramePaint(container.groupId, style, teamFrames);
  }
  return resolveBoundaryPaint(container.groupId, container.hueIndex, boundaryFrames, palette);
}

/**
 * A container's style, with the two colours its frame draws in taken from the
 * theme wherever no rule named them (#2662).
 *
 * The cascade's base is `DEFAULT_NODE_STYLE`, a *card* default: a light label on
 * a dark fill, hard-coded to the dark palette. A frame has no fill, so that pair
 * was never the right reference for one, and on the light theme it drew a
 * near-white title (`#F9FAFB`) on a white canvas. Two shapes of container end up
 * on that base and both run through here:
 *
 * - a group frame's id is synthesized (`__group_<team>__`, collapse stubs), so
 *   `styles.nodes` cannot hold a key for it and the lookup misses outright;
 * - a ghost ancestor container has a real id, so it *has* an entry, but the
 *   entry is the base itself when no rule paints that kind (`system` is not
 *   painted by the built-in sheet).
 *
 * `paintedColors` is what separates the two cases from a rule that named the
 * base hex on purpose: `nodes` cannot, because every entry there is seeded from
 * the base and a colour no rule set is indistinguishable by value from one a
 * rule set to the same value. An explicit `color: #F9FAFB` is honoured in both
 * themes, exactly as `.krs.style` documents.
 *
 * The roles come from the chrome palette rather than from the node cascade
 * because a frame is chrome: the view draws it, and the built-in sheet is kept
 * out of it on purpose so a team no sheet names keeps the muted dashed frame
 * instead of the card's fill (ADR-2269, `docs/spec/style.md` -> Team frames).
 * `treeDefaults` in `org-tree-renderer.ts` names the same two roles for the same
 * two jobs, so this is the chrome vocabulary already in use rather than a new
 * pairing. It is not an appeal to one entity, one appearance: that rule is about
 * an author's selector reaching both renderings, and each rendering keeps its
 * own default.
 *
 * `textPrimary` rather than `textMuted` because the muting is already done by
 * {@link MUTED_FRAME_TITLE_OPACITY}: composited at 0.7 the muted role reaches
 * only 2.5:1 on the dark canvas and 2.7:1 on the light one, while the primary
 * role lands at 7.6:1 / 5.5:1, muted to the eye and still legible. The outline
 * keeps `mutedBorder`, which is what makes it recede in either theme instead of
 * turning into a hard dark rule on white.
 */
export function containerStyleOf(
  styles: ResolvedStyles,
  container: ContainerRect,
  palette: DiagramPalette,
): ResolvedNodeStyle {
  // By the frame's own path first (#2934), so a system that shares its id with
  // a service elsewhere is not drawn from that service's resolved style. The
  // painted record is read from the same place the style came from.
  const pathKey = container.path !== undefined ? nodePathRefId(container.path) : undefined;
  const ownStyle = pathKey !== undefined ? styles.nodesByPath.get(pathKey) : undefined;
  const style = ownStyle ?? styles.nodes.get(container.id) ?? styles.defaultNodeStyle;
  const painted =
    ownStyle !== undefined
      ? styles.paintedColorsByPath.get(pathKey!)
      : styles.paintedColors.get(container.id);
  return {
    ...style,
    color: painted?.color ? style.color : palette.textPrimary,
    borderColor: painted?.borderColor ? style.borderColor : palette.mutedBorder,
  };
}

/**
 * The width a frame is stroked at: 2 for an in-place expansion, else the
 * width its paint or its style names.
 */
function frameStrokeWidth(
  container: ContainerRect,
  style: ResolvedNodeStyle,
  paint: FramePaint | undefined,
): number {
  return container.expanded === true ? 2 : (paint?.strokeWidth ?? style.borderWidth);
}

/**
 * Every frame the canvas draws, as label placement obstacles (#3155): each at
 * the stroke width `renderContainer` draws it with. Exported so the tests'
 * fences measure the same stroke the canvas paints, not a fixed width.
 */
export function frameBordersOf(
  layoutResult: LayoutResult,
  styles: ResolvedStyles,
  palette: DiagramPalette,
): FrameBorder[] {
  return layoutResult.containers.map((container) =>
    frameBorder(container, containerStrokeWidth(container, styles, palette)),
  );
}

/**
 * The stroke width `renderContainer` draws `container`'s frame at, resolved
 * with the arguments the container loops pass it: a ghost frame without the
 * palette or the frame sheets, every other frame with them. The label pass
 * avoids the stroke this reports (#3155).
 */
function containerStrokeWidth(
  container: ContainerRect,
  styles: ResolvedStyles,
  palette: DiagramPalette,
): number {
  const style = containerStyleOf(styles, container, palette);
  const paint = container.ghost
    ? resolveFramePaint(container, style, undefined, undefined, undefined)
    : resolveFramePaint(container, style, palette, styles.boundaryFrames, styles.teamFrames);
  return frameStrokeWidth(container, style, paint);
}

export function renderContainer(
  container: ContainerRect,
  style: ResolvedNodeStyle,
  ghost: boolean,
  diffState?: string,
  palette?: DiagramPalette,
  boundaryFrames?: ResolvedBoundaryFrames,
  teamFrames?: ResolvedTeamFrames,
): string {
  const children: string[] = [];
  // An in-place-expanded container is an active user action (#1921): render it
  // prominently — a solid accent border with a faint accent fill — so the opened
  // service reads as a highlighted region rather than the muted, dashed team
  // frame it reuses geometry from. Without this it disappears into a busy diagram.
  const expanded = container.expanded === true;
  const accent = palette?.accent;
  // Boundary frames (#2179) carry an identifying hue and a low-alpha fill of it.
  // The fill is what makes an overlap read as an overlap: two dashed outlines of
  // the same colour read as nesting, while two tints composite to a third tone
  // in the shared cell. No code draws the intersection — alpha does.
  // A `.krs.style` rule may repaint this frame (#2234) or a team frame (#2269);
  // absent one, the cycled hue stands on the boundary axis and the muted dashed
  // default on the team axis.
  const paint = resolveFramePaint(container, style, palette, boundaryFrames, teamFrames);
  const outline = container.coverage ? rectUnionPath(container.coverage) : null;
  // A frame with no style sheet behind it keeps the historical dashed pattern;
  // a ghost container is dashed for the same reason it always was.
  const dashArray = paint ? paint.dashArray : ghost || container.group === true ? "8 4" : undefined;
  const frameShape = {
    fill: expanded && accent ? accent : (paint?.fill ?? "transparent"),
    "fill-opacity": expanded && accent ? "0.06" : paint?.fillOpacity,
    stroke: expanded && accent ? accent : (paint?.stroke ?? style.borderColor),
    "stroke-width": frameStrokeWidth(container, style, paint),
    "stroke-dasharray": expanded ? undefined : dashArray,
  };
  children.push(
    outline
      ? // A rectilinear outline cannot take `rx`; rounded joins keep it in the
        // same visual language as the rounded rects it sits among.
        el("path", { d: outline, ...frameShape, "stroke-linejoin": "round" })
      : el("rect", {
          x: container.x,
          y: container.y,
          width: container.width,
          height: container.height,
          ...frameShape,
          rx: style.borderRadius,
        }),
  );
  children.push(
    el(
      "text",
      {
        x: container.x + 12,
        y: container.y + 18,
        // The title takes the hue too. Without it the colour ↔ boundary mapping
        // cannot be recovered from the diagram, and the muted 0.7 the team frames
        // use leaves it close to unreadable (#2179).
        fill: expanded && accent ? accent : (paint?.title ?? style.color),
        "font-size": "12px",
        "font-family": style.fontFamily,
        "font-weight": "bold",
        opacity: expanded ? undefined : paint ? paint.titleOpacity : MUTED_FRAME_TITLE_OPACITY,
      },
      escapeXml(container.label),
    ),
  );

  return el(
    "g",
    {
      "data-container-id": container.id,
      // The node this container stands for, in the node id space (#2818). A
      // viewer matches a cross-navigation highlight against this, never
      // against `data-container-id`, whose spelling is the container's
      // identity (ADR-2714). Absent when no single node answers to the bare id.
      "data-realized-node-id": container.realizedNodeId,
      "data-kind-band": container.kindBand,
      "data-group": container.group ? "true" : undefined,
      "data-expanded": expanded ? "true" : undefined,
      "data-diff-state": diffState,
      opacity: ghost ? GHOST_OPACITY : undefined,
    },
    ...children,
  );
}

/**
 * `◇ <boundary>` tabs for memberships no frame could reach (#2179) — the 縮退
 * fallback. Drawn as dashed pills on the card's bottom edge in the frame's own
 * stroke language and hue, so a membership the geometry cannot show still reads
 * as "this card is also inside that frame" rather than as a stray badge.
 *
 * `◇` is U+25C7. The first candidate `⧉` (U+29C9) rasterised as tofu on the PNG
 * path — `packages/app/src/render/png-font-coverage.test.ts` pins the codepoint
 * against the bundled fonts (TPL-1799).
 */
export function renderDegradedTabs(
  node: LayoutNode,
  style: ResolvedNodeStyle,
  palette: DiagramPalette,
  boundaryFrames?: ResolvedBoundaryFrames,
): string[] {
  const out: string[] = [];
  // Placement comes from `degraded-tabs.ts`, which port distribution reads too
  // so an edge cannot land under a pill (#2422).
  for (const tab of layoutDegradedTabs(node)) {
    // Through `resolveBoundaryPaint`, not the palette directly: the tab and the
    // frame are two surfaces of one boundary and must never disagree about its
    // colour, including when a `.krs.style` rule repaints it (#2234).
    const hue =
      resolveBoundaryPaint(tab.id, tab.hueIndex, boundaryFrames, palette)?.stroke ??
      palette.mutedBorder;
    out.push(
      el("rect", {
        x: tab.x,
        y: tab.y,
        width: tab.width,
        height: tab.height,
        rx: tab.height / 2,
        fill: palette.canvasBg,
        stroke: hue,
        "stroke-width": 1,
        "stroke-dasharray": "5 3",
      }),
      el(
        "text",
        {
          x: tab.x + tab.width / 2,
          y: tab.y + tab.height / 2,
          "text-anchor": "middle",
          dy: DY_CENTER,
          fill: hue,
          "font-size": "10px",
          "font-family": style.fontFamily,
        },
        escapeXml(tab.label),
      ),
    );
  }
  return out;
}
