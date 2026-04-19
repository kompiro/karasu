// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useBreadcrumbs } from "./useBreadcrumbs.js";
import type { SystemNode, OrganizationBlock, DeployBlockInfo, TeamNode } from "@karasu-tools/core";

afterEach(cleanup);

function makeLoc() {
  return { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } };
}

function makeSystem(id: string, label: string, children: SystemNode["children"] = []): SystemNode {
  return {
    kind: "system",
    id,
    label,
    children,
    annotations: [],
    tags: [],
    loc: makeLoc(),
  } as unknown as SystemNode;
}

function makeTeam(id: string, label: string, children: TeamNode["children"] = []): TeamNode {
  return {
    kind: "team",
    id,
    label,
    children,
    annotations: [],
    tags: [],
    loc: makeLoc(),
  } as unknown as TeamNode;
}

describe("useBreadcrumbs", () => {
  describe("system breadcrumbs", () => {
    it("returns a single non-clickable item at root", () => {
      const system = makeSystem("Web", "Web");
      const { result } = renderHook(() =>
        useBreadcrumbs({
          resolvedSystems: [system],
          organizations: [],
          viewPath: [],
          activeView: "system",
          deployBlocks: [],
          selectedDeployBlockId: null,
        }),
      );
      expect(result.current.breadcrumbItems).toEqual([{ id: "Web", label: "Web" }]);
    });

    it("builds clickable items with explicit navigatePath when drilled in", () => {
      const child = makeSystem("Inner", "Inner");
      const system = makeSystem("Web", "Web", [child]);
      const { result } = renderHook(() =>
        useBreadcrumbs({
          resolvedSystems: [system],
          organizations: [],
          viewPath: ["Web", "Inner"],
          activeView: "system",
          deployBlocks: [],
          selectedDeployBlockId: null,
        }),
      );
      expect(result.current.breadcrumbItems).toEqual([
        { id: "Web", label: "Web", navigatePath: [] },
        { id: "Inner", label: "Inner", navigatePath: ["Web", "Inner"] },
      ]);
    });

    it("returns [] when no systems", () => {
      const { result } = renderHook(() =>
        useBreadcrumbs({
          resolvedSystems: [],
          organizations: [],
          viewPath: [],
          activeView: "system",
          deployBlocks: [],
          selectedDeployBlockId: null,
        }),
      );
      expect(result.current.breadcrumbItems).toEqual([]);
    });
  });

  describe("org breadcrumbs", () => {
    it("returns org root + drilled teams", () => {
      const team = makeTeam("platform", "Platform");
      const org = {
        id: "Co",
        label: "Co",
        teams: [team],
        annotations: [],
        tags: [],
        loc: makeLoc(),
      } as unknown as OrganizationBlock;
      const { result } = renderHook(() =>
        useBreadcrumbs({
          resolvedSystems: [],
          organizations: [org],
          viewPath: ["platform"],
          activeView: "org",
          deployBlocks: [],
          selectedDeployBlockId: null,
        }),
      );
      expect(result.current.orgBreadcrumbItems).toEqual([
        { id: "__org__", label: "Co" },
        { id: "platform", label: "Platform" },
      ]);
    });
  });

  describe("scopeLabel", () => {
    it("joins system breadcrumb labels with >", () => {
      const child = makeSystem("Inner", "Inner Label");
      const system = makeSystem("Web", "Web Label", [child]);
      const { result } = renderHook(() =>
        useBreadcrumbs({
          resolvedSystems: [system],
          organizations: [],
          viewPath: ["Web", "Inner"],
          activeView: "system",
          deployBlocks: [],
          selectedDeployBlockId: null,
        }),
      );
      expect(result.current.scopeLabel).toBe("Web Label > Inner Label");
    });

    it("returns 'Root' for system view with empty breadcrumbs", () => {
      const { result } = renderHook(() =>
        useBreadcrumbs({
          resolvedSystems: [],
          organizations: [],
          viewPath: [],
          activeView: "system",
          deployBlocks: [],
          selectedDeployBlockId: null,
        }),
      );
      expect(result.current.scopeLabel).toBe("Root");
    });

    it("returns selected deploy block label in deploy view", () => {
      const blocks: DeployBlockInfo[] = [
        { id: "Prod", label: "Production" } as unknown as DeployBlockInfo,
        { id: "Dev", label: "Development" } as unknown as DeployBlockInfo,
      ];
      const { result } = renderHook(() =>
        useBreadcrumbs({
          resolvedSystems: [],
          organizations: [],
          viewPath: [],
          activeView: "deploy",
          deployBlocks: blocks,
          selectedDeployBlockId: "Dev",
        }),
      );
      expect(result.current.scopeLabel).toBe("Development");
    });

    it("falls back to first deploy block when selected id does not match", () => {
      const blocks: DeployBlockInfo[] = [
        { id: "Prod", label: "Production" } as unknown as DeployBlockInfo,
      ];
      const { result } = renderHook(() =>
        useBreadcrumbs({
          resolvedSystems: [],
          organizations: [],
          viewPath: [],
          activeView: "deploy",
          deployBlocks: blocks,
          selectedDeployBlockId: null,
        }),
      );
      expect(result.current.scopeLabel).toBe("Production");
    });

    it("returns 'Deploy' when no deploy blocks", () => {
      const { result } = renderHook(() =>
        useBreadcrumbs({
          resolvedSystems: [],
          organizations: [],
          viewPath: [],
          activeView: "deploy",
          deployBlocks: [],
          selectedDeployBlockId: null,
        }),
      );
      expect(result.current.scopeLabel).toBe("Deploy");
    });
  });
});
