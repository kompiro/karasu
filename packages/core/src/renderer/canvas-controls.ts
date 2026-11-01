import { CATEGORY_STUB_TAG, categoryOf, type CategoryId } from "./category-collapse.js";
import type { LayoutNode, LayoutResult } from "./layout-types.js";
import { el, escapeXml } from "./svg-builder.js";
import type { DiagramPalette } from "./palette.js";
import { FACET_DIM_OPACITY } from "./facet-overlay.js";
import { renderFacetRings } from "./node-card.js";

/**
 * The circle + ⊖/⊕ strokes shared by every collapse affordance — category
 * controls / stubs (#1821) and group controls (#1858). `plus` adds the vertical
 * stroke (⊕ = expand); omit it for ⊖ = collapse. Returns the child elements so
 * the caller wraps them in its own `<g>` (with the right data-attributes).
 */
function collapseGlyph(
  cx: number,
  cy: number,
  plus: boolean,
  palette: DiagramPalette,
  opts?: { radius?: number; fill?: string },
): string[] {
  const parts = [
    el("circle", {
      cx,
      cy,
      r: opts?.radius ?? 9,
      fill: opts?.fill ?? palette.surfaceBg,
      stroke: palette.accent,
      "stroke-width": 1.5,
    }),
    el("line", {
      x1: cx - 4,
      y1: cy,
      x2: cx + 4,
      y2: cy,
      stroke: palette.accent,
      "stroke-width": 1.5,
    }),
  ];
  if (plus) {
    parts.push(
      el("line", {
        x1: cx,
        y1: cy - 4,
        x2: cx,
        y2: cy + 4,
        stroke: palette.accent,
        "stroke-width": 1.5,
      }),
    );
  }
  return parts;
}

/**
 * The ⊕ placeholder a collapsed category folds to (Issue #1821). Drawn at the
 * stub node's laid-out box. Carries `data-collapse-category` so the app's click
 * delegation expands the category (toggling it out of `collapsedCategories`).
 */
export function renderCategoryStub(
  node: LayoutNode,
  palette: DiagramPalette,
  /**
   * Facets folded onto this stub (#2174). A collapsed category that hides
   * members of a selected facet still has to say so, or collapsing reads as
   * "nothing here belongs" (TPL-1886).
   */
  facets: readonly string[] = [],
  overlayOn = false,
  facetColorOf?: ReadonlyMap<string, string>,
): string {
  const cat = categoryOf(node) ?? "";
  const cx = node.x + 18;
  const cy = node.y + node.height / 2;
  const rings =
    facets.length > 0 && facetColorOf ? renderFacetRings(node, facets, facetColorOf) : [];
  return el(
    "g",
    {
      class: "krs-category-stub",
      "data-node-id": escapeXml(node.id),
      "data-collapse-category": cat,
      "data-facet-member": facets.length > 0 ? facets.join(" ") : undefined,
      role: "button",
      tabindex: "0",
      opacity: overlayOn && facets.length === 0 ? FACET_DIM_OPACITY : undefined,
    },
    ...rings,
    el("rect", {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      rx: 8,
      fill: palette.surfaceBg,
      stroke: palette.mutedBorder,
      "stroke-width": 1,
      "stroke-dasharray": "4 3",
    }),
    ...collapseGlyph(cx, cy, true, palette, { radius: 8, fill: "none" }),
    el(
      "text",
      {
        x: cx + 16,
        y: cy + 4,
        fill: palette.textMuted,
        "font-family": "sans-serif",
        "font-size": 12,
      },
      escapeXml(node.label),
    ),
  );
}

interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function bboxOf(nodes: LayoutNode[]): Bbox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Split nodes into contiguous clusters along x, so a tier row (e.g. infra)
 * yields one cluster while side columns (e.g. `[external]` placed left + right)
 * yield one per side — avoiding a frame that spans the whole diagram.
 */
function clusterByXGap(nodes: LayoutNode[], gap: number): LayoutNode[][] {
  const sorted = [...nodes].sort((a, b) => a.x - b.x);
  const clusters: LayoutNode[][] = [];
  let current: LayoutNode[] = [];
  let rightEdge = -Infinity;
  for (const n of sorted) {
    if (current.length > 0 && n.x - rightEdge > gap) {
      clusters.push(current);
      current = [];
    }
    current.push(n);
    rightEdge = Math.max(rightEdge, n.x + n.width);
  }
  if (current.length > 0) clusters.push(current);
  return clusters;
}

/**
 * ⊖ collapse buttons + hover-revealed extent frames for the open `external` /
 * `infra` groups (Issue #1821). The ⊖ is always visible (the collapse control);
 * hovering it reveals the group's dashed frame (`:hover` on the group; the frame
 * is `pointer-events: none` so it never blocks node clicks). Each control carries
 * `data-collapse-category` for the app's click delegation.
 */
export function renderCategoryControls(
  layoutResult: LayoutResult,
  palette: DiagramPalette,
): string {
  const byCat = new Map<CategoryId, LayoutNode[]>();
  for (const [, node] of layoutResult.nodes) {
    if (node.tags?.includes(CATEGORY_STUB_TAG)) continue; // already collapsed
    const cat = categoryOf(node);
    if (cat === null) continue;
    const list = byCat.get(cat);
    if (list) list.push(node);
    else byCat.set(cat, [node]);
  }
  if (byCat.size === 0) return "";

  const groups: string[] = [];
  for (const [cat, nodes] of byCat) {
    for (const cluster of clusterByXGap(nodes, 80)) {
      const bb = bboxOf(cluster);
      const pad = 8;
      const fx = bb.minX - pad;
      const fy = bb.minY - pad;
      const fw = bb.maxX - bb.minX + pad * 2;
      const fh = bb.maxY - bb.minY + pad * 2;
      groups.push(
        el(
          "g",
          { class: "krs-cat-group", "data-category-group": cat },
          el("rect", {
            class: "krs-cat-frame",
            x: fx,
            y: fy,
            width: fw,
            height: fh,
            rx: 10,
            fill: "transparent",
            stroke: palette.accent,
            "stroke-width": 1.5,
            "stroke-dasharray": "6 4",
            "pointer-events": "none",
          }),
          el(
            "g",
            {
              class: "krs-cat-collapse",
              "data-collapse-category": cat,
              role: "button",
              tabindex: "0",
              transform: `translate(${fx + fw - 2},${fy + 2})`,
            },
            ...collapseGlyph(0, 0, false, palette),
          ),
        ),
      );
    }
  }
  const style = el(
    "style",
    {},
    ".krs-cat-frame{opacity:0;transition:opacity .1s}" +
      ".krs-cat-group:hover .krs-cat-frame{opacity:1}" +
      ".krs-cat-collapse,.krs-category-stub{cursor:pointer}",
  );
  return el("g", { class: "krs-category-controls" }, style, ...groups);
}

/**
 * A ⊖/⊕ toggle at the top-right of each team boundary frame (system-view Group
 * by, #1858 slice B). Shows ⊖ when the group is expanded (click collapses it to
 * its `<Team> (N)` stub) and ⊕ when collapsed (click expands). Carries
 * `data-collapse-group` for the app's click delegation. Interactive chrome only.
 */
export function renderGroupControls(
  layoutResult: LayoutResult,
  palette: DiagramPalette,
  collapsedGroups: ReadonlySet<string> | undefined,
): string {
  const buttons: string[] = [];
  for (const container of layoutResult.containers) {
    if (!container.group || container.groupId === undefined) continue;
    // In-place expansion frames are their own control axis (`data-expand-node`,
    // renderExpandControls) — never a team collapse target (#1921).
    if (container.expanded) continue;
    // Collapsed → ⊕ (click expands); expanded → ⊖ (click collapses).
    const collapsed = collapsedGroups?.has(container.groupId) ?? false;
    const bx = container.x + container.width - 2;
    const by = container.y + 2;
    buttons.push(
      el(
        "g",
        {
          class: "krs-group-collapse",
          "data-collapse-group": container.groupId,
          role: "button",
          tabindex: "0",
          transform: `translate(${bx},${by})`,
        },
        ...collapseGlyph(0, 0, collapsed, palette),
      ),
    );
  }
  if (buttons.length === 0) return "";
  const style = el("style", {}, ".krs-group-collapse{cursor:pointer}");
  return el("g", { class: "krs-group-controls" }, style, ...buttons);
}

/**
 * In-place expansion controls (#1921): a ⊕ on every collapsed service box that
 * has domain children (click expands it in place) and a ⊖ on each expanded
 * container's boundary frame (click collapses it back). Both carry
 * `data-expand-node=<serviceId>` for the app's click delegation. Interactive
 * chrome only — never emitted in static output (mirrors renderGroupControls).
 */
export function renderExpandControls(layoutResult: LayoutResult, palette: DiagramPalette): string {
  const buttons: string[] = [];
  // ⊖ on expanded frames (click collapses).
  for (const container of layoutResult.containers) {
    if (!container.expanded || container.nodeId === undefined) continue;
    const bx = container.x + container.width - 2;
    const by = container.y + 2;
    buttons.push(
      el(
        "g",
        {
          class: "krs-expand-control",
          "data-expand-node": container.nodeId,
          role: "button",
          tabindex: "0",
          transform: `translate(${bx},${by})`,
        },
        // expanded → ⊖
        ...collapseGlyph(0, 0, false, palette),
      ),
    );
  }
  // ⊕ on collapsed, drillable service boxes (click expands).
  for (const node of layoutResult.nodes.values()) {
    if (node.kind !== "service" || !node.hasChildren) continue;
    const bx = node.x + node.width - 2;
    const by = node.y + 2;
    buttons.push(
      el(
        "g",
        {
          class: "krs-expand-control",
          "data-expand-node": node.id,
          role: "button",
          tabindex: "0",
          transform: `translate(${bx},${by})`,
        },
        // collapsed → ⊕
        ...collapseGlyph(0, 0, true, palette),
      ),
    );
  }
  if (buttons.length === 0) return "";
  const style = el("style", {}, ".krs-expand-control{cursor:pointer}");
  return el("g", { class: "krs-expand-controls" }, style, ...buttons);
}
