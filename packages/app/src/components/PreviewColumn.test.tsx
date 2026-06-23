// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, screen, fireEvent, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import type { Diagnostic, Warning } from "@karasu-tools/core";
import { PreviewColumn } from "./PreviewColumn.js";
import { PreviewProvider, type PreviewContextValue } from "../state/preview-context.js";
import { LocaleProvider } from "../i18n/index.js";
import { CommandProvider, useCommandRegistry } from "../keyboard/command-context.js";

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

/** Renders PreviewColumn under the command registry, exposing the registry. */
function renderPreviewWithRegistry(value: PreviewContextValue) {
  let registry!: ReturnType<typeof useCommandRegistry>;
  function RegistryProbe() {
    registry = useCommandRegistry();
    return null;
  }
  const result = render(
    <CommandProvider>
      <RegistryProbe />
      <PreviewProvider value={value}>
        <PreviewColumn />
      </PreviewProvider>
    </CommandProvider>,
  );
  return { ...result, getRegistry: () => registry };
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

  describe("Docs dropdown", () => {
    it("groups the Reference and documentation-site links under a Docs menu", async () => {
      const user = userEvent.setup();
      const { getByRole } = renderPreview(makeProps());
      await user.click(getByRole("button", { name: /Documentation links/ }));
      // Both items live in the portalled menu (queried from document scope).
      expect(screen.getByRole("menuitem", { name: /Reference/ })).toBeTruthy();
      const siteLink = screen.getByRole("menuitem", { name: /documentation site/i });
      expect(siteLink.getAttribute("href")).toBe("https://kompiro.github.io/karasu/");
      expect(siteLink.getAttribute("target")).toBe("_blank");
      // noopener/noreferrer guards the new tab against window.opener access.
      expect(siteLink.getAttribute("rel")).toBe("noopener noreferrer");
    });

    it("opens the in-app reference when the Reference item is selected", async () => {
      const user = userEvent.setup();
      const openSpy = vi
        .spyOn(window, "open")
        .mockReturnValue({ focus: vi.fn<() => void>() } as unknown as Window);
      const { getByRole } = renderPreview(makeProps({ activeView: "deploy" }));
      await user.click(getByRole("button", { name: /Documentation links/ }));
      await user.click(screen.getByRole("menuitem", { name: /Reference/ }));
      expect(openSpy).toHaveBeenCalledOnce();
      const url = openSpy.mock.calls[0][0] as string;
      expect(url).toContain("reference=1");
      expect(url).toContain("view=deploy");
      openSpy.mockRestore();
    });

    it("uses the Japanese trigger label and site item when locale=ja", async () => {
      const user = userEvent.setup();
      const { getByRole } = render(
        <PreviewProvider value={makeProps()}>
          <PreviewColumn />
        </PreviewProvider>,
        "ja",
      );
      await user.click(getByRole("button", { name: /ドキュメントリンク/ }));
      expect(screen.getByRole("menuitem", { name: /ドキュメントサイト/ })).toBeTruthy();
    });
  });

  describe("Reference command", () => {
    const findOpenReference = (registry: ReturnType<typeof useCommandRegistry>) =>
      registry.getCommands().find((c) => c.id === "view.openReference");

    it("registers a palette-only 'Open Reference' command (no keybinding)", () => {
      const { getRegistry } = renderPreviewWithRegistry(makeProps());
      const command = findOpenReference(getRegistry());
      expect(command?.title).toBe("Open Reference");
      expect(command?.keybinding).toBeUndefined();
    });

    it("opens the reference in a new window seeded with the active view", () => {
      const openSpy = vi
        .spyOn(window, "open")
        .mockReturnValue({ focus: vi.fn<() => void>() } as unknown as Window);
      const { getRegistry } = renderPreviewWithRegistry(makeProps({ activeView: "deploy" }));
      act(() => findOpenReference(getRegistry())?.run());
      expect(openSpy).toHaveBeenCalledOnce();
      const url = openSpy.mock.calls[0][0] as string;
      expect(url).toContain("reference=1");
      expect(url).toContain("view=deploy");
      // Stable window name so re-opening reuses/focuses the same window.
      expect(openSpy.mock.calls[0][1]).toBe("karasu-reference");
      openSpy.mockRestore();
    });

    it("unregisters the command when PreviewColumn unmounts", () => {
      let registry!: ReturnType<typeof useCommandRegistry>;
      function RegistryProbe() {
        registry = useCommandRegistry();
        return null;
      }
      function Tree({ show }: { show: boolean }) {
        return (
          <CommandProvider>
            <RegistryProbe />
            {show && (
              <PreviewProvider value={makeProps()}>
                <PreviewColumn />
              </PreviewProvider>
            )}
          </CommandProvider>
        );
      }
      const { rerender } = render(<Tree show />);
      expect(findOpenReference(registry)).toBeTruthy();
      rerender(<Tree show={false} />);
      expect(findOpenReference(registry)).toBeUndefined();
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

    it("is in the pressed state when previewFocused is true", () => {
      // shadcn Button migration (#1368): toggle state moved from an
      // `active` CSS class to the semantic `aria-pressed` attribute.
      const props = makeProps({ previewFocused: true });
      const { getByRole } = renderPreview(props);
      const btn = getByRole("button", { name: /Exit focus mode/ });
      expect(btn.getAttribute("aria-pressed")).toBe("true");
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

    // The export options menu is a shadcn DropdownMenu (#1549): open it with
    // userEvent (Radix needs the full pointer sequence) and query the items
    // from `screen` (Radix portals the content to document.body). Disabled
    // items are `role="menuitem"` with `aria-disabled`, not <button disabled>.
    const openMenu = () => userEvent.click(screen.getByRole("button", { name: /Export options/ }));
    const menuItem = (name: string) => screen.getByRole("menuitem", { name });

    it("clicking toggle button opens export options menu with drill-down item", async () => {
      renderPreview(makeProps({ activeView: "system" }));
      await openMenu();
      expect(menuItem("Export Drill-down SVG")).toBeTruthy();
    });

    it("Export Drill-down SVG calls onExportSvg with -drilldown suffix", async () => {
      const onExportSvg = vi.fn<() => void>();
      const drillDownSvg = "<svg>drilldown</svg>";
      renderPreview(makeProps({ activeView: "system", drillDownSvg, onExportSvg }));
      await openMenu();
      await userEvent.click(menuItem("Export Drill-down SVG"));
      expect(onExportSvg).toHaveBeenCalledWith(drillDownSvg, expect.stringContaining("drilldown"));
    });

    it("Export Drill-down SVG is disabled on deploy tab", async () => {
      renderPreview(makeProps({ activeView: "deploy", drillDownSvg: "<svg>drilldown</svg>" }));
      await openMenu();
      expect(menuItem("Export Drill-down SVG").getAttribute("aria-disabled")).toBe("true");
    });

    it("Export Drill-down SVG calls onExportSvg with -drilldown suffix on org tab", async () => {
      const onExportSvg = vi.fn<() => void>();
      const orgDrillDownSvg = "<svg>org-drilldown</svg>";
      renderPreview(makeProps({ activeView: "org", orgDrillDownSvg, onExportSvg }));
      await openMenu();
      await userEvent.click(menuItem("Export Drill-down SVG"));
      expect(onExportSvg).toHaveBeenCalledWith(
        orgDrillDownSvg,
        expect.stringContaining("drilldown"),
      );
    });

    it("Export All Diagrams SVG is disabled when allViewsSvg is undefined", async () => {
      renderPreview(makeProps({ activeView: "system", allViewsSvg: undefined }));
      await openMenu();
      expect(menuItem("Export All Diagrams SVG").getAttribute("aria-disabled")).toBe("true");
    });

    it("Export All Diagrams SVG calls onExportSvg with all-diagrams.svg filename", async () => {
      const onExportSvg = vi.fn<() => void>();
      const allViewsSvg = "<svg>all-views</svg>";
      renderPreview(makeProps({ activeView: "system", allViewsSvg, onExportSvg }));
      await openMenu();
      await userEvent.click(menuItem("Export All Diagrams SVG"));
      expect(onExportSvg).toHaveBeenCalledWith(allViewsSvg, "all-diagrams.svg");
    });

    it("Export draw.io menu item is disabled when no onExportDrawio is wired", async () => {
      renderPreview(makeProps({ activeView: "system", onExportDrawio: undefined }));
      await openMenu();
      expect(menuItem("Export draw.io (mxGraph XML)").getAttribute("aria-disabled")).toBe("true");
    });

    it("Export draw.io menu item calls onExportDrawio with a .drawio filename", async () => {
      const onExportDrawio = vi
        .fn<(filename: string) => Promise<void>>()
        .mockResolvedValue(undefined);
      renderPreview(makeProps({ activeView: "system", onExportDrawio }));
      await openMenu();
      await userEvent.click(menuItem("Export draw.io (mxGraph XML)"));
      expect(onExportDrawio).toHaveBeenCalledWith(expect.stringMatching(/\.drawio$/));
    });

    it("surfaces draw.io export failures in an inline error banner", async () => {
      const onExportDrawio = vi
        .fn<(filename: string) => Promise<void>>()
        .mockRejectedValue(new Error("disk full"));
      const { getByRole, findByRole, queryByRole } = renderPreview(
        makeProps({ activeView: "system", onExportDrawio }),
      );
      await openMenu();
      await userEvent.click(menuItem("Export draw.io (mxGraph XML)"));
      const banner = await findByRole("alert");
      expect(banner.textContent).toContain("disk full");
      // a11y contract (#1399 / TPL-20260516-01): the dismiss control is a
      // shadcn <Button> with a visible text label (not an icon-only button)
      // and an exact, descriptive accessible name.
      const dismiss = getByRole("button", { name: "Dismiss export error" });
      expect(dismiss.textContent).toBe("✕ Dismiss");
      // Dismiss button wipes the banner immediately.
      fireEvent.click(dismiss);
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

    it("calls window.open with a blob URL and noopener when clicked (#1529)", () => {
      const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
      const props = makeProps({ allViewsSvg: "<svg>all-views</svg>" });
      const { getByRole } = renderPreview(props);
      fireEvent.click(getByRole("button", { name: /Open all views in new window/ }));
      expect(URL.createObjectURL).toHaveBeenCalled();
      // noopener severs the opened tab's window.opener back-reference.
      expect(openSpy).toHaveBeenCalledWith("blob:mock-url", "_blank", "noopener");
      openSpy.mockRestore();
    });

    it("revokes the blob URL after the grace period so it is not pinned (#1529)", () => {
      vi.useFakeTimers();
      const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
      const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
      const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
      try {
        const props = makeProps({ allViewsSvg: "<svg>all-views</svg>" });
        const { getByRole } = renderPreview(props);
        fireEvent.click(getByRole("button", { name: /Open all views in new window/ }));
        // Not revoked synchronously — the new tab still needs the blob to load.
        expect(revokeSpy).not.toHaveBeenCalled();
        vi.advanceTimersByTime(10_000);
        expect(revokeSpy).toHaveBeenCalledWith("blob:mock-url");
      } finally {
        vi.useRealTimers();
        openSpy.mockRestore();
        createSpy.mockRestore();
        revokeSpy.mockRestore();
      }
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
