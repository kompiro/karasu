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
// keeps what takes the diagram elsewhere, and the drill path's row keeps what
// changes the diagram. The split is what stops the toolbar wrapping to a second
// row, so what is fenced here is the split itself: which control is on which
// surface, that moving them kept their a11y contract (TPL-1399) and both toggle
// states (TPL-1402), and that the controls share the breadcrumb's row rather
// than floating over the diagram, where they intercepted clicks meant for the
// node beneath them (TPL-948).

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
    bar: container.querySelector(".preview-view-controls") as HTMLElement,
    toolbar: container.querySelector(".preview-toolbar") as HTMLElement,
    row: container.querySelector(".preview-context-row") as HTMLElement,
  };
}

function styleRule(file: string, selector: string): string {
  const css = readFileSync(resolve(__dirname, `../styles/${file}`), "utf8");
  const rule = css.slice(css.indexOf(`${selector} {`));
  return rule.slice(0, rule.indexOf("}"));
}

describe("PreviewViewControls — which surface a control lives on", () => {
  it("keeps the controls that change the diagram in the drill-path row", () => {
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
    // …and none of them leaked into the view controls.
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

describe("PreviewViewControls — contracts the move must not drop", () => {
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

describe("PreviewViewControls — where the row puts them", () => {
  it("shares the drill path's row instead of floating over the diagram", () => {
    // A floating bar covered the diagram's top-left corner and intercepted
    // clicks meant for the node under it — caught by AT-1513's e2e run, which
    // could no longer click the `ECommerce` node (TPL-948).
    const { row, bar } = renderPreview();
    expect(row).not.toBeNull();
    expect(row.contains(bar)).toBe(true);
    expect(row.querySelector(".breadcrumb")).not.toBeNull();
    const rule = styleRule("components/preview.css", ".preview-context-row");
    expect(rule).not.toContain("position: absolute");
  });

  it("wraps within the row rather than squeezing the drill path", () => {
    const rule = styleRule("components/preview.css", ".preview-context-row");
    expect(rule).toContain("flex-wrap: wrap");
  });

  it("keeps the controls at the right edge with or without a breadcrumb", () => {
    // The deploy view has no breadcrumb; the controls must not slide left.
    const rule = styleRule("components/preview.css", ".preview-view-controls");
    expect(rule).toContain("margin-left: auto");
    const { bar, row } = renderPreview({ activeView: "deploy" } as Partial<PreviewContextValue>);
    expect(row.contains(bar)).toBe(true);
    expect(row.querySelector(".breadcrumb")).toBeNull();
  });
});
