/**
 * Card measurement and construction for the layout pipelines (#2512): the
 * owner-chip resolver, the LayoutNode constructor, and measureNode with its
 * explicit MeasureContext. Everything here is pure — the context replaced the
 * former module-level set/reset state.
 */
import type { KrsNode } from "../types/ast.js";
import { OWNABLE_KIND_SET } from "../types/ast.js";
import { wrapToWidth } from "./svg-builder.js";
import { getShapeContentInset } from "../shapes/shape-registry.js";
import { summarizeDescription } from "./description-summary.js";
import {
  CHAR_WIDTH,
  NODE_PADDING_X,
  NODE_PADDING_Y,
  estimateTextWidth,
  teamChipText,
  LINE_HEIGHT,
  DESCRIPTION_FONT_RATIO,
  DESC_MAX_CONTENT_WIDTH,
  DESC_MAX_LINES,
  metaChipWidth,
} from "./rendering-constants.js";
import type {
  LayoutNode,
  LayoutNodeProperties,
  DisplayMode,
  LayoutOptions,
} from "./layout-types.js";

const ICON_CARD_WIDTH = 160;
const ICON_CARD_HEIGHT_WITH_DESC = 100;
const ICON_CARD_HEIGHT_NO_DESC = 56;

/**
 * A card's resolved owner: the team `id` the `data-team-button` navigates by,
 * and the `label` the chip shows (the id when the team declared no label).
 */
interface CardOwner {
  id: string;
  label: string;
}

/**
 * Resolves a node's owner, or `undefined` when its kind carries no owner chip.
 * Takes the lookup id separately from the kind because some canvases key their
 * node map by a qualified id (`SystemId.ServiceId`) while `ownerIndex` is
 * always keyed by the declared id.
 */
export type OwnerResolver = (kind: string, id: string) => CardOwner | undefined;

/**
 * The single kind gate for the owner chip (Issue #2157). Every kind a team can
 * `owns` ({@link OWNABLE_KIND_SET}) shows one — before this, three inline
 * `service | domain` checks silently dropped a `client`'s owner even though
 * `ownerIndex` had it and the `Group by: team` frame used it.
 */
export function makeOwnerResolver(
  ownerIndex?: Map<string, string>,
  teamLabels?: ReadonlyMap<string, string>,
): OwnerResolver {
  return (kind, id) => {
    if (!OWNABLE_KIND_SET.has(kind)) return undefined;
    const teamId = ownerIndex?.get(id);
    if (teamId === undefined) return undefined;
    return { id: teamId, label: teamLabels?.get(teamId) ?? teamId };
  };
}

/**
 * What measureNode needs beyond the node itself: the display mode, the
 * style-fed shape lookup, and the effective-annotation resolver. An explicit
 * parameter (this used to be module-level set/reset state), so `layout()` is
 * reentrant and a forgotten reset cannot recur.
 *
 * measureNode's shape lookup must use the same annotation set renderFromLayout
 * resolves styles with, or a node whose shape comes from an annotation
 * selector measures as a box and renders as a hexagon (found in the #2412
 * review's migration-coexistence trace). That is why layoutInner builds this
 * once — after inheritance is built — and hands the *same* object to
 * layoutMultipleSystems: the multi path measures with the inheritance-based
 * resolver even though its `LayoutNode.annotations` stay raw (#2515 tracks
 * that divergence).
 */
export interface MeasureContext {
  /** `undefined` is the meaningful "shape mode" default — name it explicitly. */
  displayMode: DisplayMode | undefined;
  /** `undefined` when the caller has no resolved styles (drawio export, bare-layout tests). */
  shapeForNode: LayoutOptions["shapeForNode"];
  /**
   * Required, not optional: a context missing the resolver would silently
   * measure with raw annotations while renderFromLayout resolves styles with
   * inherited ones — the #2412 class this type exists to make
   * unrepresentable.
   */
  effectiveAnnotations: (n: KrsNode) => string[];
}

/**
 * Build a {@link LayoutNode} from a KrsNode plus its placement. The derived
 * fields (tags, description summary, link count, …) are uniform across every
 * card the layout mints; what varies per call site — the display label,
 * annotation resolution, owner chip, ghost muting, ghost-row sub-label, and
 * the layout key (qualified ids for ghost-system services) — comes in through
 * `key` and `opts`. Every card gets the same shape: `ghost` is always present
 * (false unless the site marks the card ghost) and `subLabel` is simply
 * undefined outside the ghost rows. Consumers read both by truthiness, so the
 * old literals' key-presence differences carried no meaning.
 */
export function makeLayoutNode(
  node: KrsNode,
  key: string,
  opts: {
    label: string;
    annotations: string[];
    owner?: CardOwner;
    x: number;
    y: number;
    width: number;
    height: number;
    subLabel?: string;
    ghost?: boolean;
  },
): LayoutNode {
  return {
    kind: node.kind,
    tags: node.tags,
    id: key,
    label: opts.label,
    annotations: opts.annotations,
    subLabel: opts.subLabel,
    properties: extractLayoutProperties(node, opts.owner),
    descriptionSummary: node.properties.description
      ? summarizeDescription(node.properties.description)
      : undefined,
    linkCount: node.properties.links.length,
    hasChildren: node.children.length > 0,
    hasDescription: !!node.properties.description,
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    ghost: opts.ghost ?? false,
  };
}

const INFO_BUTTON_WIDTH = 24;

function extractLayoutProperties(node: KrsNode, owner?: CardOwner): LayoutNodeProperties {
  const props: LayoutNodeProperties = {
    description: node.properties.description,
    links: node.properties.links,
  };
  if (node.kind === "user") props.role = node.properties.role;
  if (owner) {
    props.team = owner.id;
    props.teamLabel = owner.label;
  }
  if (node.kind === "client" && node.properties.resources.length > 0) {
    props.resources = node.properties.resources;
  }
  if (node.kind === "client" && node.properties.capabilities.length > 0) {
    props.capabilities = node.properties.capabilities;
  }
  return props;
}

export function measureNode(
  node: KrsNode,
  owner: CardOwner | undefined,
  ctx: MeasureContext,
): { width: number; height: number } {
  if (ctx.displayMode === "icon") {
    return {
      width: ICON_CARD_WIDTH,
      height: node.properties.description ? ICON_CARD_HEIGHT_WITH_DESC : ICON_CARD_HEIGHT_NO_DESC,
    };
  }

  const labelWidth = estimateTextWidth(node.label ?? node.id, CHAR_WIDTH);
  // Measure the summary the renderer draws (descriptionSummary), not the raw
  // markdown: a long or markdown-heavy description otherwise widens the card
  // and reserves wrap lines for text that is never rendered (review of #2399).
  const description = node.properties.description
    ? summarizeDescription(node.properties.description)
    : undefined;
  const role = node.kind === "user" ? node.properties.role : undefined;
  const resources = node.kind === "client" ? node.properties.resources : [];
  const capabilities = node.kind === "client" ? node.properties.capabilities : [];

  // Description may widen the box up to DESC_MAX_CONTENT_WIDTH so short
  // descriptions render whole; longer ones wrap into up to DESC_MAX_LINES
  // lines before truncating (#2366 proposal C).
  const descWidth = description
    ? Math.min(
        estimateTextWidth(description, CHAR_WIDTH * DESCRIPTION_FONT_RATIO),
        DESC_MAX_CONTENT_WIDTH,
      )
    : 0;
  const roleWidth = role ? estimateTextWidth(role, CHAR_WIDTH * DESCRIPTION_FONT_RATIO) : 0;

  // Meta row: link count icon + team chip
  const hasMetaRow = node.properties.links.length > 0 || !!owner;
  let metaWidth = 0;
  if (hasMetaRow) {
    if (node.properties.links.length > 0)
      metaWidth += metaChipWidth(String(node.properties.links.length));
    if (owner) {
      if (metaWidth > 0) metaWidth += CHAR_WIDTH; // spacing
      metaWidth += metaChipWidth(teamChipText(owner.label));
    }
  }

  // Info button adds width for nodes with children and description
  const infoButtonExtra = node.children.length > 0 && description ? INFO_BUTTON_WIDTH : 0;

  // Resource badge (client-only): "📦 ×N" — one line regardless of count.
  const hasResourceBadge = resources.length > 0;
  const resourceBadgeWidth = hasResourceBadge ? metaChipWidth(`×${resources.length}`) : 0;

  // Capability badge (client-only): "🔐 ×N" — same single-line pattern as resource.
  const hasCapabilityBadge = capabilities.length > 0;
  const capabilityBadgeWidth = hasCapabilityBadge ? metaChipWidth(`×${capabilities.length}`) : 0;

  let width =
    Math.max(
      labelWidth,
      descWidth,
      roleWidth,
      metaWidth,
      resourceBadgeWidth,
      capabilityBadgeWidth,
      80,
    ) +
    NODE_PADDING_X * 2 +
    infoButtonExtra;
  let height = NODE_PADDING_Y * 2 + LINE_HEIGHT;
  if (description) {
    // Same wrap the renderer performs (renderDefaultText), so the reserved
    // height always matches the drawn line count.
    const descLines = wrapToWidth(
      description,
      width - NODE_PADDING_X * 2,
      CHAR_WIDTH * DESCRIPTION_FONT_RATIO,
      DESC_MAX_LINES,
    ).length;
    height += LINE_HEIGHT * descLines;
  }
  if (role) height += LINE_HEIGHT;
  if (hasResourceBadge) height += LINE_HEIGHT;
  if (hasCapabilityBadge) height += LINE_HEIGHT;
  if (hasMetaRow) height += LINE_HEIGHT;

  // Shape-inset surplus (#2366 proposal F): grow the card where the shape's
  // own insets exceed the base padding, so the renderer's inset-aware content
  // box keeps the usable width the content was measured for. Fixed-point
  // because proportional insets depend on the final size; run to sub-pixel
  // convergence — a coarse cutoff left the drawn wrap width ~2px under the
  // measured one, enough to flip a description's line count (#2412 review).
  // Without a shapeForNode hook the card keeps padding-only clearance
  // (pre-F behavior), and renderFromLayout is told not to apply insets.
  const annotations = ctx.effectiveAnnotations(node);
  const shapeName = ctx.shapeForNode?.(node.id, annotations);
  const insetFn = shapeName ? getShapeContentInset(shapeName) : undefined;
  if (insetFn) {
    const contentW = width - NODE_PADDING_X * 2;
    const contentH = height - NODE_PADDING_Y * 2;
    for (let i = 0; i < 25; i++) {
      const ins = insetFn(width, height);
      const wantW =
        contentW + Math.max(NODE_PADDING_X, ins.left) + Math.max(NODE_PADDING_X, ins.right);
      // Insets are content-safe boundaries (breathing room baked in by the
      // shape), so both axes clamp per side to max(padding, inset) and the
      // renderer centres the stack on the same clearance box.
      const wantH =
        contentH + Math.max(NODE_PADDING_Y, ins.top) + Math.max(NODE_PADDING_Y, ins.bottom);
      if (wantW <= width + 0.25 && wantH <= height + 0.25) break;
      width = Math.max(width, wantW);
      height = Math.max(height, wantH);
    }
  }

  return { width, height };
}
