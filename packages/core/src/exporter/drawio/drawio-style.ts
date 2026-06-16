import type { DeployNodeKind, LogicalNodeKind } from "../../types/ast.js";
import type { AttrValue } from "./mxgraph-builder.js";

export type DrawioStyle = Record<string, AttrValue>;

export type NodeKind = LogicalNodeKind | DeployNodeKind;

/**
 * Kind-specific style overrides so viewers can tell at a glance whether a cell
 * is a user / domain / database / lambda / etc. without inspecting attributes.
 * Applied on top of DEFAULT_NODE_STYLE, before annotation overrides.
 */
const KIND_OVERRIDES: Partial<Record<NodeKind, DrawioStyle>> = {
  // Logical
  system: { fillColor: "#e3f2fd", strokeColor: "#1565c0" },
  service: { fillColor: "#e8f5e9", strokeColor: "#2e7d32" },
  domain: { fillColor: "#fff8e1", strokeColor: "#f57c00" },
  usecase: { _shape: "ellipse", fillColor: "#f3e5f5", strokeColor: "#6a1b9a" },
  resource: { _shape: "shape=document", fillColor: "#fafafa", strokeColor: "#616161" },
  user: {
    _shape: "shape=umlActor",
    fillColor: "#ffffff",
    strokeColor: "#333333",
    verticalLabelPosition: "bottom",
    verticalAlign: "top",
  },
  database: {
    _shape: "shape=cylinder3;boundedLbl=1",
    fillColor: "#e1f5fe",
    strokeColor: "#0277bd",
  },
  table: { _shape: "shape=cylinder3;boundedLbl=1", fillColor: "#e1f5fe", strokeColor: "#0277bd" },
  bucket: { _shape: "shape=cylinder3;boundedLbl=1", fillColor: "#e0f2f1", strokeColor: "#00695c" },
  queue: { _shape: "shape=mxgraph.flowchart.delay", fillColor: "#fff3e0", strokeColor: "#e65100" },
  "queue-item": { fillColor: "#fff3e0", strokeColor: "#e65100" },
  storage: { _shape: "shape=cylinder3;boundedLbl=1", fillColor: "#e0f2f1", strokeColor: "#00695c" },
  // Deploy
  oci: { fillColor: "#e8eaf6", strokeColor: "#283593" },
  war: { fillColor: "#ede7f6", strokeColor: "#4527a0" },
  jar: { fillColor: "#ede7f6", strokeColor: "#4527a0" },
  lambda: { fillColor: "#fffde7", strokeColor: "#f9a825" },
  function: { fillColor: "#fffde7", strokeColor: "#f9a825" },
  assets: { fillColor: "#e1f5fe", strokeColor: "#01579b" },
  job: { fillColor: "#eceff1", strokeColor: "#455a64" },
  artifact: { fillColor: "#ede7f6", strokeColor: "#4527a0" },
  store: { _shape: "shape=cylinder3;boundedLbl=1", fillColor: "#e0f2f1", strokeColor: "#00695c" },
};

interface CellValueInput {
  label: string;
  kind?: NodeKind;
  annotations?: string[];
  tags?: string[];
}

/**
 * Build the HTML cell value shown in draw.io. Layers (top to bottom):
 *   1. `«kind»` stereotype — small gray text
 *   2. `@annotation` list — small orange text (annotations describe lifecycle:
 *      deprecated / external / migration_target / ...)
 *   3. `#tag` list — small blue text (tags are free-form classification)
 *   4. the node label itself, at normal size
 *
 * Values are later XML-escaped by renderAttrs; the HTML here is decoded back
 * by draw.io and rendered because html=1 is set in the cell style.
 */
export function formatCellValue(input: CellValueInput | string, kind?: NodeKind): string {
  // Back-compat string signature (tests and simple callers): formatCellValue("Label", "service")
  const normalized: CellValueInput = typeof input === "string" ? { label: input, kind } : input;

  const lines: string[] = [];
  if (normalized.kind) {
    lines.push(`<span style="font-size:10px;color:#888">«${normalized.kind}»</span>`);
  }
  if (normalized.annotations && normalized.annotations.length > 0) {
    const joined = normalized.annotations.map((a) => `@${a}`).join(" ");
    lines.push(`<span style="font-size:10px;color:#e65100">${joined}</span>`);
  }
  if (normalized.tags && normalized.tags.length > 0) {
    const joined = normalized.tags.map((t) => `#${t}`).join(" ");
    lines.push(`<span style="font-size:10px;color:#1565c0">${joined}</span>`);
  }
  lines.push(normalized.label);
  return lines.join("<br/>");
}

const DEFAULT_NODE_STYLE: DrawioStyle = {
  _shape: "rounded=1",
  whiteSpace: "wrap",
  html: 1,
  fillColor: "#ffffff",
  strokeColor: "#333333",
  fontSize: 12,
  align: "center",
  verticalAlign: "middle",
};

const DEFAULT_CONTAINER_STYLE: DrawioStyle = {
  _shape: "rounded=0",
  whiteSpace: "wrap",
  html: 1,
  fillColor: "none",
  strokeColor: "#555555",
  verticalAlign: "top",
  align: "left",
  fontSize: 12,
  container: 1,
  collapsible: 0,
};

const DEFAULT_EDGE_STYLE: DrawioStyle = {
  _shape: "edgeStyle=orthogonalEdgeStyle",
  rounded: 0,
  html: 1,
  strokeColor: "#333333",
  endArrow: "classic",
  fontSize: 11,
};

const GHOST_OVERRIDES: DrawioStyle = {
  dashed: 1,
  strokeColor: "#999999",
  fontColor: "#666666",
  opacity: 60,
};

const ANNOTATION_OVERRIDES: Record<string, DrawioStyle> = {
  external: {
    fillColor: "#f5f5f5",
    strokeColor: "#999999",
    dashed: 1,
  },
  deprecated: {
    strokeColor: "#cc0000",
    fontStyle: 2, // italic
    dashPattern: "4 2",
    dashed: 1,
  },
  migration_target: {
    fillColor: "#fff3e0",
    strokeColor: "#ff9800",
  },
};

interface NodeStyleInput {
  kind?: NodeKind;
  annotations?: string[];
  ghost?: boolean;
}

interface EdgeStyleInput {
  ghost?: boolean;
  cyclic?: boolean;
}

export function buildNodeStyle(input: NodeStyleInput): DrawioStyle {
  const style: DrawioStyle = { ...DEFAULT_NODE_STYLE };
  if (input.kind) {
    const kindOverrides = KIND_OVERRIDES[input.kind];
    if (kindOverrides) Object.assign(style, kindOverrides);
  }
  for (const annotation of input.annotations ?? []) {
    const overrides = ANNOTATION_OVERRIDES[annotation];
    if (overrides) Object.assign(style, overrides);
  }
  if (input.ghost) Object.assign(style, GHOST_OVERRIDES);
  return style;
}

export function buildContainerStyle(input: NodeStyleInput): DrawioStyle {
  const style: DrawioStyle = { ...DEFAULT_CONTAINER_STYLE };
  if (input.ghost) Object.assign(style, GHOST_OVERRIDES);
  return style;
}

export function buildEdgeStyle(input: EdgeStyleInput): DrawioStyle {
  const style: DrawioStyle = { ...DEFAULT_EDGE_STYLE };
  if (input.ghost) Object.assign(style, GHOST_OVERRIDES);
  if (input.cyclic) {
    style.strokeColor = "#d32f2f";
    style.dashed = 1;
  }
  return style;
}
