// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);

import { ChatPane } from "./ChatPane.js";

// Default props to satisfy all required fields (API key set so AI UI is shown)
const defaultProps = {
  scopeLabel: "Root",
  sessionResetKey: null,
  fileContent: "",
  currentFilePath: null,
  apiKey: "sk-test-key",
  onNavigateViewPath: vi.fn<(path: string[]) => void>(),
  onEditorChange: vi.fn<(value: string) => void>(),
  onNavigateToSettings: vi.fn<() => void>(),
};

describe("ChatPane — with API key", () => {
  it("shows the given scopeLabel in the scope indicator", () => {
    const { getByText } = render(<ChatPane {...defaultProps} scopeLabel="Root" />);
    expect(getByText(/📍 Root/)).toBeTruthy();
  });

  it("shows label-based scope indicator", () => {
    const { getByText } = render(
      <ChatPane {...defaultProps} scopeLabel="EC Platform > EC サイト" />,
    );
    expect(getByText(/📍 EC Platform > EC サイト/)).toBeTruthy();
  });

  it("Send button is disabled when input is empty", () => {
    const { getByRole } = render(<ChatPane {...defaultProps} />);
    expect(getByRole("button", { name: /Send/ })).toHaveProperty("disabled", true);
  });

  it("Send button is enabled when input has text", () => {
    const { getByLabelText, getByRole } = render(<ChatPane {...defaultProps} />);
    fireEvent.change(getByLabelText("Chat message input"), { target: { value: "Hi" } });
    expect(getByRole("button", { name: /Send/ })).toHaveProperty("disabled", false);
  });

  it("scope indicator updates when scopeLabel prop changes", () => {
    const { getByText, rerender } = render(<ChatPane {...defaultProps} scopeLabel="システム A" />);
    expect(getByText(/📍 システム A/)).toBeTruthy();

    rerender(<ChatPane {...defaultProps} scopeLabel="システム A > サービス B" />);
    expect(getByText(/📍 システム A > サービス B/)).toBeTruthy();
  });
});

describe("ChatPane — without API key", () => {
  it("shows ApiKeySetup when apiKey is null", () => {
    const onNavigateToSettings = vi.fn<() => void>();
    const { getByRole } = render(
      <ChatPane {...defaultProps} apiKey={null} onNavigateToSettings={onNavigateToSettings} />,
    );
    expect(getByRole("button", { name: /Settings で設定する/ })).toBeTruthy();
  });

  it("clicking Settings button calls onNavigateToSettings", () => {
    const onNavigateToSettings = vi.fn<() => void>();
    const { getByRole } = render(
      <ChatPane {...defaultProps} apiKey={null} onNavigateToSettings={onNavigateToSettings} />,
    );
    fireEvent.click(getByRole("button", { name: /Settings で設定する/ }));
    expect(onNavigateToSettings).toHaveBeenCalledOnce();
  });
});
