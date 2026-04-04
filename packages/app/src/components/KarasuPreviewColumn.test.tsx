// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import type { Diagnostic, Warning } from "@karasu/core";
import { KarasuPreviewColumn } from "./KarasuPreviewColumn.js";

afterEach(cleanup);

const noop = () => {};
const emptySvg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
const emptyDiagnostics: Diagnostic[] = [];
const emptyWarnings: Warning[] = [];
const sysWarning: Warning = { kind: "domain-dispersal", message: "sys warning", details: [] };
const orgWarning: Warning = { kind: "domain-dispersal", message: "org warning", details: [] };

function makeProps(overrides: Partial<Parameters<typeof KarasuPreviewColumn>[0]> = {}) {
  return {
    activeView: "system" as const,
    hasDeployDiagram: true,
    onActiveViewChange: vi.fn(),
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
      onContainerClick: vi.fn(),
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
    onDisplayModeChange: vi.fn(),
    onExportSvg: vi.fn(),
    isAllLayersOpen: false,
    onAllLayersToggle: vi.fn(),
    drillDownSvg: undefined,
    orgDrillDownSvg: undefined,
    allLayersSvg: undefined,
    orgAllLayersSvg: undefined,
    previewFocused: false,
    onPreviewFocusToggle: vi.fn(),
    ...overrides,
  };
}

describe("KarasuPreviewColumn", () => {
  describe("tab switching", () => {
    it("calls onActiveViewChange when System tab is clicked", () => {
      const props = makeProps({ activeView: "org" });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      fireEvent.click(getByRole("tab", { name: /System/ }));
      expect(props.onActiveViewChange).toHaveBeenCalledWith("system");
    });

    it("calls onActiveViewChange when Deploy tab is clicked", () => {
      const props = makeProps({ activeView: "system" });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      fireEvent.click(getByRole("tab", { name: /Deploy/ }));
      expect(props.onActiveViewChange).toHaveBeenCalledWith("deploy");
    });

    it("calls onActiveViewChange when Org tab is clicked", () => {
      const props = makeProps({ activeView: "system" });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      fireEvent.click(getByRole("tab", { name: /Org/ }));
      expect(props.onActiveViewChange).toHaveBeenCalledWith("org");
    });
  });

  describe("system view", () => {
    it("shows system BreadcrumbBar when activeView=system", () => {
      const props = makeProps({ activeView: "system" });
      const { getByText } = render(<KarasuPreviewColumn {...props} />);
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
      const { getByText, queryByText } = render(<KarasuPreviewColumn {...props} />);
      expect(getByText("sys warning")).toBeTruthy();
      expect(queryByText("org warning")).toBeNull();
    });
  });

  describe("deploy view", () => {
    it("hides BreadcrumbBar when activeView=deploy", () => {
      const props = makeProps({ activeView: "deploy" });
      const { queryByText } = render(<KarasuPreviewColumn {...props} />);
      // System breadcrumb items should not be visible (distinct from tab labels)
      expect(queryByText("Root")).toBeNull();
    });

    it("shows deploy warnings in WarningPanel when deploy is active", () => {
      const depWarning: Warning = { kind: "missing-runtime", message: "dep warning", details: [] };
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
      const { getByText, queryByText } = render(<KarasuPreviewColumn {...props} />);
      expect(getByText("dep warning")).toBeTruthy();
      expect(queryByText("sys warning")).toBeNull();
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
      const { getByText } = render(<KarasuPreviewColumn {...props} />);
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
      const { getByText, queryByText } = render(<KarasuPreviewColumn {...props} />);
      expect(getByText("org warning")).toBeTruthy();
      expect(queryByText("sys warning")).toBeNull();
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
      const { container } = render(<KarasuPreviewColumn {...props} />);
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
      const { container } = render(<KarasuPreviewColumn {...props} />);
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
      const { container } = render(<KarasuPreviewColumn {...props} />);
      expect(container.querySelector('[data-testid="org"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="sys"]')).toBeNull();
    });
  });

  describe("Reference button", () => {
    it("shows Reference button for all active views", () => {
      for (const activeView of ["system", "deploy", "org"] as const) {
        const { getByRole, unmount } = render(
          <KarasuPreviewColumn {...makeProps({ activeView })} />,
        );
        expect(getByRole("button", { name: /Open reference/ })).toBeTruthy();
        unmount();
      }
    });
  });

  describe("Icon Mode button", () => {
    it("shows Icon Mode button for all active views", () => {
      for (const activeView of ["system", "deploy", "org"] as const) {
        const { getByRole, unmount } = render(
          <KarasuPreviewColumn {...makeProps({ activeView })} />,
        );
        expect(getByRole("button", { name: /Toggle icon mode/ })).toBeTruthy();
        unmount();
      }
    });

    it("calls onDisplayModeChange when icon mode button is clicked in deploy view", () => {
      const props = makeProps({ activeView: "deploy" });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /Toggle icon mode/ }));
      expect(props.onDisplayModeChange).toHaveBeenCalledWith("icon");
    });

    it("calls onDisplayModeChange when icon mode button is clicked in org view", () => {
      const props = makeProps({ activeView: "org" });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /Toggle icon mode/ }));
      expect(props.onDisplayModeChange).toHaveBeenCalledWith("icon");
    });
  });

  describe("hasDeployDiagram=false", () => {
    it("renders Deploy tab as disabled", () => {
      const props = makeProps({ hasDeployDiagram: false });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      expect(getByRole("tab", { name: /Deploy/ })).toHaveProperty("ariaDisabled", "true");
    });
  });

  describe("Show All Layers button", () => {
    it("shows Show All Layers button on system tab", () => {
      const props = makeProps({ activeView: "system", allLayersSvg: "<svg>full</svg>" });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      expect(getByRole("button", { name: /Toggle all layers/ })).toBeTruthy();
    });

    it("Show All Layers button is disabled when allLayersSvg is absent", () => {
      const props = makeProps({ activeView: "system", allLayersSvg: undefined });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      expect(getByRole("button", { name: /Toggle all layers/ })).toHaveProperty("disabled", true);
    });

    it("Show All Layers button is disabled on deploy tab", () => {
      const props = makeProps({ activeView: "deploy", allLayersSvg: "<svg>full</svg>" });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      expect(getByRole("button", { name: /Toggle all layers/ })).toHaveProperty("disabled", true);
    });

    it("Show All Layers button is enabled on org tab when orgAllLayersSvg is set", () => {
      const props = makeProps({ activeView: "org", orgAllLayersSvg: "<svg>org-full</svg>" });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      expect(getByRole("button", { name: /Toggle all layers/ })).toHaveProperty("disabled", false);
    });

    it("renders iframe with orgAllLayersSvg when isAllLayersOpen=true on org tab", () => {
      const props = makeProps({
        activeView: "org",
        isAllLayersOpen: true,
        orgAllLayersSvg: "<svg>org-full</svg>",
      });
      const { container } = render(<KarasuPreviewColumn {...props} />);
      const iframe = container.querySelector("iframe");
      expect(iframe).toBeTruthy();
      expect(iframe?.title).toBe("Full diagram view");
    });

    it("calls onAllLayersToggle when clicked", () => {
      const onAllLayersToggle = vi.fn();
      const props = makeProps({
        activeView: "system",
        allLayersSvg: "<svg>full</svg>",
        onAllLayersToggle,
      });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /Toggle all layers/ }));
      expect(onAllLayersToggle).toHaveBeenCalled();
    });

    it("renders iframe when isAllLayersOpen=true and allLayersSvg is set", () => {
      const props = makeProps({
        activeView: "system",
        isAllLayersOpen: true,
        allLayersSvg: "<svg>full</svg>",
      });
      const { container } = render(<KarasuPreviewColumn {...props} />);
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
      const { container } = render(<KarasuPreviewColumn {...props} />);
      expect(container.querySelector("iframe")).toBeNull();
    });
  });

  describe("Focus mode button", () => {
    it("shows Focus button when not in focus mode", () => {
      const props = makeProps({ previewFocused: false });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      const btn = getByRole("button", { name: /Enter focus mode/ });
      expect(btn.textContent).toContain("↗ Focus");
    });

    it("shows Exit Focus button when in focus mode", () => {
      const props = makeProps({ previewFocused: true });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      const btn = getByRole("button", { name: /Exit focus mode/ });
      expect(btn.textContent).toContain("↙ Exit Focus");
    });

    it("calls onPreviewFocusToggle when clicked", () => {
      const onPreviewFocusToggle = vi.fn();
      const props = makeProps({ onPreviewFocusToggle });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /focus mode/ }));
      expect(onPreviewFocusToggle).toHaveBeenCalled();
    });

    it("has active class when previewFocused is true", () => {
      const props = makeProps({ previewFocused: true });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      const btn = getByRole("button", { name: /Exit focus mode/ });
      expect(btn.className).toContain("active");
    });
  });

  describe("Export SVG split button", () => {
    it("renders Export SVG main button and toggle button", () => {
      const props = makeProps({ activeView: "system" });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      expect(getByRole("button", { name: /Export SVG/ })).toBeTruthy();
      expect(getByRole("button", { name: /SVG export options/ })).toBeTruthy();
    });

    it("Export SVG exports current svg when isAllLayersOpen=false", () => {
      const onExportSvg = vi.fn();
      const props = makeProps({ activeView: "system", isAllLayersOpen: false, onExportSvg });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /Export SVG/ }));
      expect(onExportSvg).toHaveBeenCalledWith(emptySvg, expect.any(String));
    });

    it("Export SVG exports allLayersSvg with -all-layers suffix when isAllLayersOpen=true", () => {
      const onExportSvg = vi.fn();
      const allLayersSvg = "<svg>full</svg>";
      const props = makeProps({
        activeView: "system",
        isAllLayersOpen: true,
        allLayersSvg,
        onExportSvg,
      });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /Export SVG/ }));
      expect(onExportSvg).toHaveBeenCalledWith(allLayersSvg, expect.stringContaining("all-layers"));
    });

    it("clicking toggle button opens export options menu with drill-down item", () => {
      const props = makeProps({ activeView: "system" });
      const { getByRole, getByText } = render(<KarasuPreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /SVG export options/ }));
      expect(getByText("Export Drill-down SVG")).toBeTruthy();
    });

    it("Export Drill-down SVG calls onExportSvg with -drilldown suffix", () => {
      const onExportSvg = vi.fn();
      const drillDownSvg = "<svg>drilldown</svg>";
      const props = makeProps({
        activeView: "system",
        drillDownSvg,
        onExportSvg,
      });
      const { getByRole, getByText } = render(<KarasuPreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /SVG export options/ }));
      fireEvent.click(getByText("Export Drill-down SVG"));
      expect(onExportSvg).toHaveBeenCalledWith(drillDownSvg, expect.stringContaining("drilldown"));
    });

    it("Export Drill-down SVG is disabled on deploy tab", () => {
      const props = makeProps({
        activeView: "deploy",
        drillDownSvg: "<svg>drilldown</svg>",
      });
      const { getByRole, getByText } = render(<KarasuPreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /SVG export options/ }));
      expect(getByText("Export Drill-down SVG").closest("button")).toHaveProperty("disabled", true);
    });

    it("Export Drill-down SVG calls onExportSvg with -drilldown suffix on org tab", () => {
      const onExportSvg = vi.fn();
      const orgDrillDownSvg = "<svg>org-drilldown</svg>";
      const props = makeProps({
        activeView: "org",
        orgDrillDownSvg,
        onExportSvg,
      });
      const { getByRole, getByText } = render(<KarasuPreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /SVG export options/ }));
      fireEvent.click(getByText("Export Drill-down SVG"));
      expect(onExportSvg).toHaveBeenCalledWith(
        orgDrillDownSvg,
        expect.stringContaining("drilldown"),
      );
    });

    it("Export All Diagrams SVG is disabled when allViewsSvg is undefined", () => {
      const props = makeProps({ activeView: "system", allViewsSvg: undefined });
      const { getByRole, getByText } = render(<KarasuPreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /SVG export options/ }));
      expect(getByText("Export All Diagrams SVG").closest("button")).toHaveProperty(
        "disabled",
        true,
      );
    });

    it("Export All Diagrams SVG calls onExportSvg with all-diagrams.svg filename", () => {
      const onExportSvg = vi.fn();
      const allViewsSvg = "<svg>all-views</svg>";
      const props = makeProps({ activeView: "system", allViewsSvg, onExportSvg });
      const { getByRole, getByText } = render(<KarasuPreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /SVG export options/ }));
      fireEvent.click(getByText("Export All Diagrams SVG"));
      expect(onExportSvg).toHaveBeenCalledWith(allViewsSvg, "all-diagrams.svg");
    });
  });
});
