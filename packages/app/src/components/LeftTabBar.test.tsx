// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);

import { LeftTabBar } from "./LeftTabBar.js";

describe("LeftTabBar", () => {
  it("clicking Editor tab calls onTabChange('editor')", () => {
    const onTabChange = vi.fn<(tab: "editor" | "chat") => void>();
    const { getByRole } = render(<LeftTabBar activeTab="chat" onTabChange={onTabChange} />);
    fireEvent.click(getByRole("tab", { name: /Editor/ }));
    expect(onTabChange).toHaveBeenCalledWith("editor");
  });

  it("clicking Chat tab calls onTabChange('chat')", () => {
    const onTabChange = vi.fn<(tab: "editor" | "chat") => void>();
    const { getByRole } = render(<LeftTabBar activeTab="editor" onTabChange={onTabChange} />);
    fireEvent.click(getByRole("tab", { name: /Chat/ }));
    expect(onTabChange).toHaveBeenCalledWith("chat");
  });

  it("active tab has aria-selected=true; other has aria-selected=false", () => {
    const { getByRole } = render(
      <LeftTabBar activeTab="editor" onTabChange={vi.fn<() => void>()} />,
    );
    expect(getByRole("tab", { name: /Editor/ }).getAttribute("aria-selected")).toBe("true");
    expect(getByRole("tab", { name: /Chat/ }).getAttribute("aria-selected")).toBe("false");
  });

  it("Chat tab is active when activeTab='chat'", () => {
    const { getByRole } = render(<LeftTabBar activeTab="chat" onTabChange={vi.fn<() => void>()} />);
    expect(getByRole("tab", { name: /Editor/ }).getAttribute("aria-selected")).toBe("false");
    expect(getByRole("tab", { name: /Chat/ }).getAttribute("aria-selected")).toBe("true");
  });
});
