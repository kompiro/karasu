// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

afterEach(cleanup);

import { EditTabBar, type EditTab } from "./EditTabBar.js";

// shadcn migration (#1368): Radix Tabs.Trigger activates on full
// pointerdown→pointerup→click sequences, not on bare fireEvent.click —
// userEvent dispatches the full sequence so tests reflect real usage.

describe("EditTabBar", () => {
  it("clicking Editor tab calls onTabChange('editor')", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn<(tab: EditTab) => void>();
    const { getByRole } = render(<EditTabBar activeTab="chat" onTabChange={onTabChange} />);
    await user.click(getByRole("tab", { name: /Editor/ }));
    expect(onTabChange).toHaveBeenCalledWith("editor");
  });

  it("clicking Chat tab calls onTabChange('chat')", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn<(tab: EditTab) => void>();
    const { getByRole } = render(<EditTabBar activeTab="editor" onTabChange={onTabChange} />);
    await user.click(getByRole("tab", { name: /Chat/ }));
    expect(onTabChange).toHaveBeenCalledWith("chat");
  });

  it("clicking Settings tab calls onTabChange('settings')", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn<(tab: EditTab) => void>();
    const { getByRole } = render(<EditTabBar activeTab="editor" onTabChange={onTabChange} />);
    await user.click(getByRole("tab", { name: /Settings/ }));
    expect(onTabChange).toHaveBeenCalledWith("settings");
  });

  it("active tab has aria-selected=true; others have aria-selected=false", () => {
    const { getByRole } = render(
      <EditTabBar activeTab="editor" onTabChange={vi.fn<() => void>()} />,
    );
    expect(getByRole("tab", { name: /Editor/ }).getAttribute("aria-selected")).toBe("true");
    expect(getByRole("tab", { name: /Chat/ }).getAttribute("aria-selected")).toBe("false");
    expect(getByRole("tab", { name: /Settings/ }).getAttribute("aria-selected")).toBe("false");
  });

  it("Settings tab is active when activeTab='settings'", () => {
    const { getByRole } = render(
      <EditTabBar activeTab="settings" onTabChange={vi.fn<() => void>()} />,
    );
    expect(getByRole("tab", { name: /Settings/ }).getAttribute("aria-selected")).toBe("true");
    expect(getByRole("tab", { name: /Editor/ }).getAttribute("aria-selected")).toBe("false");
    expect(getByRole("tab", { name: /Chat/ }).getAttribute("aria-selected")).toBe("false");
  });
});
