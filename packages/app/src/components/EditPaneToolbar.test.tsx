// @vitest-environment jsdom
import type React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, fireEvent, cleanup } from "@testing-library/react";
import { TooltipProvider } from "./ui/tooltip.js";

afterEach(cleanup);

import { EditPaneToolbar } from "./EditPaneToolbar.js";

// shadcn migration (#1368): Radix Tooltip primitives require a Provider
// in the ancestor tree. Wrap every render so the existing assertions
// keep working unchanged.
function render(ui: React.ReactElement) {
  return rtlRender(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("EditPaneToolbar", () => {
  it("renders Format button on editor tab when onFormat is provided", () => {
    const { getByRole } = render(
      <EditPaneToolbar activeTab="editor" onFormat={vi.fn<() => void>()} />,
    );
    expect(getByRole("button", { name: /Format/ })).toBeTruthy();
  });

  it("renders nothing on chat tab", () => {
    const { queryByRole } = render(
      <EditPaneToolbar activeTab="chat" onFormat={vi.fn<() => void>()} />,
    );
    expect(queryByRole("button")).toBeNull();
  });

  it("renders nothing on settings tab", () => {
    const { queryByRole } = render(
      <EditPaneToolbar activeTab="settings" onFormat={vi.fn<() => void>()} />,
    );
    expect(queryByRole("button")).toBeNull();
  });

  it("renders nothing on editor tab when onFormat is not provided", () => {
    const { queryByRole } = render(<EditPaneToolbar activeTab="editor" />);
    expect(queryByRole("button")).toBeNull();
  });

  it("Format button is disabled when hasParseErrors is true", () => {
    const { getByRole } = render(
      <EditPaneToolbar activeTab="editor" onFormat={vi.fn<() => void>()} hasParseErrors />,
    );
    expect((getByRole("button", { name: /Format/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Format button is enabled when hasParseErrors is false", () => {
    const { getByRole } = render(
      <EditPaneToolbar activeTab="editor" onFormat={vi.fn<() => void>()} hasParseErrors={false} />,
    );
    expect((getByRole("button", { name: /Format/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("clicking Format button calls onFormat", () => {
    const onFormat = vi.fn<() => void>();
    const { getByRole } = render(<EditPaneToolbar activeTab="editor" onFormat={onFormat} />);
    fireEvent.click(getByRole("button", { name: /Format/ }));
    expect(onFormat).toHaveBeenCalledOnce();
  });

  it("renders Tidy button on editor tab when onTidyStyle is provided", () => {
    const { getByRole } = render(
      <EditPaneToolbar activeTab="editor" onTidyStyle={vi.fn<() => void>()} />,
    );
    expect(getByRole("button", { name: /Tidy/ })).toBeTruthy();
  });

  it("does not render Tidy button when onTidyStyle is not provided", () => {
    const { queryByRole } = render(
      <EditPaneToolbar activeTab="editor" onFormat={vi.fn<() => void>()} />,
    );
    expect(queryByRole("button", { name: /Tidy/ })).toBeNull();
  });

  it("clicking Tidy button calls onTidyStyle", () => {
    const onTidyStyle = vi.fn<() => void>();
    const { getByRole } = render(<EditPaneToolbar activeTab="editor" onTidyStyle={onTidyStyle} />);
    fireEvent.click(getByRole("button", { name: /Tidy/ }));
    expect(onTidyStyle).toHaveBeenCalledOnce();
  });

  it("renders both Format and Tidy when both callbacks are provided", () => {
    const { getByRole } = render(
      <EditPaneToolbar
        activeTab="editor"
        onFormat={vi.fn<() => void>()}
        onTidyStyle={vi.fn<() => void>()}
      />,
    );
    expect(getByRole("button", { name: /Format/ })).toBeTruthy();
    expect(getByRole("button", { name: /Tidy/ })).toBeTruthy();
  });
});
