import type { DeployBlockInfo } from "@karasu-tools/core";
import type { ActiveView } from "../state/app-reducer.js";

interface DiagramTabBarProps {
  active: ActiveView;
  onChange: (view: ActiveView) => void;
  deployBlocks?: DeployBlockInfo[];
  selectedDeployBlockId?: string | null;
  onDeployBlockChange?: (id: string) => void;
}

export function DiagramTabBar({
  active,
  onChange,
  deployBlocks,
  selectedDeployBlockId,
  onDeployBlockChange,
}: DiagramTabBarProps) {
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
      <button
        className={`diagram-tab ${active === "deploy" ? "diagram-tab--active" : ""}`}
        role="tab"
        aria-selected={active === "deploy"}
        onClick={() => onChange("deploy")}
      >
        <span className="diagram-tab-icon">⬢</span>
        Deploy
      </button>
      {active === "deploy" && deployBlocks && deployBlocks.length > 1 && (
        <select
          className="deploy-block-selector"
          value={selectedDeployBlockId ?? deployBlocks[0].id}
          onChange={(e) => onDeployBlockChange?.(e.target.value)}
          aria-label="deploy block selector"
        >
          {deployBlocks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
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
      <button
        className={`diagram-tab ${active === "matrix" ? "diagram-tab--active" : ""}`}
        role="tab"
        aria-selected={active === "matrix"}
        onClick={() => onChange("matrix")}
      >
        <span className="diagram-tab-icon">▦</span>
        Matrix
      </button>
    </div>
  );
}
