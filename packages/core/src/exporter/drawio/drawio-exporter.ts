import type {
  ContainerRect,
  LayoutEdge,
  LayoutNode,
  LayoutResult,
} from "../../renderer/layout-types.js";
import { sanitizeId } from "../../renderer/svg-renderer.js";
import { nodePathRefId } from "../../parser/node-path.js";
import { escapeXml, renderAttrs, renderStyle, type AttrValue } from "./mxgraph-builder.js";
import {
  buildContainerStyle,
  buildEdgeStyle,
  buildNodeStyle,
  formatCellValue,
  type DrawioStyle,
  type NodeKind,
} from "./drawio-style.js";

/** Extra per-id metadata that is not carried by LayoutResult itself. */
export interface DrawioNodeMeta {
  tags?: string[];
  annotations?: string[];
}

/**
 * A page (tab) in the exported .drawio file. Each page is a single rendered view.
 */
export interface DrawioPage {
  /** Unique, stable id used to prefix cell ids so multi-page output has no collisions. */
  id: string;
  /** Human-readable tab label (e.g. "System", "Deploy", "Service: checkout"). */
  name: string;
  layout: LayoutResult;
  /**
   * Optional lookup keyed by node or container id, providing tags and
   * annotations for cells whose LayoutNode/ContainerRect does not carry them.
   * Tags drive the label badges; annotations supplement LayoutNode.annotations.
   */
  metadata?: Map<string, DrawioNodeMeta>;
  /**
   * The same keyed by full path (`nodePathRefId`). A card that knows its path
   * reads its own node's entry here first, so two cards sharing an id do not
   * share one entry's badges (#2934).
   */
  metadataByPath?: Map<string, DrawioNodeMeta>;
}

export interface DrawioExportInput {
  pages: DrawioPage[];
}

export function exportDrawio(input: DrawioExportInput): string {
  const pagesXml = input.pages.map(renderPage).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="karasu" type="export">\n${pagesXml}\n</mxfile>\n`;
}

function renderPage(page: DrawioPage): string {
  const pageId = sanitizeId(page.id);
  const { width, height } = page.layout;
  const diagramAttrs = renderAttrs({ id: pageId, name: page.name });
  const graphAttrs = renderAttrs({
    dx: Math.max(width, 800),
    dy: Math.max(height, 600),
    grid: 1,
    gridSize: 10,
    guides: 1,
    tooltips: 1,
    connect: 1,
    arrows: 1,
    fold: 1,
    page: 1,
    pageScale: 1,
    pageWidth: 850,
    pageHeight: 1100,
    math: 0,
    shadow: 0,
  });

  const cells = buildCellsForPage(page);
  const cellsXml = cells.map((c) => renderCell(c)).join("\n");

  return [
    `  <diagram${diagramAttrs}>`,
    `    <mxGraphModel${graphAttrs}>`,
    `      <root>`,
    `        <mxCell id="${pageId}-0" />`,
    `        <mxCell id="${pageId}-1" parent="${pageId}-0" />`,
    cellsXml,
    `      </root>`,
    `    </mxGraphModel>`,
    `  </diagram>`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Cell construction
// ---------------------------------------------------------------------------

interface Cell {
  id: string;
  parent: string;
  value: string;
  style: DrawioStyle;
  vertex?: boolean;
  edge?: boolean;
  source?: string;
  target?: string;
  geometry: { x: number; y: number; width: number; height: number } | "edge";
  /** Custom attributes preserved for round-trip tooling (data-karasu-*). */
  customAttrs?: Record<string, AttrValue>;
}

function buildCellsForPage(page: DrawioPage): Cell[] {
  const pageId = sanitizeId(page.id);
  const rootParent = `${pageId}-1`;
  const cells: Cell[] = [];

  const cellId = (raw: string): string => `${pageId}-${sanitizeId(raw)}`;

  // Containers: sort by area descending so larger (outer) containers come first,
  // letting inner containers/nodes reference them as parents.
  const sortedContainers = [...page.layout.containers].sort(
    (a, b) => b.width * b.height - a.width * a.height,
  );

  const metadata = page.metadata ?? new Map<string, DrawioNodeMeta>();

  for (const container of sortedContainers) {
    const parentContainer = findEnclosingContainer(container, sortedContainers);
    const parentId = parentContainer ? cellId(parentContainer.id) : rootParent;

    const meta = metadata.get(container.id);
    const style = buildContainerStyle({ ghost: container.ghost });
    cells.push({
      id: cellId(container.id),
      parent: parentId,
      value: formatCellValue({
        label: container.label,
        annotations: meta?.annotations,
        tags: meta?.tags,
      }),
      style,
      vertex: true,
      geometry: {
        x: container.x,
        y: container.y,
        width: container.width,
        height: container.height,
      },
      customAttrs: buildContainerCustomAttrs(container.id, meta),
    });
  }

  // A card's cell key is its bare id, except where the layout keys cards by
  // more than their id: the multi-system root keys them by (system, id), so two
  // systems' `Api` cards are both on the page and need two cells (#2934). There
  // every card takes the key from its path (`Shop.Api`), whether or not its id
  // is shared, so a cell id does not change when a same-named node is added
  // elsewhere (the reason ADR-2714 keyed deploy containers by path outright).
  const cellKeyByMapKey = new Map<string, string>();
  const nodeIds = new Set<string>();
  for (const [mapKey, node] of page.layout.nodes) {
    const cellKey =
      node.path !== undefined && mapKey !== node.id ? nodePathRefId(node.path) : node.id;
    cellKeyByMapKey.set(mapKey, cellKey);
    nodeIds.add(node.id);
    const enclosing = findEnclosingContainerForNode(node, sortedContainers);
    const parentContainerId = enclosing ? cellId(enclosing.id) : rootParent;

    // When a node is placed inside a container cell, mxGraph geometry is
    // relative to the parent. Subtract the container origin.
    const geom =
      enclosing !== null
        ? {
            x: node.x - enclosing.x,
            y: node.y - enclosing.y,
            width: node.width,
            height: node.height,
          }
        : { x: node.x, y: node.y, width: node.width, height: node.height };

    const nodeKind = node.kind as NodeKind;
    const meta =
      (node.path !== undefined ? page.metadataByPath?.get(nodePathRefId(node.path)) : undefined) ??
      metadata.get(node.id);
    const annotations = node.annotations ?? meta?.annotations;
    const tags = meta?.tags;
    cells.push({
      id: cellId(cellKey),
      parent: parentContainerId,
      value: formatCellValue({ label: node.label, kind: nodeKind, annotations, tags }),
      style: buildNodeStyle({
        kind: nodeKind,
        annotations,
        ghost: node.ghost,
      }),
      vertex: true,
      geometry: geom,
      customAttrs: buildNodeCustomAttrs(node, tags),
    });
  }

  // An endpoint resolves through the map key the edge carries when it has one
  // (the multi-system root's intra-system edges, #2934), else by bare id.
  const endpointCell = (bare: string, mapKey: string | undefined): string | undefined =>
    mapKey !== undefined ? cellKeyByMapKey.get(mapKey) : nodeIds.has(bare) ? bare : undefined;
  for (const edge of page.layout.edges) {
    const from = endpointCell(edge.from, edge.fromKey);
    const to = endpointCell(edge.to, edge.toKey);
    // Skip edges whose endpoints aren't rendered on this page.
    if (from === undefined || to === undefined) continue;
    cells.push({
      id: cellId(`edge-${from}->${to}`),
      parent: rootParent,
      value: edge.label ?? "",
      style: buildEdgeStyle({ ghost: edge.ghost, cyclic: edge.cyclic }),
      edge: true,
      source: cellId(from),
      target: cellId(to),
      geometry: "edge",
      customAttrs: buildEdgeCustomAttrs(edge),
    });
  }

  return cells;
}

function buildNodeCustomAttrs(node: LayoutNode, tags?: string[]): Record<string, AttrValue> {
  const attrs: Record<string, AttrValue> = {
    "data-karasu-id": node.id,
    "data-karasu-kind": node.kind,
  };
  if (node.annotations && node.annotations.length > 0) {
    attrs["data-karasu-annotations"] = node.annotations.join(",");
  }
  if (tags && tags.length > 0) {
    attrs["data-karasu-tags"] = tags.join(",");
  }
  if (node.ghost) {
    attrs["data-karasu-ghost"] = "1";
  }
  return attrs;
}

function buildContainerCustomAttrs(
  id: string,
  meta: DrawioNodeMeta | undefined,
): Record<string, AttrValue> {
  const attrs: Record<string, AttrValue> = {
    "data-karasu-id": id,
    "data-karasu-kind": "container",
  };
  if (meta?.annotations && meta.annotations.length > 0) {
    attrs["data-karasu-annotations"] = meta.annotations.join(",");
  }
  if (meta?.tags && meta.tags.length > 0) {
    attrs["data-karasu-tags"] = meta.tags.join(",");
  }
  return attrs;
}

function buildEdgeCustomAttrs(edge: LayoutEdge): Record<string, AttrValue> | undefined {
  const attrs: Record<string, AttrValue> = {
    "data-karasu-edge-from": edge.from,
    "data-karasu-edge-to": edge.to,
  };
  if (edge.domainEdges && edge.domainEdges.length > 0) {
    attrs["data-karasu-aggregated"] = edge.domainEdges
      .map((d) => `${d.fromDomainId}->${d.toDomainId}`)
      .join(",");
  }
  return attrs;
}

/**
 * Find the smallest container that strictly contains `container`.
 * Returns null if `container` is the outermost (or overlaps none).
 */
function findEnclosingContainer(
  container: ContainerRect,
  all: ContainerRect[],
): ContainerRect | null {
  let best: ContainerRect | null = null;
  let bestArea = Infinity;
  for (const candidate of all) {
    if (candidate === container || candidate.id === container.id) continue;
    if (!rectContains(candidate, container)) continue;
    const area = candidate.width * candidate.height;
    if (area < bestArea) {
      best = candidate;
      bestArea = area;
    }
  }
  return best;
}

function findEnclosingContainerForNode(
  node: LayoutNode,
  all: ContainerRect[],
): ContainerRect | null {
  let best: ContainerRect | null = null;
  let bestArea = Infinity;
  for (const candidate of all) {
    if (!rectContainsPoint(candidate, node)) continue;
    const area = candidate.width * candidate.height;
    if (area < bestArea) {
      best = candidate;
      bestArea = area;
    }
  }
  return best;
}

function rectContains(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height &&
    !(
      inner.x === outer.x &&
      inner.y === outer.y &&
      inner.width === outer.width &&
      inner.height === outer.height
    )
  );
}

function rectContainsPoint(
  outer: { x: number; y: number; width: number; height: number },
  node: { x: number; y: number; width: number; height: number },
): boolean {
  return rectContains(outer, node);
}

// ---------------------------------------------------------------------------
// Cell serialisation
// ---------------------------------------------------------------------------

function renderCell(cell: Cell): string {
  const attrs: Record<string, AttrValue> = {
    id: cell.id,
    value: cell.value,
    style: renderStyle(cell.style),
    parent: cell.parent,
  };
  if (cell.vertex) attrs.vertex = true;
  if (cell.edge) {
    attrs.edge = true;
    attrs.source = cell.source;
    attrs.target = cell.target;
  }

  const customAttrs = cell.customAttrs
    ? Object.entries(cell.customAttrs)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => ` ${k}="${escapeXml(String(v))}"`)
        .join("")
    : "";

  const openTag = `        <mxCell${renderAttrs(attrs)}${customAttrs}>`;
  const geomTag =
    cell.geometry === "edge"
      ? `          <mxGeometry relative="1" as="geometry" />`
      : `          <mxGeometry${renderAttrs({
          x: cell.geometry.x,
          y: cell.geometry.y,
          width: cell.geometry.width,
          height: cell.geometry.height,
        })} as="geometry" />`;
  const closeTag = `        </mxCell>`;
  return `${openTag}\n${geomTag}\n${closeTag}`;
}
