// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import type { Diagnostic, Warning, OrgViewPath } from "@karasu/core";
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
      orgPath: [] as OrgViewPath,
      breadcrumbItems: [{ id: "__org__", label: "Org" }],
      warnings: emptyWarnings,
      onBreadcrumbNavigate: noop,
    },
    nodeMetadata: new Map(),
    onDrillDown: vi.fn(),
    displayMode: "shape" as const,
    onDisplayModeChange: vi.fn(),
    onExportSvg: vi.fn(),
    multiLevelSvg: undefined,
    fullView: false,
    onFullViewChange: vi.fn(),
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

  describe("Full View", () => {
    it("renders Full View button", () => {
      const props = makeProps({ activeView: "system" });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      expect(getByRole("button", { name: /Toggle full view/ })).toBeTruthy();
    });

    it("Full View button is disabled when multiLevelSvg is absent", () => {
      const props = makeProps({ activeView: "system", multiLevelSvg: undefined });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      const btn = getByRole("button", { name: /Toggle full view/ });
      expect(btn).toHaveProperty("disabled", true);
    });

    it("Full View button is disabled on deploy tab even when multiLevelSvg is set", () => {
      const props = makeProps({
        activeView: "deploy",
        multiLevelSvg: "<svg/>",
      });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      const btn = getByRole("button", { name: /Toggle full view/ });
      expect(btn).toHaveProperty("disabled", true);
    });

    it("calls onFullViewChange when Full View button is clicked", () => {
      const onFullViewChange = vi.fn();
      const props = makeProps({
        activeView: "system",
        multiLevelSvg: "<svg/>",
        fullView: false,
        onFullViewChange,
      });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /Toggle full view/ }));
      expect(onFullViewChange).toHaveBeenCalledWith(true);
    });

    it("renders iframe when fullView=true and multiLevelSvg is set", () => {
      const multiLevelSvg = "<svg><style>.krs-view{display:none}</style></svg>";
      const props = makeProps({
        activeView: "system",
        multiLevelSvg,
        fullView: true,
      });
      const { container } = render(<KarasuPreviewColumn {...props} />);
      const iframe = container.querySelector("iframe");
      expect(iframe).toBeTruthy();
      expect(iframe?.getAttribute("srcdoc") ?? iframe?.srcdoc).toBe(multiLevelSvg);
    });

    it("renders PreviewPane (not iframe) when fullView=false", () => {
      const props = makeProps({
        activeView: "system",
        multiLevelSvg: "<svg/>",
        fullView: false,
      });
      const { container } = render(<KarasuPreviewColumn {...props} />);
      expect(container.querySelector("iframe")).toBeNull();
    });

    it("Export SVG uses multiLevelSvg when fullView=true", () => {
      const onExportSvg = vi.fn();
      const multiLevelSvg = "<svg><style>.krs-view{display:none}</style></svg>";
      const props = makeProps({
        activeView: "system",
        multiLevelSvg,
        fullView: true,
        onExportSvg,
      });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /Export SVG/ }));
      expect(onExportSvg).toHaveBeenCalledWith(multiLevelSvg, expect.stringContaining("fullview"));
    });
  });
});
