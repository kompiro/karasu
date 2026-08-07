// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
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

// The derived membership overview (#2177) — the audit surface the design owes
// for writing membership element-side. Reached from the Facets menu, because
// that is where someone asking "what is in PCI scope?" already is.
const OVERVIEW = [
  {
    id: "pii",
    label: "Personal data",
    description: "Holds data identifying a natural person",
    links: [{ url: "https://example.com/gdpr", label: "GDPR" }],
    declared: true,
    members: [
      { id: "Accounts", label: "Accounts", kind: "service", path: ["Shop"] },
      { id: "Payment", kind: "domain", path: ["Shop", "Web"] },
      { id: "Payment", kind: "domain", path: ["Shop", "Api"] },
    ],
  },
  {
    id: "pcl",
    links: [],
    declared: false,
    members: [{ id: "Checkout", kind: "service", path: ["Shop"] }],
  },
];

async function openOverview(overrides: Record<string, unknown> = {}) {
  const user = userEvent.setup();
  const result = renderToolbar({ facetOverview: OVERVIEW, ...overrides });
  await user.click(screen.getByRole("button", { name: /facets/i }));
  await user.click(await screen.findByRole("menuitem", { name: /Membership overview/ }));
  return { user, ...result };
}

describe("Facet membership overview (#2177)", () => {
  it("opens from the Facets menu and lists each facet with its member count", async () => {
    await openOverview();
    const panel = screen.getByRole("dialog", { name: /Facet membership/ });
    expect(panel.textContent).toContain("Personal data");
    expect(panel.textContent).toContain("3 elements");
    expect(panel.textContent).toContain("1 element");
  });

  it("says the list is derived, so nobody looks for a place to author it", async () => {
    await openOverview();
    expect(screen.getByRole("dialog", { name: /Facet membership/ }).textContent).toMatch(
      /derived/i,
    );
  });

  it("shows two same-named nodes as two rows, told apart by their path", async () => {
    // The property `buildFacetOverview` walks declaration sites for
    // (TPL-1352). If the panel keyed on the bare id, React would drop one of
    // the two `Payment` rows and the audit list would silently be short.
    await openOverview();
    const panel = screen.getByRole("dialog", { name: /Facet membership/ });
    const rows = panel.querySelectorAll(".facet-overview-member");
    expect(rows).toHaveLength(4);
    const paths = Array.from(panel.querySelectorAll(".facet-overview-member-path")).map(
      (el) => el.textContent,
    );
    expect(paths).toContain("Shop › Web");
    expect(paths).toContain("Shop › Api");
  });

  it("marks a referenced-but-undeclared facet without repeating the diagnostic", async () => {
    // `facet-not-declared` already reports it where the reference is written.
    // The panel notes the state; it does not re-explain the fix.
    await openOverview();
    expect(screen.getByRole("dialog", { name: /Facet membership/ }).textContent).toContain(
      "Referenced but never declared",
    );
  });

  it("links out to the declared policy document", async () => {
    await openOverview();
    const link = screen
      .getByRole("dialog", { name: /Facet membership/ })
      .querySelector("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://example.com/gdpr");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("toggles the overlay from a facet's name, so the list can drive the diagram", async () => {
    const { user, onFacetToggle } = await openOverview();
    await user.click(screen.getByRole("button", { name: "Personal data" }));
    expect(onFacetToggle).toHaveBeenCalledWith("pii");
  });

  it("closes", async () => {
    const { user } = await openOverview();
    await user.click(screen.getByRole("button", { name: /Close the facet overview/ }));
    expect(screen.queryByRole("dialog", { name: /Facet membership/ })).toBeNull();
  });

  it("offers no overview entry for a model with no facets", async () => {
    // The whole Facets control is already hidden then; this pins that the
    // overview did not sneak in as a second entry point.
    renderToolbar({ facets: [], facetOverview: [] });
    expect(screen.queryByRole("button", { name: /facets/i })).toBeNull();
  });
});

// The panel floats over the diagram, so two things decide whether it is usable:
// it must be opaque, and it must be movable when it lands on something you
// wanted to read. The first shipped broken — `background: var(--bg-panel)` named
// a token that was never defined, and an invalid `var()` computes to transparent
// rather than falling back, so the diagram and the toolbar showed through the
// text (reported from a screenshot, not caught by any test).
describe("Facet membership overview — placement (#2177)", () => {
  it("is styled from a background token that actually exists", () => {
    // Reads the stylesheet rather than the rendered node: jsdom does not apply
    // the app's CSS, so a computed-style assertion would pass no matter what.
    // The failure mode is a *typo'd token name*, which is visible in the source.
    const css = readFileSync(resolve(__dirname, "../styles/components/panels.css"), "utf8");
    const rule = css.slice(css.indexOf(".facet-overview-panel {"));
    const background = rule.slice(0, rule.indexOf("}")).match(/background:\s*var\((--[\w-]+)\)/);
    expect(background).not.toBeNull();

    const themes = readFileSync(resolve(__dirname, "../styles/themes.css"), "utf8");
    expect(themes).toContain(`${background![1]}:`);
  });

  it("positions itself below the toolbar however many rows it wraps to", () => {
    // A constant offset was wrong in the common case — the toolbar wraps to two
    // rows at ordinary widths (#2317), and the panel covered the second row.
    const css = readFileSync(resolve(__dirname, "../styles/components/panels.css"), "utf8");
    const rule = css.slice(css.indexOf(".facet-overview-panel {"));
    expect(rule.slice(0, rule.indexOf("}"))).toContain("var(--preview-toolbar-h");
  });

  it("moves when the header is dragged, and stops when released", async () => {
    await openOverview();
    const panel = screen.getByRole("dialog", { name: /Facet membership/ }) as HTMLElement;
    const header = panel.querySelector(".facet-overview-header") as HTMLElement;

    // jsdom reports zero-size rects, so this asserts the wiring (inline
    // coordinates replace the CSS corner, and `right` is cleared so `left`
    // alone positions it) rather than the pixel arithmetic.
    expect(panel.style.left).toBe("");

    header.setPointerCapture = vi.fn<(pointerId: number) => void>();
    header.hasPointerCapture = vi.fn<(pointerId: number) => boolean>(() => true);
    header.releasePointerCapture = vi.fn<(pointerId: number) => void>();

    fireEvent.pointerDown(header, { clientX: 100, clientY: 100, pointerId: 1 });
    expect(panel.classList.contains("facet-overview-panel--dragging")).toBe(true);

    fireEvent.pointerMove(header, { clientX: 160, clientY: 180, pointerId: 1 });
    expect(panel.style.right).toBe("auto");
    expect(panel.style.left).not.toBe("");

    fireEvent.pointerUp(header, { pointerId: 1 });
    expect(panel.classList.contains("facet-overview-panel--dragging")).toBe(false);
  });

  it("does not start a drag from the close button", async () => {
    // The header is the drag handle and the close button lives inside it, so
    // without the guard closing the panel would begin a gesture instead.
    await openOverview();
    const panel = screen.getByRole("dialog", { name: /Facet membership/ }) as HTMLElement;
    const close = screen.getByRole("button", { name: /Close the facet overview/ });

    fireEvent.pointerDown(close, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(panel.classList.contains("facet-overview-panel--dragging")).toBe(false);
  });
});
