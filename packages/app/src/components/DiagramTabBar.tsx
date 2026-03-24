import type { DiagramType } from "@karasu/core";

interface DiagramTabBarProps {
  current: DiagramType;
  hasDeployDiagram: boolean;
  onChange: (type: DiagramType) => void;
}

export function DiagramTabBar({ current, hasDeployDiagram, onChange }: DiagramTabBarProps) {
  return (
    <div className="diagram-tab-bar" role="tablist">
      <button
        className={`diagram-tab ${current === "system" ? "diagram-tab--active" : ""}`}
        role="tab"
        aria-selected={current === "system"}
        onClick={() => onChange("system")}
      >
        <span className="diagram-tab-icon">⬡</span>
        System
      </button>
      {hasDeployDiagram ? (
        <button
          className={`diagram-tab ${current === "deploy" ? "diagram-tab--active" : ""}`}
          role="tab"
          aria-selected={current === "deploy"}
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
    </div>
  );
}
