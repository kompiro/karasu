import { renderPictogram } from "@karasu-tools/core";
import type { KrsNode, SystemNode } from "@karasu-tools/core";

interface OutlineViewProps {
  /** Resolved system AST to outline. */
  systems: SystemNode[];
  /** Currently highlighted node id (shared with the preview). */
  highlightedNodeId: string | null;
  /** Single click — highlight the node in the preview. */
  onSelectNode: (nodeId: string) => void;
  /**
   * Double click — drill the preview down to reveal the node. `ancestorIds`
   * is the chain of ancestor node ids (root system first, parent last),
   * used to resolve a drill target for nodes without their own viewPath.
   */
  onActivateNode: (nodeId: string, ancestorIds: string[]) => void;
}

/**
 * Node kind → Icon Mode icon name. Mirrors the base-kind rules of
 * `ICON_THEME_STYLE_SOURCE` (`packages/core/src/builtins/icon-theme.ts`) so
 * the Outline shows the same pictograms the preview draws in Icon Mode.
 * Tag-driven variants (client subtypes, `resource[table]`, …) are not
 * resolved here — the base kind icon is used. `system` has no icon card in
 * Icon Mode either, so it falls back to a glyph.
 */
const KIND_ICON_NAME: Partial<Record<KrsNode["kind"], string>> = {
  service: "service",
  client: "client",
  user: "user-card",
  domain: "domain",
  usecase: "usecase",
  resource: "resource",
  database: "database",
  queue: "queue-node",
  storage: "cloud-node",
  table: "table",
  "queue-item": "queue-card",
  bucket: "cloud-card",
};

/** Fallback glyph for kinds without an Icon Mode icon (i.e. `system`). */
const KIND_GLYPH: Record<string, string> = {
  system: "▣",
};

const ICON_SIZE = 16;

/**
 * Pure presentational layer for the Outline sidebar. Recursively renders the
 * resolved AST (`SystemNode[]` and their nested children); selecting an entry
 * flows back through `onSelectNode`. Has no dependency on app state.
 */
export function OutlineView({
  systems,
  highlightedNodeId,
  onSelectNode,
  onActivateNode,
}: OutlineViewProps) {
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
  node: KrsNode;
  /** Ancestor node ids (root system first, parent last) — excludes this node. */
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
  const iconName = KIND_ICON_NAME[node.kind];
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
