// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, fireEvent, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import { LocaleProvider } from "../i18n/index.js";

afterEach(cleanup);

// Wrap every render in a LocaleProvider so ChatPane + ApiKeySetup can
// call useTranslation. Default to English; tests that need Japanese pass
// the locale explicitly. Also wraps rerender so subsequent renders keep
// the provider.
function render(ui: ReactElement, initialLocale: "en" | "ja" = "en") {
  const wrap = (node: ReactElement) => (
    <LocaleProvider initialLocale={initialLocale}>{node}</LocaleProvider>
  );
  const result = rtlRender(wrap(ui));
  return {
    ...result,
    rerender: (next: ReactElement) => result.rerender(wrap(next)),
  };
}

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
    messages: [] as unknown[],
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

  it("shows Start Interview button when session is empty", () => {
    mockUseChatSession.mockReturnValue(makeDefaultSession());
    const { getByRole } = render(<ChatPane {...defaultProps} />);
    expect(getByRole("button", { name: /Start Interview/ })).toBeTruthy();
  });

  it("clicking Start Interview calls startInterview", () => {
    const startInterview = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    mockUseChatSession.mockReturnValue(makeDefaultSession({ startInterview }));
    const { getByRole } = render(<ChatPane {...defaultProps} />);
    fireEvent.click(getByRole("button", { name: /Start Interview/ }));
    expect(startInterview).toHaveBeenCalledOnce();
  });

  it("does not auto-call startInterview on mount", () => {
    const startInterview = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    mockUseChatSession.mockReturnValue(makeDefaultSession({ startInterview }));
    render(<ChatPane {...defaultProps} />);
    expect(startInterview).not.toHaveBeenCalled();
  });

  it("hides Start Interview button when messages exist", () => {
    mockUseChatSession.mockReturnValue(
      makeDefaultSession({
        messages: [{ id: "1", role: "assistant" as const, content: "Hello" }],
      }),
    );
    const { queryByRole } = render(<ChatPane {...defaultProps} />);
    expect(queryByRole("button", { name: /Start Interview/ })).toBeNull();
  });
});

describe("ChatPane — Markdown rendering in assistant messages", () => {
  it("renders bold text in assistant messages", () => {
    mockUseChatSession.mockReturnValue(
      makeDefaultSession({
        messages: [{ id: "1", role: "assistant" as const, content: "**bold text**" }],
      }),
    );
    const { container } = render(<ChatPane {...defaultProps} />);
    expect(container.querySelector("strong")).toBeTruthy();
    expect(container.querySelector("strong")?.textContent).toBe("bold text");
  });

  it("renders code blocks in assistant messages", () => {
    mockUseChatSession.mockReturnValue(
      makeDefaultSession({
        messages: [{ id: "1", role: "assistant" as const, content: "```\nconst x = 1;\n```" }],
      }),
    );
    const { container } = render(<ChatPane {...defaultProps} />);
    expect(container.querySelector("pre")).toBeTruthy();
    expect(container.querySelector("code")).toBeTruthy();
  });

  it("sanitizes XSS in assistant messages", () => {
    mockUseChatSession.mockReturnValue(
      makeDefaultSession({
        messages: [
          { id: "1", role: "assistant" as const, content: '<script>alert("xss")</script>' },
        ],
      }),
    );
    const { container } = render(<ChatPane {...defaultProps} />);
    expect(container.querySelector("script")).toBeNull();
  });

  it("renders user messages as plain text without Markdown processing", () => {
    mockUseChatSession.mockReturnValue(
      makeDefaultSession({
        messages: [{ id: "1", role: "user" as const, content: "**not bold**" }],
      }),
    );
    const { container } = render(<ChatPane {...defaultProps} />);
    expect(container.querySelector("strong")).toBeNull();
    expect(container.textContent).toContain("**not bold**");
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
    expect(getByRole("button", { name: /Configure in Settings/ })).toBeTruthy();
  });

  it("clicking Settings button calls onNavigateToSettings", () => {
    mockUseChatSession.mockReturnValue(makeDefaultSession());
    const onNavigateToSettings = vi.fn<() => void>();
    const { getByRole } = render(
      <ChatPane {...defaultProps} apiKey={null} onNavigateToSettings={onNavigateToSettings} />,
    );
    fireEvent.click(getByRole("button", { name: /Configure in Settings/ }));
    expect(onNavigateToSettings).toHaveBeenCalledOnce();
  });
});

describe("ChatPane — localization (Phase C4)", () => {
  it("renders the empty-state hint and buttons in English", () => {
    mockUseChatSession.mockReturnValue(makeDefaultSession());
    const { getByRole, container } = render(<ChatPane {...defaultProps} />, "en");
    expect(getByRole("button", { name: /▶ Start Interview/ })).toBeTruthy();
    expect(getByRole("button", { name: /🔍 Start Review/ })).toBeTruthy();
    expect(getByRole("button", { name: /↺ New Session/ })).toBeTruthy();
    expect(getByRole("button", { name: /↑ Send/ })).toBeTruthy();
    expect(container.textContent).toContain("Or type freely");
  });

  it("renders the empty-state hint and buttons in Japanese", () => {
    mockUseChatSession.mockReturnValue(makeDefaultSession());
    const { getByRole, container } = render(<ChatPane {...defaultProps} />, "ja");
    expect(getByRole("button", { name: /▶ インタビュー開始/ })).toBeTruthy();
    expect(getByRole("button", { name: /🔍 レビュー開始/ })).toBeTruthy();
    expect(getByRole("button", { name: /↺ 新しい会話/ })).toBeTruthy();
    expect(getByRole("button", { name: /↑ 送信/ })).toBeTruthy();
    expect(container.textContent).toContain("または自由に入力してください");
  });

  it("uses the English ApiKeySetup copy when apiKey is null", () => {
    mockUseChatSession.mockReturnValue(makeDefaultSession());
    const { container } = render(<ChatPane {...defaultProps} apiKey={null} />, "en");
    expect(container.textContent).toContain("A Claude API key is required");
  });

  it("uses the Japanese ApiKeySetup copy when apiKey is null", () => {
    mockUseChatSession.mockReturnValue(makeDefaultSession());
    const { container } = render(<ChatPane {...defaultProps} apiKey={null} />, "ja");
    expect(container.textContent).toContain("AI 機能を使うには Claude API キーが必要です");
  });
});
