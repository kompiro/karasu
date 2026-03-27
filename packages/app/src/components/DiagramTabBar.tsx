import type { ActiveView } from "../state/app-reducer.js";

interface DiagramTabBarProps {
  active: ActiveView;
  hasDeployDiagram: boolean;
  onChange: (view: ActiveView) => void;
}

export function DiagramTabBar({ active, hasDeployDiagram, onChange }: DiagramTabBarProps) {
  return (
    <div className="diagram-tab-bar" role="tablist">
      <button
        className={`diagram-tab ${active === "system" ? "diagram-tab--active" : ""}`}
        role="tab"
        aria-selected={active === "system"}
        onClick={() => onChange("system")}
      >
        <span className="diagram-tab-icon">⬡</span>
        System
      </button>
      {hasDeployDiagram ? (
        <button
          className={`diagram-tab ${active === "deploy" ? "diagram-tab--active" : ""}`}
          role="tab"
          aria-selected={active === "deploy"}
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
        className={`diagram-tab ${active === "org" ? "diagram-tab--active" : ""}`}
        role="tab"
        aria-selected={active === "org"}
        onClick={() => onChange("org")}
      >
        <span className="diagram-tab-icon">👥</span>
        Org
      </button>
    </div>
  );
}
