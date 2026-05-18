import type { KrsNode, SystemNode } from "@karasu-tools/core";

interface OutlineViewProps {
  /** Resolved system AST to outline. */
  systems: SystemNode[];
  /** Currently highlighted node id (shared with the preview). */
  highlightedNodeId: string | null;
  /** Called with a node id when the user selects an outline entry. */
  onSelectNode: (nodeId: string) => void;
}

/**
 * Geometric glyph per node kind. Kept to plain Unicode shapes (no emoji) so
 * rendering stays consistent across platforms.
 */
const KIND_GLYPH: Record<string, string> = {
  system: "▣",
  service: "◆",
  client: "▢",
  user: "◉",
  domain: "◇",
  usecase: "▷",
  resource: "▤",
  database: "▥",
  table: "▦",
  storage: "▤",
  queue: "▤",
  "queue-item": "▪",
  bucket: "◖",
};

/**
 * Pure presentational layer for the Outline sidebar. Recursively renders the
 * resolved AST (`SystemNode[]` and their nested children); selecting an entry
 * flows back through `onSelectNode`. Has no dependency on app state.
 */
export function OutlineView({ systems, highlightedNodeId, onSelectNode }: OutlineViewProps) {
  return (
    <div className="outline-view">
      <div className="outline-content">
        {systems.length === 0 ? (
          <p className="outline-empty">No structure to outline.</p>
        ) : (
          systems.map((system) => (
            <OutlineItem
              key={system.id}
              node={system}
              path={system.id}
              depth={0}
              highlightedNodeId={highlightedNodeId}
              onSelectNode={onSelectNode}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface OutlineItemProps {
  node: KrsNode;
  /** Chain of ancestor ids ending at this node — a stable, data-derived key. */
  path: string;
  depth: number;
  highlightedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

function OutlineItem({ node, path, depth, highlightedNodeId, onSelectNode }: OutlineItemProps) {
  const selected = node.id === highlightedNodeId;
  const label = node.label ?? node.id;
  return (
    <>
      <button
        type="button"
        className={`outline-item${selected ? " outline-item--selected" : ""}`}
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => onSelectNode(node.id)}
        aria-current={selected ? "true" : undefined}
        title={`${label} (${node.kind})`}
      >
        <span className="outline-item__kind" aria-hidden="true">
          {KIND_GLYPH[node.kind] ?? "•"}
        </span>
        <span className="outline-item__label">{label}</span>
      </button>
      {node.children.map((child) => (
        <OutlineItem
          key={`${path}/${child.id}`}
          node={child}
          path={`${path}/${child.id}`}
          depth={depth + 1}
          highlightedNodeId={highlightedNodeId}
          onSelectNode={onSelectNode}
        />
      ))}
    </>
  );
}
