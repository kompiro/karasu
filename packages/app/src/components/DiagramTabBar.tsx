import type { DeployBlockInfo } from "@karasu-tools/core";
import type { ActiveView } from "../state/app-reducer.js";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DiagramTabBarProps {
  active: ActiveView;
  onChange: (view: ActiveView) => void;
  deployBlocks?: DeployBlockInfo[];
  selectedDeployBlockId?: string | null;
  onDeployBlockChange?: (id: string) => void;
}

function tabClass(active: boolean) {
  return active ? "diagram-tab diagram-tab--active" : "diagram-tab";
}

/**
 * Migrated to shadcn/ui `Tabs` (Issue #1368). Radix adds arrow-key navigation
 * between triggers as an a11y baseline upgrade. Legacy class names retained.
 *
 * The deploy-block `<select>` stays as a native element — shadcn `Select`
 * renders a Radix popover that wouldn't satisfy the existing
 * `getByLabelText(...) as HTMLSelectElement` test contract.
 */
export function DiagramTabBar({
  active,
  onChange,
  deployBlocks,
  selectedDeployBlockId,
  onDeployBlockChange,
}: DiagramTabBarProps) {
  return (
    <Tabs value={active} onValueChange={(v) => onChange(v as ActiveView)}>
      <TabsList className="diagram-tab-bar">
        <TabsTrigger value="system" className={tabClass(active === "system")}>
          <span className="diagram-tab-icon">⬡</span>
          System
        </TabsTrigger>
        <TabsTrigger value="deploy" className={tabClass(active === "deploy")}>
          <span className="diagram-tab-icon">⬢</span>
          Deploy
        </TabsTrigger>
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
        <TabsTrigger value="org" className={tabClass(active === "org")}>
          <span className="diagram-tab-icon">👥</span>
          Org
        </TabsTrigger>
        <TabsTrigger value="matrix" className={tabClass(active === "matrix")}>
          <span className="diagram-tab-icon">▦</span>
          CRUD
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
