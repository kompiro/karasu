// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import type { Diagnostic, Warning } from "@karasu-tools/core";
import { PreviewColumn } from "./PreviewColumn.js";
import { PreviewProvider, type PreviewContextValue } from "../state/preview-context.js";
import { LocaleProvider } from "../i18n/index.js";

afterEach(cleanup);

function render(ui: ReactElement, initialLocale: "en" | "ja" = "en") {
  return rtlRender(<LocaleProvider initialLocale={initialLocale}>{ui}</LocaleProvider>);
}

function renderPreview(value: PreviewContextValue) {
  return render(
    <PreviewProvider value={value}>
      <PreviewColumn />
    </PreviewProvider>,
  );
}

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

function makeProps(overrides: Partial<PreviewContextValue> = {}): PreviewContextValue {
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
      systems: [],
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
    // shadcn migration (#1368): Radix Tabs.Trigger needs userEvent to fire
    // the full pointerdown→pointerup→click sequence; bare fireEvent.click
    // is silently dropped by the Radix dismissable layer.

    it("calls onActiveViewChange when System tab is clicked", async () => {
      const user = userEvent.setup();
      const props = makeProps({ activeView: "org" });
      const { getByRole } = renderPreview(props);
      await user.click(getByRole("tab", { name: /System/ }));
      expect(props.onActiveViewChange).toHaveBeenCalledWith("system");
    });

    it("calls onActiveViewChange when Deploy tab is clicked", async () => {
      const user = userEvent.setup();
      const props = makeProps({ activeView: "system" });
      const { getByRole } = renderPreview(props);
      await user.click(getByRole("tab", { name: /Deploy/ }));
      expect(props.onActiveViewChange).toHaveBeenCalledWith("deploy");
    });

    it("calls onActiveViewChange when Org tab is clicked", async () => {
      const user = userEvent.setup();
      const props = makeProps({ activeView: "system" });
      const { getByRole } = renderPreview(props);
      await user.click(getByRole("tab", { name: /Org/ }));
      expect(props.onActiveViewChange).toHaveBeenCalledWith("org");
    });
  });

  describe("system view", () => {
    it("shows system BreadcrumbBar when activeView=system", () => {
      const props = makeProps({ activeView: "system" });
      const { getByText } = renderPreview(props);
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
      const { container } = renderPreview(props);
      // sysWarning is a domain-dispersal warning with domainId "sys-domain";
      // formatWarning renders that id into the message.
      expect(container.textContent).toContain("sys-domain");
      expect(container.textContent).not.toContain("org-domain");
    });
  });

  describe("deploy view", () => {
    it("hides BreadcrumbBar when activeView=deploy", () => {
      const props = makeProps({ activeView: "deploy" });
      const { queryByText } = renderPreview(props);
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
      const { container } = renderPreview(props);
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
      const { getByText } = renderPreview(props);
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
      const { container } = renderPreview(props);
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
      const { container } = renderPreview(props);
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
      const { container } = renderPreview(props);
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
      const { container } = renderPreview(props);
      expect(container.querySelector('[data-testid="org"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="sys"]')).toBeNull();
    });
  });

  describe("Reference button", () => {
    it("shows Reference button for all active views", () => {
      for (const activeView of ["system", "deploy", "org"] as const) {
        const { getByRole, unmount } = renderPreview(makeProps({ activeView }));
        expect(getByRole("button", { name: /Open reference/ })).toBeTruthy();
        unmount();
      }
    });
  });

  describe("Icon Mode button", () => {
    it("shows Icon Mode button for all active views", () => {
      for (const activeView of ["system", "deploy", "org"] as const) {
        const { getByRole, unmount } = renderPreview(makeProps({ activeView }));
        expect(getByRole("button", { name: /Toggle icon mode/ })).toBeTruthy();
        unmount();
      }
    });

    it("calls onDisplayModeChange when icon mode button is clicked in deploy view", () => {
      const props = makeProps({ activeView: "deploy" });
      const { getByRole } = renderPreview(props);
      fireEvent.click(getByRole("button", { name: /Toggle icon mode/ }));
      expect(props.onDisplayModeChange).toHaveBeenCalledWith("icon");
    });

    it("calls onDisplayModeChange when icon mode button is clicked in org view", () => {
      const props = makeProps({ activeView: "org" });
      const { getByRole } = renderPreview(props);
      fireEvent.click(getByRole("button", { name: /Toggle icon mode/ }));
      expect(props.onDisplayModeChange).toHaveBeenCalledWith("icon");
    });
  });

  describe("hasDeployDiagram=false", () => {
    it("still renders Deploy tab as clickable", async () => {
      const user = userEvent.setup();
      const props = makeProps({ hasDeployDiagram: false });
      const { getByRole } = renderPreview(props);
      const deployTab = getByRole("tab", { name: /Deploy/ });
      expect(deployTab.getAttribute("aria-disabled")).not.toBe("true");
      await user.click(deployTab);
      expect(props.onActiveViewChange).toHaveBeenCalledWith("deploy");
    });
  });

  describe("Show All Layers button", () => {
    it("shows Show All Layers button on system tab", () => {
      const props = makeProps({ activeView: "system", allLayersSvg: "<svg>full</svg>" });
      const { getByRole } = renderPreview(props);
      expect(getByRole("button", { name: /Toggle all layers/ })).toBeTruthy();
    });

    it("Show All Layers button is disabled when allLayersSvg is absent", () => {
      const props = makeProps({ activeView: "system", allLayersSvg: undefined });
      const { getByRole } = renderPreview(props);
      expect(getByRole("button", { name: /Toggle all layers/ })).toHaveProperty("disabled", true);
    });

    it("Show All Layers button is disabled on deploy tab", () => {
      const props = makeProps({ activeView: "deploy", allLayersSvg: "<svg>full</svg>" });
      const { getByRole } = renderPreview(props);
      expect(getByRole("button", { name: /Toggle all layers/ })).toHaveProperty("disabled", true);
    });

    it("Show All Layers button is enabled on org tab when orgAllLayersSvg is set", () => {
      const props = makeProps({ activeView: "org", orgAllLayersSvg: "<svg>org-full</svg>" });
      const { getByRole } = renderPreview(props);
      expect(getByRole("button", { name: /Toggle all layers/ })).toHaveProperty("disabled", false);
    });

    it("renders iframe with orgAllLayersSvg when isAllLayersOpen=true on org tab", () => {
      const props = makeProps({
        activeView: "org",
        isAllLayersOpen: true,
        orgAllLayersSvg: "<svg>org-full</svg>",
      });
      const { container } = renderPreview(props);
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
      const { getByRole } = renderPreview(props);
      fireEvent.click(getByRole("button", { name: /Toggle all layers/ }));
      expect(onAllLayersToggle).toHaveBeenCalled();
    });

    it("renders iframe when isAllLayersOpen=true and allLayersSvg is set", () => {
      const props = makeProps({
        activeView: "system",
        isAllLayersOpen: true,
        allLayersSvg: "<svg>full</svg>",
      });
      const { container } = renderPreview(props);
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
      const { container } = renderPreview(props);
      expect(container.querySelector("iframe")).toBeNull();
    });
  });

  describe("Focus mode button", () => {
    it("shows Focus button when not in focus mode", () => {
      const props = makeProps({ previewFocused: false });
      const { getByRole } = renderPreview(props);
      const btn = getByRole("button", { name: /Enter focus mode/ });
      expect(btn.textContent).toContain("↗ Focus");
    });

    it("shows Exit Focus button when in focus mode", () => {
      const props = makeProps({ previewFocused: true });
      const { getByRole } = renderPreview(props);
      const btn = getByRole("button", { name: /Exit focus mode/ });
      expect(btn.textContent).toContain("↙ Exit Focus");
    });

    it("calls onPreviewFocusToggle when clicked", () => {
      const onPreviewFocusToggle = vi.fn<() => void>();
      const props = makeProps({ onPreviewFocusToggle });
      const { getByRole } = renderPreview(props);
      fireEvent.click(getByRole("button", { name: /focus mode/ }));
      expect(onPreviewFocusToggle).toHaveBeenCalled();
    });

    it("has active class when previewFocused is true", () => {
      const props = makeProps({ previewFocused: true });
      const { getByRole } = renderPreview(props);
      const btn = getByRole("button", { name: /Exit focus mode/ });
      expect(btn.className).toContain("active");
    });
  });

  describe("Export SVG split button", () => {
    it("renders Export SVG main button and toggle button", () => {
      const props = makeProps({ activeView: "system" });
      const { getByRole } = renderPreview(props);
      expect(getByRole("button", { name: /Export SVG/ })).toBeTruthy();
      expect(getByRole("button", { name: /Export options/ })).toBeTruthy();
    });

    it("Export SVG exports current svg when isAllLayersOpen=false", () => {
      const onExportSvg = vi.fn<() => void>();
      const props = makeProps({ activeView: "system", isAllLayersOpen: false, onExportSvg });
      const { getByRole } = renderPreview(props);
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
      const { getByRole } = renderPreview(props);
      fireEvent.click(getByRole("button", { name: /Export SVG/ }));
      expect(onExportSvg).toHaveBeenCalledWith(allLayersSvg, expect.stringContaining("all-layers"));
    });

    it("clicking toggle button opens export options menu with drill-down item", () => {
      const props = makeProps({ activeView: "system" });
      const { getByRole, getByText } = renderPreview(props);
      fireEvent.click(getByRole("button", { name: /Export options/ }));
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
      const { getByRole, getByText } = renderPreview(props);
      fireEvent.click(getByRole("button", { name: /Export options/ }));
      fireEvent.click(getByText("Export Drill-down SVG"));
      expect(onExportSvg).toHaveBeenCalledWith(drillDownSvg, expect.stringContaining("drilldown"));
    });

    it("Export Drill-down SVG is disabled on deploy tab", () => {
      const props = makeProps({
        activeView: "deploy",
        drillDownSvg: "<svg>drilldown</svg>",
      });
      const { getByRole, getByText } = renderPreview(props);
      fireEvent.click(getByRole("button", { name: /Export options/ }));
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
      const { getByRole, getByText } = renderPreview(props);
      fireEvent.click(getByRole("button", { name: /Export options/ }));
      fireEvent.click(getByText("Export Drill-down SVG"));
      expect(onExportSvg).toHaveBeenCalledWith(
        orgDrillDownSvg,
        expect.stringContaining("drilldown"),
      );
    });

    it("Export All Diagrams SVG is disabled when allViewsSvg is undefined", () => {
      const props = makeProps({ activeView: "system", allViewsSvg: undefined });
      const { getByRole, getByText } = renderPreview(props);
      fireEvent.click(getByRole("button", { name: /Export options/ }));
      expect(getByText("Export All Diagrams SVG").closest("button")).toHaveProperty(
        "disabled",
        true,
      );
    });

    it("Export All Diagrams SVG calls onExportSvg with all-diagrams.svg filename", () => {
      const onExportSvg = vi.fn<() => void>();
      const allViewsSvg = "<svg>all-views</svg>";
      const props = makeProps({ activeView: "system", allViewsSvg, onExportSvg });
      const { getByRole, getByText } = renderPreview(props);
      fireEvent.click(getByRole("button", { name: /Export options/ }));
      fireEvent.click(getByText("Export All Diagrams SVG"));
      expect(onExportSvg).toHaveBeenCalledWith(allViewsSvg, "all-diagrams.svg");
    });

    it("Export draw.io menu item is disabled when no onExportDrawio is wired", () => {
      const props = makeProps({ activeView: "system", onExportDrawio: undefined });
      const { getByRole, getByText } = renderPreview(props);
      fireEvent.click(getByRole("button", { name: /Export options/ }));
      expect(getByText("Export draw.io (mxGraph XML)").closest("button")).toHaveProperty(
        "disabled",
        true,
      );
    });

    it("Export draw.io menu item calls onExportDrawio with a .drawio filename", () => {
      const onExportDrawio = vi
        .fn<(filename: string) => Promise<void>>()
        .mockResolvedValue(undefined);
      const props = makeProps({ activeView: "system", onExportDrawio });
      const { getByRole, getByText } = renderPreview(props);
      fireEvent.click(getByRole("button", { name: /Export options/ }));
      fireEvent.click(getByText("Export draw.io (mxGraph XML)"));
      expect(onExportDrawio).toHaveBeenCalledWith(expect.stringMatching(/\.drawio$/));
    });

    it("surfaces draw.io export failures in an inline error banner", async () => {
      const onExportDrawio = vi
        .fn<(filename: string) => Promise<void>>()
        .mockRejectedValue(new Error("disk full"));
      const props = makeProps({ activeView: "system", onExportDrawio });
      const { getByRole, getByText, findByRole, queryByRole } = renderPreview(props);
      fireEvent.click(getByRole("button", { name: /Export options/ }));
      fireEvent.click(getByText("Export draw.io (mxGraph XML)"));
      const banner = await findByRole("alert");
      expect(banner.textContent).toContain("disk full");
      // Dismiss button wipes the banner immediately.
      fireEvent.click(getByRole("button", { name: /Dismiss/ }));
      expect(queryByRole("alert")).toBeNull();
    });
  });

  describe("Open All Views button", () => {
    it("shows Open All Views button", () => {
      const props = makeProps();
      const { getByRole } = renderPreview(props);
      expect(getByRole("button", { name: /Open all views in new window/ })).toBeTruthy();
    });

    it("is disabled when allViewsSvg is undefined", () => {
      const props = makeProps({ allViewsSvg: undefined });
      const { getByRole } = renderPreview(props);
      expect(getByRole("button", { name: /Open all views in new window/ })).toHaveProperty(
        "disabled",
        true,
      );
    });

    it("is enabled when allViewsSvg is set", () => {
      const props = makeProps({ allViewsSvg: "<svg>all-views</svg>" });
      const { getByRole } = renderPreview(props);
      expect(getByRole("button", { name: /Open all views in new window/ })).toHaveProperty(
        "disabled",
        false,
      );
    });

    it("calls window.open with a blob URL when clicked", () => {
      const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
      const props = makeProps({ allViewsSvg: "<svg>all-views</svg>" });
      const { getByRole } = renderPreview(props);
      fireEvent.click(getByRole("button", { name: /Open all views in new window/ }));
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(openSpy).toHaveBeenCalledWith("blob:mock-url", "_blank");
      openSpy.mockRestore();
    });

    it("does not call window.open when allViewsSvg is undefined", () => {
      const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
      const props = makeProps({ allViewsSvg: undefined });
      const { getByRole } = renderPreview(props);
      // button is disabled, but verify open is not called even if handler fires
      getByRole("button", { name: /Open all views in new window/ });
      expect(openSpy).not.toHaveBeenCalled();
      openSpy.mockRestore();
    });
  });

  describe("matrix tab", () => {
    it("exposes a CRUD tab in the diagram tab bar", () => {
      const props = makeProps();
      const { getByRole } = renderPreview(props);
      expect(getByRole("tab", { name: /CRUD/ })).toBeTruthy();
    });

    it("renders the CRUD matrix panel when activeView is matrix", () => {
      const props = makeProps({ activeView: "matrix" });
      const { container } = renderPreview(props);
      expect(container.querySelector(".crud-matrix-panel")).toBeTruthy();
      // Toolbar (Icon Mode etc.) is hidden in matrix mode
      expect(container.querySelector(".preview-toolbar")).toBeNull();
    });
  });
});
