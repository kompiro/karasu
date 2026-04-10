// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);

import { LeftTabBar, type LeftTab } from "./LeftTabBar.js";

describe("LeftTabBar", () => {
  it("clicking Editor tab calls onTabChange('editor')", () => {
    const onTabChange = vi.fn<(tab: LeftTab) => void>();
    const { getByRole } = render(<LeftTabBar activeTab="chat" onTabChange={onTabChange} />);
    fireEvent.click(getByRole("tab", { name: /Editor/ }));
    expect(onTabChange).toHaveBeenCalledWith("editor");
  });

  it("clicking Chat tab calls onTabChange('chat')", () => {
    const onTabChange = vi.fn<(tab: LeftTab) => void>();
    const { getByRole } = render(<LeftTabBar activeTab="editor" onTabChange={onTabChange} />);
    fireEvent.click(getByRole("tab", { name: /Chat/ }));
    expect(onTabChange).toHaveBeenCalledWith("chat");
  });

  it("clicking Settings tab calls onTabChange('settings')", () => {
    const onTabChange = vi.fn<(tab: LeftTab) => void>();
    const { getByRole } = render(<LeftTabBar activeTab="editor" onTabChange={onTabChange} />);
    fireEvent.click(getByRole("tab", { name: /Settings/ }));
    expect(onTabChange).toHaveBeenCalledWith("settings");
  });

  it("active tab has aria-selected=true; others have aria-selected=false", () => {
    const { getByRole } = render(
      <LeftTabBar activeTab="editor" onTabChange={vi.fn<() => void>()} />,
    );
    expect(getByRole("tab", { name: /Editor/ }).getAttribute("aria-selected")).toBe("true");
    expect(getByRole("tab", { name: /Chat/ }).getAttribute("aria-selected")).toBe("false");
    expect(getByRole("tab", { name: /Settings/ }).getAttribute("aria-selected")).toBe("false");
  });

  it("Settings tab is active when activeTab='settings'", () => {
    const { getByRole } = render(
      <LeftTabBar activeTab="settings" onTabChange={vi.fn<() => void>()} />,
    );
    expect(getByRole("tab", { name: /Settings/ }).getAttribute("aria-selected")).toBe("true");
    expect(getByRole("tab", { name: /Editor/ }).getAttribute("aria-selected")).toBe("false");
    expect(getByRole("tab", { name: /Chat/ }).getAttribute("aria-selected")).toBe("false");
  });
});
