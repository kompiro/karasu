import { useMemo } from "react";
import type {
  SystemNode,
  OrganizationBlock,
  DeployBlockInfo,
  TeamNode,
  ResolvedContainerChain,
} from "@karasu-tools/core";
import { resolveContainerChain } from "@karasu-tools/core";
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

    // The path resolves through the same reader the view extraction uses
    // (#3113): a path with no system segment names a top-level node, whose
    // owning system is the "Unassigned" pseudo-system. The longest prefix that
    // resolves is shown, so a path the model has outgrown still shows its live
    // part.
    let resolved: ResolvedContainerChain | null = null;
    for (let length = viewPath.length; length > 0 && resolved === null; length--) {
      resolved = resolveContainerChain(resolvedSystems, viewPath.slice(0, length));
    }
    if (resolved === null) {
      const system = resolvedSystems.find((s) => s.id === viewPath[0]) ?? resolvedSystems[0];
      return [{ id: system.id, label: system.label ?? system.id, navigatePath: [] }];
    }

    const { ancestorChain, startIndex } = resolved;
    // Each item navigates to the prefix of the path it came from, so a path
    // without the system segment keeps navigating without it.
    const items: BreadcrumbItem[] = ancestorChain.map((node, depth) => ({
      id: node.id,
      label: node.label ?? node.id,
      // Clicking the system root goes back to the root view.
      navigatePath: depth === 0 ? [] : viewPath.slice(0, startIndex + depth),
    }));

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
