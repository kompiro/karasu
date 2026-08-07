// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePreviewContextValue } from "./usePreviewContextValue.js";

// Forwarding fence for the system-view half of the preview context.
//
// `usePreviewContextValue` maps a `Pick<SystemViewBundle, …>` into
// `PreviewContextValue.systemView` through a hand-written object literal. The
// `Pick` makes the *caller* supply each field, but nothing makes the literal
// forward it — and because most `SystemViewData` fields are optional, dropping
// one type-checks cleanly and fails silently at runtime.
//
// That is not hypothetical: `facetOverview` (#2177) was added to the bundle,
// the context type and the panel, and omitted here. The Facets menu's
// "Membership overview" item set its state, the panel's `facetOverview.length`
// guard saw `undefined`, and clicking it did nothing. The component test did
// not catch it because it builds `PreviewContextValue` by hand and never runs
// this mapping.
//
// So this asserts identity forwarding for every system field, and asserts the
// table below covers the whole `system` argument — a new bundle field with no
// row here fails rather than being quietly dropped.

/** `[bundle key, systemView key]` for every field this hook forwards. */
const FORWARDED: ReadonlyArray<readonly [string, string]> = [
  ["svg", "svg"],
  ["diagnostics", "diagnostics"],
  ["warnings", "warnings"],
  ["nodeDiff", "nodeDiff"],
  ["resolvedSystems", "systems"],
  ["toggleCategory", "onCategoryToggle"],
  ["toggleGroup", "onGroupToggle"],
  ["toggleExpand", "onExpandToggle"],
  ["groupBy", "groupBy"],
  ["setGroupBy", "onGroupByChange"],
  ["selectedFacets", "selectedFacets"],
  ["toggleFacet", "onFacetToggle"],
  ["facets", "facets"],
  ["facetOverview", "facetOverview"],
  ["hasTeamAxis", "hasTeamAxis"],
  ["hasBoundaryAxis", "hasBoundaryAxis"],
  ["anyCollapsible", "anyCollapsible"],
  ["allCollapsed", "allCollapsed"],
  ["expansionOverload", "expansionOverload"],
  ["onCollapseAllToggle", "onCollapseAllToggle"],
];

/** Fields the hook consumes but does not forward onto `systemView`. */
const NOT_ON_SYSTEM_VIEW = new Set(["hasDeployDiagram"]);

/** Distinct sentinel per key, so a mix-up is as visible as a drop. */
function makeSystemBundle(): Record<string, unknown> {
  return {
    svg: "<svg id='sys'></svg>",
    diagnostics: [],
    warnings: [],
    hasDeployDiagram: true,
    nodeDiff: new Map(),
    resolvedSystems: [{ sentinel: "systems" }],
    toggleCategory: vi.fn<() => void>(),
    toggleGroup: vi.fn<() => void>(),
    toggleExpand: vi.fn<() => void>(),
    groupBy: "team",
    setGroupBy: vi.fn<() => void>(),
    selectedFacets: ["pii"],
    toggleFacet: vi.fn<() => void>(),
    facets: [{ id: "pii", label: "Personal data" }],
    facetOverview: [{ id: "pii", label: "Personal data", links: [], declared: true, members: [] }],
    hasTeamAxis: true,
    hasBoundaryAxis: false,
    anyCollapsible: true,
    allCollapsed: false,
    expansionOverload: false,
    onCollapseAllToggle: vi.fn<() => void>(),
  };
}

function renderContext(system: Record<string, unknown>) {
  const args = {
    activeView: "system" as const,
    viewPath: [],
    selectedDeployBlockId: null,
    displayMode: "shape" as const,
    highlightedNodeId: null,
    nodeMetadata: new Map(),
    system,
    deploy: { svg: "", diagnostics: [], warnings: [], deployBlocks: [] },
    org: { svg: "", diagnostics: [], warnings: [] },
    breadcrumbItems: [{ id: "root", label: "Root" }],
    orgBreadcrumbItems: [{ id: "__org__", label: "Org" }],
    nav: {
      onBreadcrumbNavigate: vi.fn<() => void>(),
      onOrgBreadcrumbNavigate: vi.fn<() => void>(),
      onDeployButtonClick: vi.fn<() => void>(),
      onTeamButtonClick: vi.fn<() => void>(),
      onOwnedServiceClick: vi.fn<() => void>(),
      onContainerClick: vi.fn<() => void>(),
      onClearHighlight: vi.fn<() => void>(),
      onDeployBlockChange: vi.fn<() => void>(),
    },
    navigateActiveView: vi.fn<() => void>(),
    navigateViewPath: vi.fn<() => void>(),
    isAllLayersOpen: false,
    toggleAllLayers: vi.fn<() => void>(),
    previewFocused: false,
    togglePreviewFocus: vi.fn<() => void>(),
    isOrgTreeViewOpen: false,
    toggleOrgTreeView: vi.fn<() => void>(),
    isEntityViewOpen: false,
    toggleEntityView: vi.fn<() => void>(),
    hasEntityView: false,
    onExportSvg: vi.fn<() => void>(),
  } as unknown as Parameters<typeof usePreviewContextValue>[0];

  return renderHook(() => usePreviewContextValue(args)).result.current;
}

describe("usePreviewContextValue — system-view forwarding", () => {
  it("covers every field of the system argument (no silent drops)", () => {
    // The guard that makes the rest of this file keep working: if a field is
    // added to the bundle and not forwarded, it has no row here and this fails.
    const supplied = Object.keys(makeSystemBundle());
    const accounted = new Set([...FORWARDED.map(([k]) => k), ...NOT_ON_SYSTEM_VIEW]);
    expect(supplied.filter((k) => !accounted.has(k))).toEqual([]);
  });

  it.each(FORWARDED)("forwards %s onto systemView.%s by identity", (bundleKey, viewKey) => {
    const system = makeSystemBundle();
    const value = renderContext(system);
    const got = (value.systemView as unknown as Record<string, unknown>)[viewKey];
    expect(got).toBe(system[bundleKey]);
  });

  it("carries facetOverview through, which is what the overview panel gates on", () => {
    // Pinned separately because the regression was specifically this field
    // arriving as `undefined`, which made the panel render nothing while every
    // other facet control kept working.
    const system = makeSystemBundle();
    const value = renderContext(system);
    expect(value.systemView.facetOverview).toBeDefined();
    expect(value.systemView.facetOverview?.length).toBeGreaterThan(0);
  });
});
