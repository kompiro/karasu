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
    isFullView: false,
    onFullViewToggle: vi.fn(),
    multiLevelSvg: null,
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

  describe("hasDeployDiagram=false", () => {
    it("renders Deploy tab as disabled", () => {
      const props = makeProps({ hasDeployDiagram: false });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      expect(getByRole("tab", { name: /Deploy/ })).toHaveProperty("ariaDisabled", "true");
    });
  });

  describe("Full View toggle", () => {
    it("shows Full View button in system view", () => {
      const props = makeProps({ activeView: "system" });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      expect(getByRole("button", { name: /Toggle full view/ })).toBeTruthy();
    });

    it("shows Full View button in org view", () => {
      const props = makeProps({ activeView: "org" });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      expect(getByRole("button", { name: /Toggle full view/ })).toBeTruthy();
    });

    it("hides Full View button in deploy view", () => {
      const props = makeProps({ activeView: "deploy" });
      const { queryByRole } = render(<KarasuPreviewColumn {...props} />);
      expect(queryByRole("button", { name: /Toggle full view/ })).toBeNull();
    });

    it("calls onFullViewToggle when Full View button is clicked", () => {
      const onFullViewToggle = vi.fn();
      const props = makeProps({ activeView: "system", onFullViewToggle });
      const { getByRole } = render(<KarasuPreviewColumn {...props} />);
      fireEvent.click(getByRole("button", { name: /Toggle full view/ }));
      expect(onFullViewToggle).toHaveBeenCalledOnce();
    });

    it("renders iframe when isFullView=true and multiLevelSvg is provided", () => {
      const multiLevelSvg = "<!DOCTYPE html><html><body><svg></svg></body></html>";
      const props = makeProps({ activeView: "system", isFullView: true, multiLevelSvg });
      const { container } = render(<KarasuPreviewColumn {...props} />);
      expect(container.querySelector("iframe")).toBeTruthy();
    });

    it("renders PreviewPane (not iframe) when isFullView=false", () => {
      const props = makeProps({ activeView: "system", isFullView: false });
      const { container } = render(<KarasuPreviewColumn {...props} />);
      expect(container.querySelector("iframe")).toBeNull();
      expect(container.querySelector(".preview-container")).toBeTruthy();
    });

    it("renders PreviewPane (not iframe) when isFullView=true but multiLevelSvg is null", () => {
      const props = makeProps({ activeView: "system", isFullView: true, multiLevelSvg: null });
      const { container } = render(<KarasuPreviewColumn {...props} />);
      expect(container.querySelector("iframe")).toBeNull();
      expect(container.querySelector(".preview-container")).toBeTruthy();
    });

    it("hides BreadcrumbBar when isFullView=true", () => {
      const props = makeProps({
        activeView: "system",
        isFullView: true,
        multiLevelSvg: "<!DOCTYPE html><html><body></body></html>",
      });
      const { queryByText } = render(<KarasuPreviewColumn {...props} />);
      expect(queryByText("Root")).toBeNull();
    });
  });
});
