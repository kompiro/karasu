import { iconNameForNode, renderPictogram } from "@karasu-tools/core";

/**
 * View-agnostic node the Outline renders. The three diagram ASTs
 * (system / deploy / org) are mapped to `OutlineNode[]` by the adapters
 * in `outline-adapters.ts`, so this component stays presentational and
 * independent of any one AST shape.
 */
export interface OutlineNode {
  id: string;
  label?: string;
  /** Drives the icon — a `KrsNode` kind, a `DeployNodeKind`, or an org kind. */
  kind: string;
  /**
   * Node tags, used to resolve tag-driven icon variants (`client[mobile]`,
   * `resource[table]`, …) the same way the preview's Icon Mode does.
   * Optional — AST shapes without tags (deploy / org nodes) omit it.
   */
  tags?: string[];
  children: OutlineNode[];
}

interface OutlineViewProps {
  /** Nodes to outline — already mapped to the active view's AST. */
  nodes: OutlineNode[];
  /** Currently highlighted node id (shared with the preview). */
  highlightedNodeId: string | null;
  /** Single click — highlight the node in the preview. */
  onSelectNode: (nodeId: string) => void;
  /**
   * Double click — drill the preview down to reveal the node. `ancestorIds`
   * is the chain of ancestor node ids (root first, parent last), used to
   * resolve a drill target for nodes without their own viewPath.
   */
  onActivateNode: (nodeId: string, ancestorIds: string[]) => void;
}

/**
 * Icon Mode pictograms for the infra *item* kinds (`table` / `queue-item`
 * / `bucket`). `ICON_THEME_STYLE_SOURCE` has no CSS rule for these kinds —
 * Icon Mode never draws them on their own — so `iconNameForNode` returns
 * `undefined` for them. This Outline-only fallback keeps the pre-#1415
 * behaviour of showing a pictogram for infra items in the tree.
 */
const INFRA_ITEM_ICON: Record<string, string> = {
  table: "table",
  "queue-item": "queue-card",
  bucket: "cloud-card",
};

/** Fallback glyph for kinds without an Icon Mode icon. */
const KIND_GLYPH: Record<string, string> = {
  system: "▣",
  // org kinds
  organization: "▣",
  team: "▦",
  member: "○",
  // deploy kinds
  "deploy-block": "▣",
};

const ICON_SIZE = 16;

/**
 * Pure presentational layer for the Outline sidebar. Recursively renders the
 * `OutlineNode` tree; selecting an entry flows back through `onSelectNode`.
 * Has no dependency on app state or any specific AST shape.
 */
export function OutlineView({
  nodes,
  highlightedNodeId,
  onSelectNode,
  onActivateNode,
}: OutlineViewProps) {
  return (
    <div className="outline-view">
      <div className="outline-content">
        {nodes.length === 0 ? (
          <p className="outline-empty">No structure to outline.</p>
        ) : (
          nodes.map((node) => (
            <OutlineItem
              key={node.id}
              node={node}
              ancestors={[]}
              depth={0}
              highlightedNodeId={highlightedNodeId}
              onSelectNode={onSelectNode}
              onActivateNode={onActivateNode}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface OutlineItemProps {
  node: OutlineNode;
  /** Ancestor node ids (root first, parent last) — excludes this node. */
  ancestors: string[];
  depth: number;
  highlightedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onActivateNode: (nodeId: string, ancestorIds: string[]) => void;
}

function OutlineItem({
  node,
  ancestors,
  depth,
  highlightedNodeId,
  onSelectNode,
  onActivateNode,
}: OutlineItemProps) {
  const selected = node.id === highlightedNodeId;
  const label = node.label ?? node.id;
  // Shared `(kind, tags) → icon` resolution with the preview's Icon Mode,
  // so tag-driven variants (`client[mobile]`, `resource[table]`, …) match.
  const iconName = iconNameForNode(node.kind, node.tags ?? []) ?? INFRA_ITEM_ICON[node.kind];
  // `currentColor` lets the icon inherit the item's text color (hover/selected).
  const pictogram = iconName ? renderPictogram(iconName, "currentColor", ICON_SIZE) : undefined;
  return (
    <>
      <button
        type="button"
        className={`outline-item${selected ? " outline-item--selected" : ""}`}
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => onSelectNode(node.id)}
        onDoubleClick={() => onActivateNode(node.id, ancestors)}
        aria-current={selected ? "true" : undefined}
        title={`${label} (${node.kind})`}
      >
        {pictogram ? (
          <span
            className="outline-item__icon"
            aria-hidden="true"
            // Pictogram markup comes from core's renderPictogram — trusted, not user input.
            dangerouslySetInnerHTML={{ __html: pictogram }}
          />
        ) : (
          <span className="outline-item__icon outline-item__icon--glyph" aria-hidden="true">
            {KIND_GLYPH[node.kind] ?? "•"}
          </span>
        )}
        <span className="outline-item__label">{label}</span>
      </button>
      {node.children.map((child) => {
        const childAncestors = [...ancestors, node.id];
        return (
          <OutlineItem
            key={[...childAncestors, child.id].join("/")}
            node={child}
            ancestors={childAncestors}
            depth={depth + 1}
            highlightedNodeId={highlightedNodeId}
            onSelectNode={onSelectNode}
            onActivateNode={onActivateNode}
          />
        );
      })}
    </>
  );
}
