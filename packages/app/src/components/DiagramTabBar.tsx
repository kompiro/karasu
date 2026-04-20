import type { DeployBlockInfo } from "@karasu-tools/core";
import type { ActiveView } from "../state/app-reducer.js";
import { useTranslation } from "../i18n/index.js";

interface DiagramTabBarProps {
  active: ActiveView;
  hasDeployDiagram: boolean;
  onChange: (view: ActiveView) => void;
  deployBlocks?: DeployBlockInfo[];
  selectedDeployBlockId?: string | null;
  onDeployBlockChange?: (id: string) => void;
}

export function DiagramTabBar({
  active,
  hasDeployDiagram,
  onChange,
  deployBlocks,
  selectedDeployBlockId,
  onDeployBlockChange,
}: DiagramTabBarProps) {
  const { t } = useTranslation();
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
          title={t("diagramTabBar.deploy.unavailableTitle")}
        >
          <span className="diagram-tab-icon">⬢</span>
          Deploy
        </span>
      )}
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
    </div>
  );
}
