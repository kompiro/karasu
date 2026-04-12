// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);

// Mock useChatSession so ChatPane tests focus on UI behavior without real API calls.
// startInterview is a no-op by default (returns an already-resolved promise).
const { mockUseChatSession } = vi.hoisted(() => ({
  mockUseChatSession: vi.fn<(...args: unknown[]) => unknown>(),
}));
vi.mock("../hooks/useChatSession.js", () => ({
  useChatSession: mockUseChatSession,
}));

import { ChatPane } from "./ChatPane.js";

function makeDefaultSession(overrides?: Partial<ReturnType<typeof makeMockSession>>) {
  return makeMockSession(overrides);
}

function makeMockSession(overrides?: object) {
  return {
    messages: [],
    phase: { kind: "idle" } as const,
    sendMessage: vi.fn<(text: string) => Promise<void>>(),
    retryMessage: vi.fn<(id: string) => Promise<void>>(),
    applyPatch: vi.fn<() => Promise<void>>(),
    rejectPatch: vi.fn<() => Promise<void>>(),
    resetSession: vi.fn<() => void>(),
    startInterview: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    ...overrides,
  };
}

// Default props to satisfy all required fields (API key set so AI UI is shown)
const defaultProps = {
  scopeLabel: "Root",
  viewPath: [] as string[],
  sessionResetKey: null,
  fileContent: "",
  currentFilePath: null,
  resolvedSystems: [],
  apiKey: "sk-test-key",
  onNavigateViewPath: vi.fn<(path: string[]) => void>(),
  onEditorChange: vi.fn<(value: string) => void>(),
  onNavigateToSettings: vi.fn<() => void>(),
};

describe("ChatPane — with API key", () => {
  it("shows the given scopeLabel in the scope indicator", () => {
    mockUseChatSession.mockReturnValue(makeDefaultSession());
    const { getByText } = render(<ChatPane {...defaultProps} scopeLabel="Root" />);
    expect(getByText(/📍 Root/)).toBeTruthy();
  });

  it("shows label-based scope indicator", () => {
    mockUseChatSession.mockReturnValue(makeDefaultSession());
    const { getByText } = render(
      <ChatPane {...defaultProps} scopeLabel="EC Platform > EC サイト" />,
    );
    expect(getByText(/📍 EC Platform > EC サイト/)).toBeTruthy();
  });

  it("Send button is disabled when input is empty", () => {
    mockUseChatSession.mockReturnValue(makeDefaultSession());
    const { getByRole } = render(<ChatPane {...defaultProps} />);
    expect(getByRole("button", { name: /Send/ })).toHaveProperty("disabled", true);
  });

  it("Send button is enabled when input has text", () => {
    mockUseChatSession.mockReturnValue(makeDefaultSession());
    const { getByLabelText, getByRole } = render(<ChatPane {...defaultProps} />);
    fireEvent.change(getByLabelText("Chat message input"), { target: { value: "Hi" } });
    expect(getByRole("button", { name: /Send/ })).toHaveProperty("disabled", false);
  });

  it("scope indicator updates when scopeLabel prop changes", () => {
    mockUseChatSession.mockReturnValue(makeDefaultSession());
    const { getByText, rerender } = render(<ChatPane {...defaultProps} scopeLabel="システム A" />);
    expect(getByText(/📍 システム A/)).toBeTruthy();

    mockUseChatSession.mockReturnValue(makeDefaultSession());
    rerender(<ChatPane {...defaultProps} scopeLabel="システム A > サービス B" />);
    expect(getByText(/📍 システム A > サービス B/)).toBeTruthy();
  });

  it("Send button and textarea are disabled while loading", () => {
    mockUseChatSession.mockReturnValue(
      makeDefaultSession({ phase: { kind: "loading" } as unknown as { kind: "idle" } }),
    );
    const { getByRole, getByLabelText } = render(<ChatPane {...defaultProps} />);
    expect(getByRole("button", { name: /Send/ })).toHaveProperty("disabled", true);
    expect(getByLabelText("Chat message input")).toHaveProperty("disabled", true);
  });

  it("calls startInterview on mount when session has no messages", () => {
    const startInterview = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    mockUseChatSession.mockReturnValue(makeDefaultSession({ startInterview }));
    render(<ChatPane {...defaultProps} />);
    expect(startInterview).toHaveBeenCalledOnce();
  });
});

describe("ChatPane — without API key", () => {
  it("shows ApiKeySetup when apiKey is null", () => {
    // No useChatSession call needed — apiKey guard renders before the hook result is used
    mockUseChatSession.mockReturnValue(makeDefaultSession());
    const onNavigateToSettings = vi.fn<() => void>();
    const { getByRole } = render(
      <ChatPane {...defaultProps} apiKey={null} onNavigateToSettings={onNavigateToSettings} />,
    );
    expect(getByRole("button", { name: /Settings で設定する/ })).toBeTruthy();
  });

  it("clicking Settings button calls onNavigateToSettings", () => {
    mockUseChatSession.mockReturnValue(makeDefaultSession());
    const onNavigateToSettings = vi.fn<() => void>();
    const { getByRole } = render(
      <ChatPane {...defaultProps} apiKey={null} onNavigateToSettings={onNavigateToSettings} />,
    );
    fireEvent.click(getByRole("button", { name: /Settings で設定する/ }));
    expect(onNavigateToSettings).toHaveBeenCalledOnce();
  });
});
