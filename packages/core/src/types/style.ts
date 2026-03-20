export interface StyleSelector {
  nodeType?: string;
  tags: string[];
  annotations: string[];
  id?: string;
}

export interface StyleRule {
  selector: StyleSelector;
  properties: Record<string, string>;
  specificity: number;
  sourceIndex: number;
}

export interface StyleSheet {
  rules: StyleRule[];
}

export type ShapeKind = "box" | "user" | "cylinder" | "queue" | "hexagon" | "cloud";

export interface ResolvedNodeStyle {
  backgroundColor: string;
  color: string;
  borderColor: string;
  borderWidth: number;
  borderStyle: "solid" | "dashed" | "dotted";
  borderRadius: number;
  fontSize: number;
  fontWeight: "normal" | "bold";
  fontFamily: string;
  opacity: number;
  shape: ShapeKind | { url: string };
  badgeColor?: string;
  badgeIcon?: string;
  badgeLabel?: string;
}

export interface ResolvedEdgeStyle {
  color: string;
  strokeWidth: number;
  fontSize: number;
  strokeStyle: "solid" | "dashed";
}

export interface ResolvedStyles {
  nodes: Map<string, ResolvedNodeStyle>;
  edges: Map<string, ResolvedEdgeStyle>;
  defaultNodeStyle: ResolvedNodeStyle;
  defaultEdgeStyle: ResolvedEdgeStyle;
}
