// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);

import { LeftPaneToolbar } from "./LeftPaneToolbar.js";

describe("LeftPaneToolbar", () => {
  it("renders Format button on editor tab when onFormat is provided", () => {
    const { getByRole } = render(
      <LeftPaneToolbar activeTab="editor" onFormat={vi.fn<() => void>()} />,
    );
    expect(getByRole("button", { name: /Format/ })).toBeTruthy();
  });

  it("renders nothing on chat tab", () => {
    const { queryByRole } = render(
      <LeftPaneToolbar activeTab="chat" onFormat={vi.fn<() => void>()} />,
    );
    expect(queryByRole("button")).toBeNull();
  });

  it("renders nothing on settings tab", () => {
    const { queryByRole } = render(
      <LeftPaneToolbar activeTab="settings" onFormat={vi.fn<() => void>()} />,
    );
    expect(queryByRole("button")).toBeNull();
  });

  it("renders nothing on editor tab when onFormat is not provided", () => {
    const { queryByRole } = render(<LeftPaneToolbar activeTab="editor" />);
    expect(queryByRole("button")).toBeNull();
  });

  it("Format button is disabled when hasParseErrors is true", () => {
    const { getByRole } = render(
      <LeftPaneToolbar activeTab="editor" onFormat={vi.fn<() => void>()} hasParseErrors />,
    );
    expect((getByRole("button", { name: /Format/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Format button is enabled when hasParseErrors is false", () => {
    const { getByRole } = render(
      <LeftPaneToolbar activeTab="editor" onFormat={vi.fn<() => void>()} hasParseErrors={false} />,
    );
    expect((getByRole("button", { name: /Format/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("clicking Format button calls onFormat", () => {
    const onFormat = vi.fn<() => void>();
    const { getByRole } = render(<LeftPaneToolbar activeTab="editor" onFormat={onFormat} />);
    fireEvent.click(getByRole("button", { name: /Format/ }));
    expect(onFormat).toHaveBeenCalledOnce();
  });
});
