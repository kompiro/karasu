import type { DiagramType } from "@karasu/core";

interface DiagramTabBarProps {
  current: DiagramType;
  hasDeployDiagram: boolean;
  onChange: (type: DiagramType) => void;
}

export function DiagramTabBar({ current, hasDeployDiagram, onChange }: DiagramTabBarProps) {
  return (
    <div className="diagram-tab-bar">
      <button
        className={`diagram-tab ${current === "system" ? "diagram-tab--active" : ""}`}
        onClick={() => onChange("system")}
      >
        <span className="diagram-tab-icon">⬡</span>
        System
      </button>
      {hasDeployDiagram ? (
        <button
          className={`diagram-tab ${current === "deploy" ? "diagram-tab--active" : ""}`}
          onClick={() => onChange("deploy")}
        >
          <span className="diagram-tab-icon">⬡</span>
          Deploy
        </button>
      ) : (
        <span className="diagram-tab diagram-tab--disabled" title="deploy ブロックがありません">
          <span className="diagram-tab-icon">⬡</span>
          Deploy
        </span>
      )}
    </div>
  );
}
