import type { ResolvedBoundaryFrames, ResolvedNodeStyle, ResolvedStyles } from "../types/style.js";
import { withoutUnassignedSegment } from "../view/unassigned-system.js";
import { CATEGORY_STUB_TAG } from "./category-collapse.js";
import type { DisplayMode, LayoutNode, LayoutResult, Rect } from "./layout-types.js";
import { renderShape } from "./shapes.js";
import { renderDegradedTabs } from "./container-frame.js";
import {
  CHIP_HEIGHT,
  GHOST_CHIP_WIDTH,
  laneBox,
  packCornerLane,
  renderChip,
  renderGhostChip,
  type CornerLane,
  type LaneInset,
} from "./corner-lane.js";
import { DY_CENTER, el, escapeXml } from "./svg-builder.js";
import {
  getIconDef,
  iconViewBox,
  pictogramGroup,
  PICTOGRAM_OFFSET,
  type SvgIconDef,
} from "../shapes/shape-registry.js";
import type { NodeDiffMeta } from "../diff/view-diff.js";
import { DEPLOY_AFFORDANCE_KIND_SET } from "../types/ast.js";
import type { DiagramPalette } from "./palette.js";
import { FACET_DIM_OPACITY } from "./facet-overlay.js";
import { nodePathRefId } from "../parser/node-path.js";
import { floor4, round2 } from "./svg-number.js";
import { renderDefaultText, renderSlottedText } from "./node-text.js";
import { laneInsetOf, resolveNodeStyle, shapeNameOf } from "./node-style.js";

/**
 * The `childLevelLinks` key of a logical-view card: its node path, without the
 * synthetic Unassigned system segment (a root card drops it and a drilled one
 * keeps it, so both sides of the lookup normalize the same way). Keyed by path,
 * not bare id, because two cards on the multi-system root can share an id and
 * only one of them owns the level its anchor names (#2933).
 */
export function cardLinkKey(path: readonly string[]): string {
  return nodePathRefId(withoutUnassignedSegment(path));
}

export function renderNode(
  node: LayoutNode,
  style: ResolvedNodeStyle,
  nodeId: string,
  palette: DiagramPalette,
  serviceIdsWithDeploy?: Set<string>,
  displayMode?: DisplayMode,
  childLevelLinks?: Map<string, string>,
  diffState?: string,
  diffMeta?: NodeDiffMeta,
  /**
   * Selected facets this node belongs to, in known-facet order (#2174). Empty
   * when the overlay is off *or* the node is a non-member — the two are told
   * apart by `overlayOn`, because a non-member has to dim while an overlay-off
   * node must render exactly as before.
   */
  facets: readonly string[] = [],
  overlayOn = false,
  facetColorOf?: ReadonlyMap<string, string>,
  /** Boundary frame styles, for the `◇` tabs this card may carry (#2234). */
  boundaryFrames?: ResolvedBoundaryFrames,
  /**
   * True when the layout compensated for shape content insets
   * (LayoutResult.shapeInsetsApplied). Text layout only applies insets
   * then — a padding-only-measured card must keep padding-only drawing.
   */
  applyShapeInsets = false,
  /**
   * True when the viewer wires up the per-node buttons (`RenderOptions.nodeControls`).
   * A static SVG carries no button it cannot honour (#2420).
   */
  nodeControls = false,
): string {
  const children: string[] = [];

  // Resolve the icon body (an external `shape: url(...)`) before anything is
  // drawn: the card frame, the body itself and the body's text slots all sit
  // in the same placement (see `iconBodyBox`).
  const shapeName = shapeNameOf(style.shape);
  const iconDef = getIconDef(shapeName);
  const isIconShape = typeof style.shape !== "string" && iconDef !== undefined;
  // An icon that declares text slots is a card design: its 160×100 body is a
  // card of its own, with its own label / description layout. Icon mode draws
  // the node on exactly that card, so the body and its slots are used whole.
  // Shape mode measures the card from the node's text instead, so only the
  // pictogram is taken — it is placed in the card's padding corner at native
  // size and the text is drawn by the stack every other shape uses (#2803).
  const cornerPictogram =
    isIconShape && displayMode !== "icon" && iconDef.labelSlot !== undefined
      ? pictogramGroup(
          iconDef,
          style.color,
          node.x + PICTOGRAM_OFFSET.x,
          node.y + PICTOGRAM_OFFSET.y,
        )
      : undefined;
  const bodyBox = isIconShape ? iconBodyBox(node, iconDef, displayMode) : node;

  // An icon body paints no background of its own, so the card frame draws the
  // declared fill/border behind it. Built-in shapes already include fill/stroke
  // in their own rendering.
  if (isIconShape) children.push(renderIconFrame(node, style));

  // Shape
  if (cornerPictogram) children.push(cornerPictogram);
  else children.push(renderShape(bodyBox.x, bodyBox.y, bodyBox.width, bodyBox.height, style));

  const textColor = style.color;
  const fontSize = style.fontSize;
  const displayDesc = node.descriptionSummary ?? node.properties.description;
  const hasMetaRow = node.linkCount > 0 || !!node.properties.team;

  // Slots are the icon card's own text layout, so they are read only where the
  // node is drawn on that card: icon mode. Everywhere else the card was
  // measured for the default stack, and drawing anything else leaves the lines
  // measurement reserved — the meta row, role and client chips — undrawn
  // (#2803, TPL-2803).
  if (displayMode === "icon" && iconDef?.labelSlot) {
    children.push(
      ...renderSlottedText(
        node,
        bodyBox,
        style,
        iconDef,
        displayMode,
        textColor,
        fontSize,
        displayDesc,
      ),
    );
  } else {
    children.push(
      ...renderDefaultText(
        node,
        style,
        nodeId,
        textColor,
        fontSize,
        displayDesc,
        hasMetaRow,
        applyShapeInsets,
        displayMode,
      ),
    );
  }

  // Corner lane (#2420): the annotation chip and the icon buttons share one
  // right-packed row, so the chip is measured against the buttons that will be
  // drawn beside it and the two can never collide.
  //
  // Which buttons a node *could* carry is decided by its own data; whether
  // they are actually drawn is decided by `nodeControls` — a static SVG has
  // nothing to click, so the i / D affordances would be noise there
  // (ADR-1821 draws the same line for the category controls).
  const canShowDeployButton =
    DEPLOY_AFFORDANCE_KIND_SET.has(node.kind) && (serviceIdsWithDeploy?.has(nodeId) ?? false);
  // Show info button when the node has any metadata worth displaying in the detail panel.
  // Container nodes (hasChildren) need the button because clicking the body drills down.
  // Leaf nodes also get the button for discoverability, even though clicking the body also opens the panel.
  const canShowInfoButton =
    node.hasDescription || node.linkCount > 0 || !!node.properties.team || !!node.properties.role;
  const showInfoButton = nodeControls && canShowInfoButton;
  const showDeployButton = nodeControls && canShowDeployButton;
  const buttonCount = (showInfoButton ? 1 : 0) + (showDeployButton ? 1 : 0);
  const laneInset = laneInsetOf(style, node, applyShapeInsets);
  const lane = packCornerLane(node, style, buttonCount, palette.badgeFallback, laneInset);

  // Badge (single merged badge driven by the node's current annotations).
  // When diff metadata reports an annotation-only change, the badge is
  // wrapped in `<g data-node-badge data-diff-state="added|removed|unchanged">`
  // so UI can highlight badge churn without painting the whole node amber
  // (Issue #738 / design doc D-2). If the node's badge disappeared because
  // the last annotation was removed, we still emit a ghost badge so the
  // viewer can see *what* was removed.
  const {
    children: badgeParts,
    annotationAddedAttr,
    annotationRemovedAttr,
  } = renderNodeBadge(node, palette, nodeId, diffMeta, lane, buttonCount, laneInset);
  children.push(...badgeParts);

  // Sub-label: shown below the node for ghost domains to indicate the parent service
  const subLabel = renderSubLabel(node, style, textColor, fontSize);
  if (subLabel) children.push(subLabel);

  // Top-right icon buttons, in lane order: [i] rightmost, then [D].
  let btnSlot = 0;

  if (showInfoButton) {
    const btn = lane.buttons[btnSlot++];
    children.push(
      renderIconButton(
        "data-info-button",
        nodeId,
        palette.textMuted,
        "i",
        { fontSize: "10px", italic: true },
        btn.cx,
        btn.cy,
      ),
    );
  }

  if (showDeployButton) {
    const btn = lane.buttons[btnSlot];
    children.push(
      renderIconButton(
        "data-deploy-button",
        nodeId,
        palette.accent,
        "D",
        { fontSize: "9px", bold: true },
        btn.cx,
        btn.cy,
      ),
    );
  }

  // 縮退 tabs paint last so they sit on top of the card body (#2179).
  children.push(...renderDegradedTabs(node, style, palette, boundaryFrames));

  // Facet rings sit above the card body but below the interactive chrome the
  // caller layers on later (category / group / expand controls), so a control
  // is never buried under a ring (TPL-2044).
  if (facets.length > 0 && facetColorOf) {
    children.push(...renderFacetRings(node, facets, facetColorOf));
  }

  // A non-member dims; a member keeps the style's own opacity. When the overlay
  // is off neither applies, which is what makes the no-selection output
  // byte-identical to before this feature existed.
  const dimmed = overlayOn && facets.length === 0;
  const resolvedOpacity = dimmed
    ? FACET_DIM_OPACITY
    : style.opacity < 1
      ? style.opacity
      : undefined;

  const nodeEl = el(
    "g",
    {
      "data-node-id": nodeId,
      // The one node this card stands for, where `data-node-id` may name two
      // (#2917). Same text form as a deploy container's id (ADR-2714).
      "data-node-path": node.path ? nodePathRefId(node.path) : undefined,
      "data-node-kind": node.kind,
      "data-has-children": node.hasChildren ? "true" : "false",
      "data-has-description": node.hasDescription ? "true" : "false",
      "data-link-count": node.linkCount > 0 ? String(node.linkCount) : undefined,
      "data-diff-state": diffState,
      "data-annotation-added": annotationAddedAttr,
      "data-annotation-removed": annotationRemovedAttr,
      "data-facet-member": facets.length > 0 ? facets.join(" ") : undefined,
      style: node.hasChildren ? "cursor: pointer" : undefined,
      opacity: resolvedOpacity,
    },
    ...children,
  );

  const childLevelId = childLevelLinks?.get(node.path ? cardLinkKey(node.path) : nodeId);
  if (childLevelId) {
    return el("a", { href: `#${childLevelId}` }, nodeEl);
  }
  return nodeEl;
}

/**
 * Concentric rings, one per selected facet the node belongs to.
 *
 * Drawn off the node's bounding box rather than its shape, so a cylinder, a
 * hexagon and an icon card all get the same treatment (TPL-1001) — matching the
 * outline of every built-in shape would mean a per-shape ring path, and the
 * rings would still read inconsistently between them.
 *
 * Rings grow **outward** in known-facet order, so the innermost ring is the same
 * facet on every node. That is what makes two nodes comparable at a glance; if
 * the order followed each node's own membership the same colour would sit at a
 * different radius from card to card.
 */
export function renderFacetRings(
  node: LayoutNode,
  facets: readonly string[],
  colorOf: ReadonlyMap<string, string>,
): string[] {
  const RING_WIDTH = 3;
  const RING_GAP = 1;
  return facets.flatMap((facetId, i) => {
    const color = colorOf.get(facetId);
    if (!color) return [];
    // Ring i sits outside the card by its own half-width plus everything drawn
    // inside it, so strokes never overlap and each colour stays readable.
    const offset = RING_WIDTH / 2 + i * (RING_WIDTH + RING_GAP);
    return [
      el("rect", {
        x: node.x - offset,
        y: node.y - offset,
        width: node.width + offset * 2,
        height: node.height + offset * 2,
        rx: 6 + offset,
        fill: "none",
        stroke: color,
        "stroke-width": RING_WIDTH,
        "data-facet-ring": facetId,
      }),
    ];
  });
}

/**
 * The box an external icon's body is drawn into.
 *
 * In icon mode the node box *is* the icon card the icon was drawn for (the
 * fixed 160×100 / 160×56 of `measureNode`), so the body fills it. In shape
 * mode the box is measured from the text, so filling it stretches the drawing
 * off-aspect — a 160×100 viewBox landed in a 286×84 card at `scale(1.79, 0.84)`
 * (#2696). There the body is fitted inside the box instead, keeping its
 * viewBox ratio, and the leftover space goes where the icon has least to say
 * about it (see below).
 *
 * The card frame stays on the full node box either way, so the outline edges
 * and chrome attach to is the one that is drawn (TPL-2385).
 */
function iconBodyBox(
  node: LayoutNode,
  iconDef: SvgIconDef,
  displayMode: DisplayMode | undefined,
): Rect {
  const { width: vw, height: vh } = iconViewBox(iconDef);
  // A malformed viewBox (non-finite or degenerate) has no ratio to preserve.
  if (displayMode === "icon" || !(vw > 0) || !(vh > 0)) return node;

  // One scale, floored to the precision the transform is emitted at, and both
  // sides derived from it: rounding each side on its own would put the two
  // axes on subtly different scales, which is the distortion being fixed here,
  // and rounding up would put the drawing outside the box it was fitted into.
  const scale = floor4(Math.min(node.width / vw, node.height / vh));
  const width = vw * scale;
  const height = vh * scale;
  // The body reaching here is a standalone drawing with no layout of its own to
  // line up against — a card design's body is not fitted at all in shape mode,
  // only its pictogram is drawn (see `renderNode`) — so it is centred.
  return {
    x: round2(node.x + (node.width - width) / 2),
    y: round2(node.y + (node.height - height) / 2),
    width,
    height,
  };
}

/**
 * Card frame for an external icon — the background + border rect drawn before
 * the icon body. An icon body is a pictogram: it has nothing to spend the
 * declared `background-color` / `border-color` / `border-width` on, so without
 * this rect those declarations are silently dropped (#2696). Built-in shapes
 * paint their own fill/stroke and never reach here, and neither does a `url()`
 * whose icon is not registered — that one falls back to `box`, which draws the
 * same rect itself.
 */
function renderIconFrame(node: LayoutNode, style: ResolvedNodeStyle): string {
  // The frame *is* a `box`, so it is drawn by the box shape rather than by a
  // second copy of its rect — the two would otherwise have to be kept in step.
  return renderShape(node.x, node.y, node.width, node.height, { ...style, shape: "box" });
}

/**
 * Records each card's corner lane on its layout node, for consumers that must
 * keep clear of it — the edge-port keep-outs of #2422 above all.
 *
 * The reservation counts the buttons the node's own data allows, **not** the
 * ones this render draws: a zone that shrank in static output would route the
 * same diagram's edges differently in the app and on the CLI. Since the chip
 * packs left of the buttons, the interactive packing is always the widest, so
 * reserving it covers both.
 */
export function assignChipZones(
  layoutResult: LayoutResult,
  styles: ResolvedStyles,
  palette: DiagramPalette,
  serviceIdsWithDeploy?: Set<string>,
): void {
  const applyShapeInsets = layoutResult.shapeInsetsApplied ?? false;
  for (const [mapKey, node] of layoutResult.nodes) {
    // Same element-id rule as the node loop in `render` (#2917).
    const nodeId = layoutResult.nodeIdentity === "key" ? mapKey : node.id;
    // Stamped here rather than in layout even though layout computes the same
    // rectangle for its port keep-outs (#2422): layout's copy predates
    // `normalizeCoordinates`, which shifts the whole canvas. Recomputing from
    // the final geometry is cheaper than tracking that shift.
    node.chipZone = chipZoneOf(
      node,
      nodeId,
      styles,
      palette,
      applyShapeInsets,
      serviceIdsWithDeploy,
    );
  }
}

/**
 * The corner lane a node's chrome occupies, or undefined for a card that has
 * none. Shared with layout through `LayoutOptions.chipZoneFor` so the keep-out
 * the ports respect is the rectangle the renderer actually fills.
 */
export function chipZoneOf(
  node: LayoutNode,
  nodeId: string,
  styles: ResolvedStyles,
  palette: DiagramPalette,
  /** Mirrors what `renderNode` will do: a padding-only layout draws a padding-only lane. */
  applyShapeInsets: boolean,
  serviceIdsWithDeploy?: Set<string>,
): Rect | undefined {
  {
    if (node.tags?.includes(CATEGORY_STUB_TAG)) return undefined;
    const style = resolveNodeStyle(styles, nodeId, node.annotations, node.id, node.path);
    const buttonCount =
      (node.hasDescription || node.linkCount > 0 || !!node.properties.team || !!node.properties.role
        ? 1
        : 0) +
      (DEPLOY_AFFORDANCE_KIND_SET.has(node.kind) && (serviceIdsWithDeploy?.has(nodeId) ?? false)
        ? 1
        : 0);
    return packCornerLane(
      node,
      style,
      buttonCount,
      palette.badgeFallback,
      laneInsetOf(style, node, applyShapeInsets),
    ).zone;
  }
}

/**
 * Annotation-driven badge (a single merged badge per node) plus the delta
 * `data-annotation-added` / `data-annotation-removed` attrs the caller
 * stamps onto the node's `<g>` (Issue #738 / design doc D-2). When the
 * node's last annotation was removed there is no current style badge, but a
 * ghost "removed" placeholder is still emitted so the viewer can see what
 * disappeared.
 */
function renderNodeBadge(
  node: LayoutNode,
  palette: DiagramPalette,
  nodeId: string,
  diffMeta: NodeDiffMeta | undefined,
  lane: CornerLane,
  buttonCount: number,
  ghostInset: LaneInset,
): {
  children: string[];
  annotationAddedAttr: string | undefined;
  annotationRemovedAttr: string | undefined;
} {
  const children: string[] = [];
  const annotationsAdded = diffMeta?.changes?.annotations?.added ?? [];
  const annotationsRemoved = diffMeta?.changes?.annotations?.removed ?? [];
  const hasAnnotationDiff = annotationsAdded.length > 0 || annotationsRemoved.length > 0;

  if (lane.chip) {
    // Classify badge diff state. With a single merged badge, direction is:
    //   added.length > 0 → "added" (new annotation produced the current badge)
    //   removed.length > 0 (and none added) → "changed" (swap/rewrite)
    //   no diff or diff doesn't touch annotations → undefined (no attr)
    let badgeDiffState: string | undefined;
    if (annotationsAdded.length > 0) badgeDiffState = "added";
    else if (annotationsRemoved.length > 0) badgeDiffState = "changed";
    children.push(
      el(
        "g",
        { "data-node-badge": nodeId, "data-diff-state": badgeDiffState },
        ...renderChip(lane.chip),
      ),
    );
  } else if (annotationsRemoved.length > 0) {
    // Ghost "removed" badge — all annotations were removed, so there is no
    // current style badge. Render a neutral placeholder with a strike so the
    // user still sees *something was removed*. It rides the same lane, so it
    // cannot land under the buttons either.
    children.push(
      el(
        "g",
        { "data-node-badge": nodeId, "data-diff-state": "removed" },
        ...renderGhostChip(
          laneBox(node, buttonCount, GHOST_CHIP_WIDTH, CHIP_HEIGHT, ghostInset),
          palette.textSubtle,
        ),
      ),
    );
  }
  // Record annotation delta as data-attrs on the node group below so CSS / UI
  // can query the full before/after sets (badge diff is only a hint).
  const annotationAddedAttr =
    hasAnnotationDiff && annotationsAdded.length > 0 ? annotationsAdded.join(",") : undefined;
  const annotationRemovedAttr =
    hasAnnotationDiff && annotationsRemoved.length > 0 ? annotationsRemoved.join(",") : undefined;

  return { children, annotationAddedAttr, annotationRemovedAttr };
}

/**
 * Sub-label rendered below the node body — used for ghost domains to name
 * the parent service they belong to (`(parentLabel)`).
 */
function renderSubLabel(
  node: LayoutNode,
  style: ResolvedNodeStyle,
  textColor: string,
  fontSize: number,
): string | undefined {
  if (!node.subLabel) return undefined;
  const subLabelFontSize = Math.round(fontSize * 0.75);
  return el(
    "text",
    {
      x: node.x + node.width / 2,
      y: node.y + node.height + subLabelFontSize + 4,
      "text-anchor": "middle",
      dy: DY_CENTER,
      fill: textColor,
      "font-size": `${subLabelFontSize}px`,
      "font-family": style.fontFamily,
    },
    escapeXml(`(${node.subLabel})`),
  );
}

/**
 * A top-right circular icon button — the shared `g > circle + text` affordance
 * behind the "i" info button and the "D" deploy button. The two differ only in
 * their `data-*` attribute, color, glyph, font size, and glyph emphasis
 * (`italic` vs `bold`), all threaded through params. The `<text>` attribute
 * order keeps `font-style` before `font-weight`; whichever `opts` flag is unset
 * is emitted as `undefined` and dropped by `el`, so each button's serialized
 * string stays byte-identical to the pre-merge dedicated helpers.
 *
 * - Info button (Issue #914): drawn on nodes with metadata worth surfacing in
 *   the detail panel (description, links, team, role). Container nodes get it
 *   too even though clicking the body also drills down, for discoverability.
 * - Deploy button: drawn on service/domain nodes that have at least one deploy
 *   unit realizing them, to jump to the deploy view for this node.
 */
function renderIconButton(
  dataAttr: string,
  nodeId: string,
  color: string,
  glyph: string,
  opts: { fontSize: string; italic?: boolean; bold?: boolean },
  btnX: number,
  btnY: number,
): string {
  return el(
    "g",
    {
      [dataAttr]: nodeId,
      // Interactive-only chrome: `stripInteractiveChrome` removes this class
      // when the live SVG is exported as a file, so a downloaded diagram
      // matches one rendered statically (#2420).
      class: "krs-node-controls",
      style: "cursor: pointer",
      "pointer-events": "all",
    },
    el("circle", {
      cx: btnX,
      cy: btnY,
      r: 8,
      fill: "transparent",
      stroke: color,
      "stroke-width": 1,
    }),
    el(
      "text",
      {
        x: btnX,
        y: btnY,
        "text-anchor": "middle",
        dy: DY_CENTER,
        fill: color,
        "font-size": opts.fontSize,
        "font-family": "sans-serif",
        "font-style": opts.italic ? "italic" : undefined,
        "font-weight": opts.bold ? "bold" : undefined,
      },
      glyph,
    ),
  );
}
