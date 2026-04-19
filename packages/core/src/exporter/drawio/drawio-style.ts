import type { AttrValue } from "./mxgraph-builder.js";

export type DrawioStyle = Record<string, AttrValue>;

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
  annotations?: string[];
  ghost?: boolean;
}

interface EdgeStyleInput {
  ghost?: boolean;
  cyclic?: boolean;
}

export function buildNodeStyle(input: NodeStyleInput): DrawioStyle {
  const style: DrawioStyle = { ...DEFAULT_NODE_STYLE };
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
