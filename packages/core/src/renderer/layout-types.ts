import type {
  LogicalNodeKind,
  DeployNodeKind,
  CommonProperties,
  ClientResource,
  ClientCapability,
} from "../types/ast.js";
import type { DomainEdgeDetail } from "../view/view-extract.js";

export type LayoutNodeProperties = CommonProperties & {
  role?: string;
  team?: string;
  /** Client-only: operation-tied storage resources rendered inline on the card. */
  resources?: ClientResource[];
  /** Client-only: device / browser capabilities rendered inline on the card. */
  capabilities?: ClientCapability[];
};

export interface LayoutNode {
  kind: LogicalNodeKind | DeployNodeKind;
  id: string;
  label: string;
  annotations?: string[];
  properties: LayoutNodeProperties;
  descriptionSummary?: string;
  linkCount: number;
  hasChildren: boolean;
  hasDescription: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  ghost?: boolean;
  /** Optional sub-label rendered below the main label (e.g., parent service name for ghost domains). */
  subLabel?: string;
}

export interface LayoutEdge {
  from: string;
  to: string;
  label?: string;
  fromPoint: { x: number; y: number };
  toPoint: { x: number; y: number };
  /** "sync" (`->`) or "async" (`-->`); needed to disambiguate canonicalId in the SVG output. */
  kind?: "sync" | "async";
  /**
   * The resolver-derived canonical id for `edge#<id>` style selectors. Mirrors
   * `KrsEdge.canonicalId`; left undefined for edges that lost their id to a
   * base collision or for synthetic layout-only edges (ghosts, delivers, etc.)
   * that aren't represented as a single KrsEdge.
   */
  canonicalId?: string;
  ghost?: boolean;
  cyclic?: boolean;
  /** Constituent domain edges for aggregated "N domain edges" implicit service edges. */
  domainEdges?: DomainEdgeDetail[];
  /**
   * Optional intermediate points for orthogonal routing (skip-layer edges).
   * When set, the edge renders as a polyline `fromPoint → ...waypoints → toPoint`.
   * When unset/empty, renders as a straight line `fromPoint → toPoint`.
   * See docs/design/auto-layout-edge-routing-orthogonal.md.
   */
  waypoints?: { x: number; y: number }[];
}

export interface ContainerRect {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ghost: boolean;
}

export interface LayoutResult {
  nodes: Map<string, LayoutNode>;
  edges: LayoutEdge[];
  containers: ContainerRect[];
  width: number;
  height: number;
}

export type DisplayMode = "shape" | "icon";
