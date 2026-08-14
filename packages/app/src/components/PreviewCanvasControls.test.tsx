// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactElement } from "react";
import { PreviewColumn } from "./PreviewColumn.js";
import { PreviewProvider, type PreviewContextValue } from "../state/preview-context.js";
import { LocaleProvider } from "../i18n/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The preview's controls live on two surfaces since #2317: the toolbar strip
// keeps what takes the diagram elsewhere, and this bar — floating over the
// canvas — keeps what changes the diagram. The split is what stops the toolbar
// wrapping to a second row, so what is fenced here is the split itself: which
// control is on which surface, that moving them kept their a11y contract
// (TPL-1399) and both toggle states (TPL-1402), and that the bar cannot spill
// out of a narrow column or float at an arbitrary stacking order (TPL-1468).

afterEach(cleanup);

const noop = (): void => {};

function render(ui: ReactElement) {
  return rtlRender(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);
}

function renderPreview(
  overrides: Partial<PreviewContextValue> = {},
  systemOverrides: Record<string, unknown> = {},
) {
  const value = {
    activeView: "system" as const,
    hasDeployDiagram: false,
    onActiveViewChange: vi.fn<() => void>(),
    displayMode: "shape" as const,
    onDisplayModeChange: vi.fn<() => void>(),
    onExportSvg: vi.fn<() => void>(),
    isAllLayersOpen: false,
    onAllLayersToggle: vi.fn<() => void>(),
    previewFocused: false,
    onPreviewFocusToggle: vi.fn<() => void>(),
    isOrgTreeViewOpen: false,
    onOrgTreeViewToggle: vi.fn<() => void>(),
    isEntityViewOpen: false,
    onEntityViewToggle: vi.fn<() => void>(),
    hasEntityView: false,
    hasKrsSource: true,
    systemView: {
      svg: "<svg></svg>",
      diagnostics: [],
      viewPath: [],
      breadcrumbItems: [{ id: "root", label: "Root" }],
      warnings: [],
      onBreadcrumbNavigate: noop,
      systems: [],
      groupBy: "none" as const,
      onGroupByChange: vi.fn<() => void>(),
      hasTeamAxis: false,
      hasBoundaryAxis: false,
      anyCollapsible: false,
      allCollapsed: false,
      allLayersSvg: "<svg>all-layers</svg>",
      facets: [],
      selectedFacets: [] as readonly string[],
      onFacetToggle: vi.fn<() => void>(),
      ...systemOverrides,
    },
    deployView: {
      svg: "<svg></svg>",
      diagnostics: [],
      warnings: [],
      highlightedNodeId: null,
      onClearHighlight: noop,
      onContainerClick: vi.fn<() => void>(),
    },
    orgView: {
      svg: "<svg></svg>",
      diagnostics: [],
      viewPath: [] as string[],
      breadcrumbItems: [{ id: "__org__", label: "Org" }],
      warnings: [],
      onBreadcrumbNavigate: noop,
    },
    ...overrides,
  } as unknown as PreviewContextValue;
  const { container } = render(
    <PreviewProvider value={value}>
      <PreviewColumn />
    </PreviewProvider>,
  );
  return {
    bar: container.querySelector(".preview-canvas-controls") as HTMLElement,
    toolbar: container.querySelector(".preview-toolbar") as HTMLElement,
  };
}

function styleRule(file: string, selector: string): string {
  const css = readFileSync(resolve(__dirname, `../styles/${file}`), "utf8");
  const rule = css.slice(css.indexOf(`${selector} {`));
  return rule.slice(0, rule.indexOf("}"));
}

describe("PreviewCanvasControls — which surface a control lives on", () => {
  it("keeps the controls that change the diagram on the canvas bar", () => {
    const { bar } = renderPreview({ hasEntityView: true } as Partial<PreviewContextValue>, {
      anyCollapsible: true,
    });
    const labels = Array.from(bar.querySelectorAll("[aria-label]")).map((el) =>
      el.getAttribute("aria-label"),
    );
    expect(labels).toContain("Toggle icon mode");
    expect(labels).toContain("Toggle entity view");
    expect(labels).toContain("Toggle all layers");
    // Show All Layers reads like an export but swaps the drawn diagram, so it
    // is on this side — the rule is what the control does, not what it sounds
    // like.
    expect(bar.textContent).toContain("Show All Layers");
  });

  it("keeps the controls that take the diagram elsewhere in the toolbar", () => {
    const { toolbar, bar } = renderPreview();
    expect(toolbar.textContent).toContain("Export SVG");
    expect(toolbar.textContent).toContain("Share");
    expect(toolbar.textContent).toContain("Docs");
    expect(toolbar.textContent).toContain("Focus");
    // …and none of them leaked onto the canvas bar.
    expect(bar.textContent).not.toContain("Export SVG");
    expect(bar.textContent).not.toContain("Share");
  });

  it("renders the Group-by selector on the bar only when the model has an axis", () => {
    const withoutAxis = renderPreview();
    expect(withoutAxis.bar.querySelector("#group-by-select")).toBeNull();
    cleanup();

    const { bar } = renderPreview({}, { hasBoundaryAxis: true });
    expect(bar.querySelector("#group-by-select")).not.toBeNull();
  });
});

describe("PreviewCanvasControls — contracts the move must not drop", () => {
  it("keeps aria-pressed on the toggles it carries, in both states (TPL-1399, TPL-1402)", () => {
    const off = renderPreview();
    const iconMode = off.bar.querySelector('[aria-label="Toggle icon mode"]');
    expect(iconMode?.getAttribute("aria-pressed")).toBe("false");
    cleanup();

    const on = renderPreview({ displayMode: "icon" } as Partial<PreviewContextValue>);
    expect(
      on.bar.querySelector('[aria-label="Toggle icon mode"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("still calls the handler the toolbar used to call", () => {
    const onDisplayModeChange = vi.fn<() => void>();
    const { bar } = renderPreview({ onDisplayModeChange } as Partial<PreviewContextValue>);
    fireEvent.click(bar.querySelector('[aria-label="Toggle icon mode"]') as HTMLElement);
    expect(onDisplayModeChange).toHaveBeenCalledWith("icon");
  });

  it("disables Show All Layers on the deploy view, as the toolbar did", () => {
    const { bar } = renderPreview({ activeView: "deploy" } as Partial<PreviewContextValue>);
    expect(bar.querySelector('[aria-label="Toggle all layers"]')).toHaveProperty("disabled", true);
  });

  it("is absent on the matrix view, where the toolbar is absent too", () => {
    const { bar, toolbar } = renderPreview({
      activeView: "matrix",
    } as Partial<PreviewContextValue>);
    expect(bar).toBeNull();
    expect(toolbar).toBeNull();
  });
});

describe("PreviewCanvasControls — how it floats", () => {
  it("anchors below the toolbar's bottom edge, not its height", () => {
    // The height alone leaves out the diagram tab bar above the toolbar, which
    // is how the facet overview panel came to overlap the toolbar (#2492).
    const rule = styleRule("components/preview.css", ".preview-canvas-controls");
    expect(rule).toContain("var(--preview-toolbar-bottom");
  });

  it("takes its stacking order from the documented scale (TPL-1468)", () => {
    const rule = styleRule("components/preview.css", ".preview-canvas-controls");
    const zIndex = rule.match(/z-index:\s*var\((--[\w-]+)\)/);
    expect(zIndex).not.toBeNull();
    const tokens = readFileSync(resolve(__dirname, "../styles/tokens.css"), "utf8");
    expect(tokens).toContain(`${zIndex![1]}:`);
  });

  it("wraps inside the column instead of spilling out of it on a narrow window", () => {
    // Measured on the spike: without these the absolutely positioned bar keeps
    // its natural width (549px for the system view in ja), overflows a 512px
    // column and stacks the Group-by label one character per line.
    const rule = styleRule("components/preview.css", ".preview-canvas-controls");
    expect(rule).toContain("flex-wrap: wrap");
    expect(rule).toContain("max-width: calc(100% - 24px)");
  });

  it("is opaque, so the diagram cannot show through its labels", () => {
    const rule = styleRule("components/preview.css", ".preview-canvas-controls");
    const background = rule.match(/background:\s*var\((--[\w-]+)\)/);
    expect(background).not.toBeNull();
    const themes = readFileSync(resolve(__dirname, "../styles/themes.css"), "utf8");
    expect(themes).toContain(`${background![1]}:`);
  });
});
