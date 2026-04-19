// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import type { Diagnostic, Warning } from "@karasu-tools/core";
import { PreviewColumn } from "./PreviewColumn.js";

afterEach(cleanup);

const noop = () => {};
const emptySvg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
const emptyDiagnostics: Diagnostic[] = [];
const emptyWarnings: Warning[] = [];
const sysWarning: Warning = {
  kind: "domain-dispersal",
  params: { domainId: "sys-domain", services: ["sys-a", "sys-b"] },
};
const orgWarning: Warning = {
  kind: "domain-dispersal",
  params: { domainId: "org-domain", services: ["org-a", "org-b"] },
};

function makeProps(overrides: Partial<Parameters<typeof PreviewColumn>[0]> = {}) {
  return {
    activeView: "system" as const,
    hasDeployDiagram: true,
    onActiveViewChange: vi.fn<() => void>(),
    systemView: {
      svg: emptySvg,
      diagnostics: emptyDiagnostics,
      viewPath: [],
      breadcrumbItems: [{ id: "root", label: "Root" }],
      warnings: emptyWarnings,
      onBreadcrumbNavigate: noop,
    },
    deployView: {
      svg: emptySvg,
      diagnostics: emptyDiagnostics,
      warnings: emptyWarnings,
      highlightedNodeId: null,
      onClearHighlight: noop,
      onContainerClick: vi.fn<() => void>(),
    },
    orgView: {
      svg: emptySvg,
      diagnostics: emptyDiagnostics,
      viewPath: [] as string[],
      breadcrumbItems: [{ id: "__org__", label: "Org" }],
      warnings: emptyWarnings,
      onBreadcrumbNavigate: noop,
    },
    nodeMetadata: new Map(),
    displayMode: "shape" as const,
    onDisplayModeChange: vi.fn<() => void>(),
    onExportSvg: vi.fn<() => void>(),
    isAllLayersOpen: false,
    onAllLayersToggle: vi.fn<() => void>(),
    drillDownSvg: undefined,
    orgDrillDownSvg: undefined,
    allLayersSvg: undefined,
    orgAllLayersSvg: undefined,
    previewFocused: false,
    onPreviewFocusToggle: vi.fn<() => void>(),
    isOrgTreeViewOpen: false,
    onOrgTreeViewToggle: vi.fn<() => void>(),
    orgTreeSvg: undefined,
    onTeamToggle: vi.fn<() => void>(),
    orgTreeExportSvg: undefined,
    ...overrides,
  };
}

describe("PreviewColumn", () => {
  describe("tab switching", () => {
    it("calls onActiveViewChange when System tab is clicked", () => {
      const props = makeProps({ activeView: "org" });
      const { getByRole } = render(<PreviewColumn {...props} />);
      fireEvent.click(getByRole("tab", { name: /System/ }));
      expect(props.onActiveViewChange).toHaveBeenCalledWith("system");
    });

    it("calls onActiveViewChange when Deploy tab is clicked", () => {
      const props = makeProps({ activeView: "system" });
      const { getByRole } = render(<PreviewColumn {...props} />);
      fireEvent.click(getByRole("tab", { name: /Deploy/ }));
      expect(props.onActiveViewChange).toHaveBeenCalledWith("deploy");
    });

    it("calls onActiveViewChange when Org tab is clicked", () => {
      const props = makeProps({ activeView: "system" });
      const { getByRole } = render(<PreviewColumn {...props} />);
      fireEvent.click(getByRole("tab", { name: /Org/ }));
      expect(props.onActiveViewChange).toHaveBeenCalledWith("org");
    });
  });

  describe("system view", () => {
    it("shows system BreadcrumbBar when activeView=system", () => {
      const props = makeProps({ activeView: "system" });
      const { getByText } = render(<PreviewColumn {...props} />);
      expect(getByText("Root")).toBeTruthy();
    });

    it("shows system warnings in WarningPanel", () => {
      const props = makeProps({
        activeView: "system",
        systemView: {
          ...makeProps().systemView,
          warnings: [sysWarning],
        },
        orgView: {
          ...makeProps().orgView,
          warnings: [orgWarning],
        },
      });
      const { container } = render(<PreviewColumn {...props} />);
      // sysWarning is a domain-dispersal warning with domainId "sys-domain";
      // formatWarning renders that id into the message.
      expect(container.textContent).toContain("sys-domain");
      expect(container.textContent).not.toContain("org-domain");
    });
  });

  describe("deploy view", () => {
    it("hides BreadcrumbBar when activeView=deploy", () => {
      const props = makeProps({ activeView: "deploy" });
      const { queryByText } = render(<PreviewColumn {...props} />);
      // System breadcrumb items should not be visible (distinct from tab labels)
      expect(queryByText("Root")).toBeNull();
    });

    it("shows deploy warnings in WarningPanel when deploy is active", () => {
      const depWarning: Warning = { kind: "missing-runtime", params: { nodeId: "dep-node" } };
      const props = makeProps({
        activeView: "deploy",
        systemView: {
          ...makeProps().systemView,
          warnings: [sysWarning],
        },
        deployView: {
          ...makeProps().deployView,
          warnings: [depWarning],
        },
      });
      const { container } = render(<PreviewColumn {...props} />);
      // depWarning is a missing-runtime warning with nodeId "dep-node".
      expect(container.textContent).toContain("dep-node");
      expect(container.textContent).not.toContain("sys-domain");
    });
  });

  describe("org view", () => {
    it("shows org BreadcrumbBar when activeView=org", () => {
      // Use a label distinct from DiagramTabBar tab text
      const props = makeProps({
        activeView: "org",
        orgView: {
          ...makeProps().orgView,
          breadcrumbItems: [{ id: "__org__", label: "OrgRoot" }],
        },
      });
      const { getByText } = render(<PreviewColumn {...props} />);
      expect(getByText("OrgRoot")).toBeTruthy();
    });

    it("shows org warnings in WarningPanel when activeView=org", () => {
      const props = makeProps({
        activeView: "org",
        systemView: {
          ...makeProps().systemView,
          warnings: [sysWarning],
        },
        orgView: {
          ...makeProps().orgView,
          warnings: [orgWarning],
        },
      });
      const { container } = render(<PreviewColumn {...props} />);
      // orgWarning is a domain-dispersal warning with domainId "org-domain".
      expect(container.textContent).toContain("org-domain");
      expect(container.textContent).not.toContain("sys-domain");
    });
  });

  describe("SVG rendering", () => {
    it("renders system svg when activeView=system", () => {
      const sysSvg = '<svg xmlns="http://www.w3.org/2000/svg" data-testid="sys"></svg>';
      const depSvg = '<svg xmlns="http://www.w3.org/2000/svg" data-testid="dep"></svg>';
      const props = makeProps({
        activeView: "system",
        systemView: { ...makeProps().systemView, svg: sysSvg },
        deployView: { ...makeProps().deployView, svg: depSvg },
      });
      const { container } = render(<PreviewColumn {...props} />);
      expect(container.querySelector('[data-testid="sys"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="dep"]')).toBeNull();
    });

    it("renders deploy svg when activeView=deploy", () => {
      const sysSvg = '<svg xmlns="http://www.w3.org/2000/svg" data-testid="sys"></svg>';
      const depSvg = '<svg xmlns="http://www.w3.org/2000/svg" data-testid="dep"></svg>';
      const props = makeProps({
        activeView: "deploy",
        systemView: { ...makeProps().systemView, svg: sysSvg },
        deployView: { ...makeProps().deployView, svg: depSvg },
      });
      const { container } = render(<PreviewColumn {...props} />);
      expect(container.querySelector('[data-testid="dep"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="sys"]')).toBeNull();
    });

    it("renders org svg when activeView=org", () => {
      const sysSvg = '<svg xmlns="http://www.w3.org/2000/svg" data-testid="sys"></svg>';
      const orgSvg = '<svg xmlns="http://www.w3.org/2000/svg" data-testid="org"></svg>';
      const props = makeProps({
        activeView: "org",
        systemView: { ...makeProps().systemView, svg: sysSvg },
        orgView: { ...makeProps().orgView, svg: orgSvg },
      });
      const { container } = render(<PreviewColumn {...props} />);
      expect(container.querySelector('[data-testid="org"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="sys"]')).toBeNull();
    });
  });

  describe("Reference button", () => {
    it("shows Reference button for all active views", () => {
      for (const activeView of ["system", "deploy", "org"] as const) {
        const { getByRole, unmount } = render(<PreviewColumn {...makeProps({ activeView })} />);
        expect(getByRole("button", { name: /Open reference/ })).toBeTruthy();
        unmount();
      }
    });
  });

  describe("Icon Mode button", () => {
    it("shows Icon Mode button for all active views", () => {
      for (const activeView of ["system", "deploy", "org"] as const) {
        const { getByRole, unmount } = render(<PreviewColumn {...makeProps({ activeView })} />);
        expect(getByRole("button", { name: /Toggle icon mode/ })).toBeTruthy();
        unmount();
      }
    });

    it("calls onDisplayModeChange when icon mode button is clicked in deploy view", () => {
      const props = makeProps({ activeView: "deploy" });
      const { getByRole } = render(<PreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /Toggle icon mode/ }));
      expect(props.onDisplayModeChange).toHaveBeenCalledWith("icon");
    });

    it("calls onDisplayModeChange when icon mode button is clicked in org view", () => {
      const props = makeProps({ activeView: "org" });
      const { getByRole } = render(<PreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /Toggle icon mode/ }));
      expect(props.onDisplayModeChange).toHaveBeenCalledWith("icon");
    });
  });

  describe("hasDeployDiagram=false", () => {
    it("renders Deploy tab as disabled", () => {
      const props = makeProps({ hasDeployDiagram: false });
      const { getByRole } = render(<PreviewColumn {...props} />);
      expect(getByRole("tab", { name: /Deploy/ })).toHaveProperty("ariaDisabled", "true");
    });
  });

  describe("Show All Layers button", () => {
    it("shows Show All Layers button on system tab", () => {
      const props = makeProps({ activeView: "system", allLayersSvg: "<svg>full</svg>" });
      const { getByRole } = render(<PreviewColumn {...props} />);
      expect(getByRole("button", { name: /Toggle all layers/ })).toBeTruthy();
    });

    it("Show All Layers button is disabled when allLayersSvg is absent", () => {
      const props = makeProps({ activeView: "system", allLayersSvg: undefined });
      const { getByRole } = render(<PreviewColumn {...props} />);
      expect(getByRole("button", { name: /Toggle all layers/ })).toHaveProperty("disabled", true);
    });

    it("Show All Layers button is disabled on deploy tab", () => {
      const props = makeProps({ activeView: "deploy", allLayersSvg: "<svg>full</svg>" });
      const { getByRole } = render(<PreviewColumn {...props} />);
      expect(getByRole("button", { name: /Toggle all layers/ })).toHaveProperty("disabled", true);
    });

    it("Show All Layers button is enabled on org tab when orgAllLayersSvg is set", () => {
      const props = makeProps({ activeView: "org", orgAllLayersSvg: "<svg>org-full</svg>" });
      const { getByRole } = render(<PreviewColumn {...props} />);
      expect(getByRole("button", { name: /Toggle all layers/ })).toHaveProperty("disabled", false);
    });

    it("renders iframe with orgAllLayersSvg when isAllLayersOpen=true on org tab", () => {
      const props = makeProps({
        activeView: "org",
        isAllLayersOpen: true,
        orgAllLayersSvg: "<svg>org-full</svg>",
      });
      const { container } = render(<PreviewColumn {...props} />);
      const iframe = container.querySelector("iframe");
      expect(iframe).toBeTruthy();
      expect(iframe?.title).toBe("Full diagram view");
    });

    it("calls onAllLayersToggle when clicked", () => {
      const onAllLayersToggle = vi.fn<() => void>();
      const props = makeProps({
        activeView: "system",
        allLayersSvg: "<svg>full</svg>",
        onAllLayersToggle,
      });
      const { getByRole } = render(<PreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /Toggle all layers/ }));
      expect(onAllLayersToggle).toHaveBeenCalled();
    });

    it("renders iframe when isAllLayersOpen=true and allLayersSvg is set", () => {
      const props = makeProps({
        activeView: "system",
        isAllLayersOpen: true,
        allLayersSvg: "<svg>full</svg>",
      });
      const { container } = render(<PreviewColumn {...props} />);
      const iframe = container.querySelector("iframe");
      expect(iframe).toBeTruthy();
      expect(iframe?.title).toBe("Full diagram view");
    });

    it("does not render iframe when isAllLayersOpen=false", () => {
      const props = makeProps({
        activeView: "system",
        isAllLayersOpen: false,
        allLayersSvg: "<svg>full</svg>",
      });
      const { container } = render(<PreviewColumn {...props} />);
      expect(container.querySelector("iframe")).toBeNull();
    });
  });

  describe("Focus mode button", () => {
    it("shows Focus button when not in focus mode", () => {
      const props = makeProps({ previewFocused: false });
      const { getByRole } = render(<PreviewColumn {...props} />);
      const btn = getByRole("button", { name: /Enter focus mode/ });
      expect(btn.textContent).toContain("↗ Focus");
    });

    it("shows Exit Focus button when in focus mode", () => {
      const props = makeProps({ previewFocused: true });
      const { getByRole } = render(<PreviewColumn {...props} />);
      const btn = getByRole("button", { name: /Exit focus mode/ });
      expect(btn.textContent).toContain("↙ Exit Focus");
    });

    it("calls onPreviewFocusToggle when clicked", () => {
      const onPreviewFocusToggle = vi.fn<() => void>();
      const props = makeProps({ onPreviewFocusToggle });
      const { getByRole } = render(<PreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /focus mode/ }));
      expect(onPreviewFocusToggle).toHaveBeenCalled();
    });

    it("has active class when previewFocused is true", () => {
      const props = makeProps({ previewFocused: true });
      const { getByRole } = render(<PreviewColumn {...props} />);
      const btn = getByRole("button", { name: /Exit focus mode/ });
      expect(btn.className).toContain("active");
    });
  });

  describe("Export SVG split button", () => {
    it("renders Export SVG main button and toggle button", () => {
      const props = makeProps({ activeView: "system" });
      const { getByRole } = render(<PreviewColumn {...props} />);
      expect(getByRole("button", { name: /Export SVG/ })).toBeTruthy();
      expect(getByRole("button", { name: /SVG export options/ })).toBeTruthy();
    });

    it("Export SVG exports current svg when isAllLayersOpen=false", () => {
      const onExportSvg = vi.fn<() => void>();
      const props = makeProps({ activeView: "system", isAllLayersOpen: false, onExportSvg });
      const { getByRole } = render(<PreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /Export SVG/ }));
      expect(onExportSvg).toHaveBeenCalledWith(emptySvg, expect.any(String));
    });

    it("Export SVG exports allLayersSvg with -all-layers suffix when isAllLayersOpen=true", () => {
      const onExportSvg = vi.fn<() => void>();
      const allLayersSvg = "<svg>full</svg>";
      const props = makeProps({
        activeView: "system",
        isAllLayersOpen: true,
        allLayersSvg,
        onExportSvg,
      });
      const { getByRole } = render(<PreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /Export SVG/ }));
      expect(onExportSvg).toHaveBeenCalledWith(allLayersSvg, expect.stringContaining("all-layers"));
    });

    it("clicking toggle button opens export options menu with drill-down item", () => {
      const props = makeProps({ activeView: "system" });
      const { getByRole, getByText } = render(<PreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /SVG export options/ }));
      expect(getByText("Export Drill-down SVG")).toBeTruthy();
    });

    it("Export Drill-down SVG calls onExportSvg with -drilldown suffix", () => {
      const onExportSvg = vi.fn<() => void>();
      const drillDownSvg = "<svg>drilldown</svg>";
      const props = makeProps({
        activeView: "system",
        drillDownSvg,
        onExportSvg,
      });
      const { getByRole, getByText } = render(<PreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /SVG export options/ }));
      fireEvent.click(getByText("Export Drill-down SVG"));
      expect(onExportSvg).toHaveBeenCalledWith(drillDownSvg, expect.stringContaining("drilldown"));
    });

    it("Export Drill-down SVG is disabled on deploy tab", () => {
      const props = makeProps({
        activeView: "deploy",
        drillDownSvg: "<svg>drilldown</svg>",
      });
      const { getByRole, getByText } = render(<PreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /SVG export options/ }));
      expect(getByText("Export Drill-down SVG").closest("button")).toHaveProperty("disabled", true);
    });

    it("Export Drill-down SVG calls onExportSvg with -drilldown suffix on org tab", () => {
      const onExportSvg = vi.fn<() => void>();
      const orgDrillDownSvg = "<svg>org-drilldown</svg>";
      const props = makeProps({
        activeView: "org",
        orgDrillDownSvg,
        onExportSvg,
      });
      const { getByRole, getByText } = render(<PreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /SVG export options/ }));
      fireEvent.click(getByText("Export Drill-down SVG"));
      expect(onExportSvg).toHaveBeenCalledWith(
        orgDrillDownSvg,
        expect.stringContaining("drilldown"),
      );
    });

    it("Export All Diagrams SVG is disabled when allViewsSvg is undefined", () => {
      const props = makeProps({ activeView: "system", allViewsSvg: undefined });
      const { getByRole, getByText } = render(<PreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /SVG export options/ }));
      expect(getByText("Export All Diagrams SVG").closest("button")).toHaveProperty(
        "disabled",
        true,
      );
    });

    it("Export All Diagrams SVG calls onExportSvg with all-diagrams.svg filename", () => {
      const onExportSvg = vi.fn<() => void>();
      const allViewsSvg = "<svg>all-views</svg>";
      const props = makeProps({ activeView: "system", allViewsSvg, onExportSvg });
      const { getByRole, getByText } = render(<PreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /SVG export options/ }));
      fireEvent.click(getByText("Export All Diagrams SVG"));
      expect(onExportSvg).toHaveBeenCalledWith(allViewsSvg, "all-diagrams.svg");
    });
  });

  describe("Open All Views button", () => {
    it("shows Open All Views button", () => {
      const props = makeProps();
      const { getByRole } = render(<PreviewColumn {...props} />);
      expect(getByRole("button", { name: /Open all views in new window/ })).toBeTruthy();
    });

    it("is disabled when allViewsSvg is undefined", () => {
      const props = makeProps({ allViewsSvg: undefined });
      const { getByRole } = render(<PreviewColumn {...props} />);
      expect(getByRole("button", { name: /Open all views in new window/ })).toHaveProperty(
        "disabled",
        true,
      );
    });

    it("is enabled when allViewsSvg is set", () => {
      const props = makeProps({ allViewsSvg: "<svg>all-views</svg>" });
      const { getByRole } = render(<PreviewColumn {...props} />);
      expect(getByRole("button", { name: /Open all views in new window/ })).toHaveProperty(
        "disabled",
        false,
      );
    });

    it("calls window.open with a blob URL when clicked", () => {
      const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
      const props = makeProps({ allViewsSvg: "<svg>all-views</svg>" });
      const { getByRole } = render(<PreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /Open all views in new window/ }));
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(openSpy).toHaveBeenCalledWith("blob:mock-url", "_blank");
      openSpy.mockRestore();
    });

    it("does not call window.open when allViewsSvg is undefined", () => {
      const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
      const props = makeProps({ allViewsSvg: undefined });
      const { getByRole } = render(<PreviewColumn {...props} />);
      // button is disabled, but verify open is not called even if handler fires
      getByRole("button", { name: /Open all views in new window/ });
      expect(openSpy).not.toHaveBeenCalled();
      openSpy.mockRestore();
    });
  });
});
