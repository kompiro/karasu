import type { DiagramType } from "@karasu/core";

interface DiagramTabBarProps {
  current: DiagramType;
  hasDeployDiagram: boolean;
  onChange: (type: DiagramType) => void;
  viewKind: "logical" | "org";
  onViewKindChange: (kind: "logical" | "org") => void;
}

export function DiagramTabBar({
  current,
  hasDeployDiagram,
  onChange,
  viewKind,
  onViewKindChange,
}: DiagramTabBarProps) {
  return (
    <div className="diagram-tab-bar" role="tablist">
      <button
        className={`diagram-tab ${viewKind === "logical" && current === "system" ? "diagram-tab--active" : ""}`}
        role="tab"
        aria-selected={viewKind === "logical" && current === "system"}
        onClick={() => onChange("system")}
      >
        <span className="diagram-tab-icon">⬡</span>
        System
      </button>
      {hasDeployDiagram ? (
        <button
          className={`diagram-tab ${viewKind === "logical" && current === "deploy" ? "diagram-tab--active" : ""}`}
          role="tab"
          aria-selected={viewKind === "logical" && current === "deploy"}
          onClick={() => onChange("deploy")}
        >
          <span className="diagram-tab-icon">⬢</span>
          Deploy
        </button>
      ) : (
        <span
          className="diagram-tab diagram-tab--disabled"
          role="tab"
          aria-selected={false}
          aria-disabled={true}
          title="deploy ブロックがありません"
        >
          <span className="diagram-tab-icon">⬢</span>
          Deploy
        </span>
      )}
      <button
        className={`diagram-tab ${viewKind === "org" ? "diagram-tab--active" : ""}`}
        role="tab"
        aria-selected={viewKind === "org"}
        onClick={() => onViewKindChange("org")}
      >
        <span className="diagram-tab-icon">👥</span>
        Org
      </button>
    </div>
  );
}
