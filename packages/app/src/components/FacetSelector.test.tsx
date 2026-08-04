// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { PreviewColumn } from "./PreviewColumn.js";
import { PreviewProvider, type PreviewContextValue } from "../state/preview-context.js";
import { LocaleProvider } from "../i18n/index.js";

// The Facets control (#2174) is the first surface where a reader can act on
// facet membership. Two things are worth fencing here rather than leaving to
// the visual check: the control vanishes entirely for a model with no facets
// (so today's toolbar is unchanged for everyone else), and it is genuinely
// multi-select — Radix closes a DropdownMenu on select by default, which would
// make picking a second facet a two-open affair.

afterEach(cleanup);

const noop = (): void => {};

function render(ui: ReactElement) {
  return rtlRender(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);
}

function renderToolbar(systemOverrides: Record<string, unknown> = {}) {
  const onFacetToggle = vi.fn<(id: string) => void>();
  const value = {
    activeView: "system" as const,
    hasDeployDiagram: false,
    onActiveViewChange: vi.fn<() => void>(),
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
      facets: [{ id: "pii", label: "Personal data" }, { id: "pci" }],
      selectedFacets: [] as readonly string[],
      onFacetToggle,
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
  } as unknown as PreviewContextValue;
  render(
    <PreviewProvider value={value}>
      <PreviewColumn />
    </PreviewProvider>,
  );
  return { onFacetToggle };
}

describe("Facets selector (#2174)", () => {
  it("is absent for a model that declares no facets", () => {
    // A model without facets must see exactly the toolbar it sees today.
    renderToolbar({ facets: [] });
    expect(screen.queryByRole("button", { name: /facets/i })).toBeNull();
  });

  it("shows the control when the model has facets", () => {
    renderToolbar();
    expect(screen.getByRole("button", { name: /facets/i })).toBeTruthy();
  });

  it("reports how many facets are selected", () => {
    renderToolbar({ selectedFacets: ["pii", "pci"] });
    expect(screen.getByRole("button", { name: /facets/i }).textContent).toContain("2");
  });

  it("stays open across selections, so multi-select is one open, many picks", async () => {
    const user = userEvent.setup();
    const { onFacetToggle } = renderToolbar();
    await user.click(screen.getByRole("button", { name: /facets/i }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: /Personal data/ }));
    // Radix would have closed the menu here without the preventDefault in the
    // handler, and the second item would not be reachable.
    await user.click(await screen.findByRole("menuitemcheckbox", { name: /pci/ }));
    expect(onFacetToggle.mock.calls.map((c) => c[0])).toEqual(["pii", "pci"]);
  });

  it("labels an undeclared facet by its id, matching the legend's fallback", async () => {
    const user = userEvent.setup();
    renderToolbar();
    await user.click(screen.getByRole("button", { name: /facets/i }));
    expect(await screen.findByRole("menuitemcheckbox", { name: /pci/ })).toBeTruthy();
  });
});
