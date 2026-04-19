import { useMemo } from "react";
import type {
  SystemNode,
  OrganizationBlock,
  DeployBlockInfo,
  TeamNode,
  KrsNode,
} from "@karasu-tools/core";
import type { ActiveView } from "../state/app-reducer.js";
import type { BreadcrumbItem } from "../components/Breadcrumb.js";

interface UseBreadcrumbsArgs {
  resolvedSystems: SystemNode[];
  organizations: OrganizationBlock[];
  viewPath: string[];
  activeView: ActiveView;
  deployBlocks: DeployBlockInfo[];
  selectedDeployBlockId: string | null;
}

interface UseBreadcrumbsResult {
  breadcrumbItems: BreadcrumbItem[];
  orgBreadcrumbItems: { id: string; label: string }[];
  /** Human-readable label used by the chat pane to describe the active scope. */
  scopeLabel: string;
}

export function useBreadcrumbs({
  resolvedSystems,
  organizations,
  viewPath,
  activeView,
  deployBlocks,
  selectedDeployBlockId,
}: UseBreadcrumbsArgs): UseBreadcrumbsResult {
  const breadcrumbItems = useMemo<BreadcrumbItem[]>(() => {
    if (resolvedSystems.length === 0) return [];

    if (viewPath.length === 0) {
      // Root view: show only the active system label (not clickable)
      const system = resolvedSystems[0];
      return [{ id: system.id, label: system.label ?? system.id }];
    }

    // Phase 2: viewPath[0] is the system ID, viewPath[1:] is the navigation within it.
    // Build breadcrumb items with explicit navigatePath so that clicking each item
    // navigates to the correct Phase 2 path (including system ID prefix).
    const activeSystem = resolvedSystems.find((s) => s.id === viewPath[0]) ?? resolvedSystems[0];
    const items: BreadcrumbItem[] = [
      {
        id: activeSystem.id,
        label: activeSystem.label ?? activeSystem.id,
        navigatePath: [], // Clicking the system root goes back to root view
      },
    ];

    let current: KrsNode = activeSystem;
    for (let i = 1; i < viewPath.length; i++) {
      const child: KrsNode | undefined = current.children.find((c) => c.id === viewPath[i]);
      if (!child) break;
      items.push({
        id: child.id,
        label: child.label ?? child.id,
        navigatePath: viewPath.slice(0, i + 1),
      });
      current = child;
    }

    return items;
  }, [resolvedSystems, viewPath]);

  const orgBreadcrumbItems = useMemo<{ id: string; label: string }[]>(() => {
    if (organizations.length === 0) return [];

    const rootLabel = organizations[0].label ?? organizations[0].id;
    const items: { id: string; label: string }[] = [{ id: "__org__", label: rootLabel }];

    let teams = organizations.flatMap((o) => o.teams);
    for (const segment of viewPath) {
      const team = teams.find((t) => t.id === segment);
      if (!team) break;
      items.push({ id: team.id, label: team.label ?? team.id });
      teams = team.children.filter((c): c is TeamNode => c.kind === "team");
    }

    return items;
  }, [organizations, viewPath]);

  const scopeLabel = useMemo(() => {
    if (activeView === "system") {
      return breadcrumbItems.length > 0
        ? breadcrumbItems.map((item) => item.label).join(" > ")
        : "Root";
    }
    if (activeView === "org") {
      return orgBreadcrumbItems.length > 0
        ? orgBreadcrumbItems.map((item) => item.label).join(" > ")
        : "Root";
    }
    // deploy: show selected block label
    const block = deployBlocks.find((b) => b.id === selectedDeployBlockId) ?? deployBlocks[0];
    return block?.label ?? "Deploy";
  }, [activeView, breadcrumbItems, orgBreadcrumbItems, deployBlocks, selectedDeployBlockId]);

  return { breadcrumbItems, orgBreadcrumbItems, scopeLabel };
}
