// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { LocaleProvider } from "../i18n/index.js";

afterEach(cleanup);
import { DiagramTabBar } from "./DiagramTabBar.js";

function render(ui: ReactElement, initialLocale: "en" | "ja" = "en") {
  return rtlRender(<LocaleProvider initialLocale={initialLocale}>{ui}</LocaleProvider>);
}

function baseProps() {
  return {
    active: "system" as const,
    onChange: vi.fn<() => void>(),
  };
}

describe("DiagramTabBar", () => {
  // shadcn migration (#1368): Radix Tabs.Trigger needs the full pointer-event
  // sequence (pointerdown→pointerup→click) — userEvent dispatches it.

  // Tab buttons contain icon spans (e.g. "⬡System"), so we match by regex.
  // shadcn migration (#1368): start from a non-system active state — Radix
  // Tabs suppresses onValueChange when the clicked tab is already active,
  // whereas the old plain button fired onClick redundantly.
  it("clicking System tab calls onChange('system')", async () => {
    const user = userEvent.setup();
    const props = { ...baseProps(), active: "deploy" as const };
    const { getByRole } = render(<DiagramTabBar {...props} />);
    await user.click(getByRole("tab", { name: /System/ }));
    expect(props.onChange).toHaveBeenCalledWith("system");
  });

  it("clicking Deploy tab calls onChange('deploy')", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    const { getByRole } = render(<DiagramTabBar {...props} />);
    await user.click(getByRole("tab", { name: /Deploy/ }));
    expect(props.onChange).toHaveBeenCalledWith("deploy");
  });

  it("clicking Org tab calls onChange('org')", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    const { getByRole } = render(<DiagramTabBar {...props} />);
    await user.click(getByRole("tab", { name: /Org/ }));
    expect(props.onChange).toHaveBeenCalledWith("org");
  });

  it("Deploy tab is always clickable (even without deploy blocks)", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    const { getByRole } = render(<DiagramTabBar {...props} />);
    const deployTab = getByRole("tab", { name: /Deploy/ });
    expect(deployTab.getAttribute("aria-disabled")).not.toBe("true");
    await user.click(deployTab);
    expect(props.onChange).toHaveBeenCalledWith("deploy");
  });

  it("active tab has aria-selected=true; others have aria-selected=false", () => {
    const props = baseProps(); // active="system"
    const { getAllByRole } = render(<DiagramTabBar {...props} />);
    const [systemTab, deployTab, orgTab] = getAllByRole("tab");
    expect(systemTab.getAttribute("aria-selected")).toBe("true");
    expect(deployTab.getAttribute("aria-selected")).toBe("false");
    expect(orgTab.getAttribute("aria-selected")).toBe("false");
  });

  it("Deploy tab is active when active='deploy'", () => {
    const props = { ...baseProps(), active: "deploy" as const };
    const { getAllByRole } = render(<DiagramTabBar {...props} />);
    const [systemTab, deployTab, orgTab] = getAllByRole("tab");
    expect(systemTab.getAttribute("aria-selected")).toBe("false");
    expect(deployTab.getAttribute("aria-selected")).toBe("true");
    expect(orgTab.getAttribute("aria-selected")).toBe("false");
  });

  it("Org tab is active when active='org'", () => {
    const props = { ...baseProps(), active: "org" as const };
    const { getAllByRole } = render(<DiagramTabBar {...props} />);
    const [systemTab, deployTab, orgTab] = getAllByRole("tab");
    expect(systemTab.getAttribute("aria-selected")).toBe("false");
    expect(deployTab.getAttribute("aria-selected")).toBe("false");
    expect(orgTab.getAttribute("aria-selected")).toBe("true");
  });
});
