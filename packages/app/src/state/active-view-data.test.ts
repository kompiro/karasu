import { describe, it, expect } from "vitest";
import type { Diagnostic, Warning } from "@karasu-tools/core";
import { selectActiveViewData } from "./active-view-data.js";
import type { PreviewContextValue } from "./preview-context.js";
import type { ActiveView } from "./app-reducer.js";

const sysWarn: Warning = {
  kind: "domain-dispersal",
  params: { domainId: "sys", services: ["a", "b"] },
};
const orgWarn: Warning = {
  kind: "domain-dispersal",
  params: { domainId: "org", services: ["c", "d"] },
};
const depWarn: Warning = {
  kind: "domain-dispersal",
  params: { domainId: "dep", services: ["e", "f"] },
};
const noop = () => {};
const empty: Diagnostic[] = [];

function makeCtx(activeView: ActiveView): PreviewContextValue {
  return {
    activeView,
    hasDeployDiagram: true,
    onActiveViewChange: noop,
    systemView: {
      svg: "<sys/>",
      diagnostics: empty,
      viewPath: ["S"],
      breadcrumbItems: [{ id: "s", label: "S" }],
      warnings: [sysWarn],
      onBreadcrumbNavigate: noop,
      onDeployButtonClick: noop,
      onTeamButtonClick: noop,
      highlightedNodeId: "sysNode",
      onClearHighlight: noop,
      nodeDiff: new Map(),
      systems: [],
    },
    deployView: {
      svg: "<dep/>",
      diagnostics: empty,
      warnings: [depWarn],
      highlightedNodeId: "depNode",
      onClearHighlight: noop,
      onContainerClick: noop,
    },
    orgView: {
      svg: "<org/>",
      diagnostics: empty,
      viewPath: ["O"],
      breadcrumbItems: [{ id: "o", label: "O" }],
      warnings: [orgWarn],
      onBreadcrumbNavigate: noop,
      highlightedNodeId: "orgNode",
      onClearHighlight: noop,
      onOwnedServiceClick: noop,
    },
    nodeMetadata: new Map(),
    displayMode: "shape",
    onDisplayModeChange: noop,
    onExportSvg: noop,
    isAllLayersOpen: false,
    onAllLayersToggle: noop,
    allLayersSvg: "<sys-all/>",
    orgAllLayersSvg: "<org-all/>",
    drillDownSvg: "<sys-drill/>",
    orgDrillDownSvg: "<org-drill/>",
    previewFocused: false,
    onPreviewFocusToggle: noop,
    isOrgTreeViewOpen: false,
    onOrgTreeViewToggle: noop,
    styleTargetPath: "/theme.krs.style",
    onPickEdgeDirection: noop,
  };
}

describe("selectActiveViewData", () => {
  it("system: projects system slice + system-only handlers, system all-layers/drill SVGs", () => {
    const v = selectActiveViewData(makeCtx("system"));
    expect(v.svg).toBe("<sys/>");
    expect(v.warnings).toEqual([sysWarn]);
    expect(v.viewPath).toEqual(["S"]);
    expect(v.highlightedNodeId).toBe("sysNode");
    expect(v.allLayersSvg).toBe("<sys-all/>");
    expect(v.drillDownSvg).toBe("<sys-drill/>");
    expect(v.onDeployButtonClick).toBe(noop);
    expect(v.onTeamButtonClick).toBe(noop);
    expect(v.nodeDiff).toBeInstanceOf(Map);
    expect(v.styleTargetPath).toBe("/theme.krs.style");
    expect(v.onPickEdgeDirection).toBe(noop);
    // not applicable to system:
    expect(v.onContainerClick).toBeUndefined();
    expect(v.onOwnedServiceClick).toBeUndefined();
  });

  it("deploy: projects deploy slice, empty viewPath/breadcrumbs, no drill/all-layers, deploy-only handler", () => {
    const v = selectActiveViewData(makeCtx("deploy"));
    expect(v.svg).toBe("<dep/>");
    expect(v.warnings).toEqual([depWarn]);
    expect(v.viewPath).toEqual([]);
    expect(v.breadcrumbItems).toEqual([]);
    expect(v.onBreadcrumbNavigate).toBeUndefined();
    expect(v.allLayersSvg).toBeUndefined();
    expect(v.drillDownSvg).toBeUndefined();
    expect(v.highlightedNodeId).toBe("depNode");
    expect(v.onContainerClick).toBe(noop);
    // not applicable to deploy:
    expect(v.onDeployButtonClick).toBeUndefined();
    expect(v.nodeDiff).toBeUndefined();
    expect(v.styleTargetPath).toBeUndefined();
    expect(v.onPickEdgeDirection).toBeUndefined();
  });

  it("org: projects org slice + org all-layers/drill SVGs and org-only handler", () => {
    const v = selectActiveViewData(makeCtx("org"));
    expect(v.svg).toBe("<org/>");
    expect(v.warnings).toEqual([orgWarn]);
    expect(v.viewPath).toEqual(["O"]);
    expect(v.breadcrumbItems).toEqual([{ id: "o", label: "O" }]);
    expect(v.allLayersSvg).toBe("<org-all/>");
    expect(v.drillDownSvg).toBe("<org-drill/>");
    expect(v.highlightedNodeId).toBe("orgNode");
    expect(v.onOwnedServiceClick).toBe(noop);
    // not applicable to org:
    expect(v.onContainerClick).toBeUndefined();
    expect(v.onDeployButtonClick).toBeUndefined();
    expect(v.styleTargetPath).toBeUndefined();
  });

  it("matrix: shares the system projection (matrix derives from the system AST)", () => {
    const v = selectActiveViewData(makeCtx("matrix"));
    expect(v.svg).toBe("<sys/>");
    expect(v.warnings).toEqual([sysWarn]);
    expect(v.onDeployButtonClick).toBe(noop);
  });
});
