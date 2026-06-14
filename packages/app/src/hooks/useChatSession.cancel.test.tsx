// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { LocaleProvider } from "../i18n/index.js";
import { useChatSession } from "./useChatSession.js";

// Mock the Anthropic SDK so we control when `messages.create` resolves and can
// inspect the request between send and resolve.
type CreateFn = (body: unknown, options?: { signal?: AbortSignal }) => Promise<unknown>;
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn<CreateFn>() }));
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status?: number;
    error?: unknown;
  }
  class Anthropic {
    messages = { create: createMock };
    constructor(_opts: unknown) {
      void _opts;
    }
  }
  return { default: Anthropic, APIError };
});

afterEach(cleanup);
beforeEach(() => createMock.mockReset());

function wrapper({ children }: { children: ReactNode }) {
  return <LocaleProvider initialLocale="en">{children}</LocaleProvider>;
}

function setup() {
  const onNavigateViewPath = vi.fn<(p: string[]) => void>();
  const onEditorChange = vi.fn<(v: string) => void>();
  const { result } = renderHook(
    () =>
      useChatSession({
        fileContent: 'system S { service App { label "App" } }\n',
        currentFilePath: "/index.krs",
        scopeLabel: "Root",
        viewPath: [],
        resolvedSystems: [],
        apiKey: "test-key",
        onNavigateViewPath,
        onEditorChange,
        sessionResetKey: "project-a",
      }),
    { wrapper },
  );
  return { result, onNavigateViewPath, onEditorChange };
}

/** A response that carries assistant text plus a navigate_view tool block. */
const replyWithNavigation = {
  content: [
    { type: "text", text: "Here is the old project's answer." },
    { type: "tool_use", name: "navigate_view", id: "nav-1", input: { path: ["OldSystem"] } },
  ],
};

describe("useChatSession — in-flight cancellation (#1533)", () => {
  it("drops the reply and suppresses navigation when the session is reset mid-flight", async () => {
    const { result, onNavigateViewPath } = setup();

    // Simulate a project switch / New Session arriving while the request is in
    // flight: the reset runs before this turn's reply resolves.
    createMock.mockImplementation(async () => {
      result.current.resetSession();
      return replyWithNavigation;
    });

    await act(async () => {
      await result.current.sendMessage("Tell me about the old project");
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    // The reply (and its navigate_view) must NOT leak into the cleared session.
    expect(result.current.messages).toHaveLength(0);
    expect(onNavigateViewPath).not.toHaveBeenCalled();
    expect(result.current.phase).toEqual({ kind: "idle" });
  });

  it("passes the AbortController signal to the API request", async () => {
    const { result } = setup();
    createMock.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });

    await act(async () => {
      await result.current.sendMessage("hi");
    });

    const [, options] = createMock.mock.calls[0];
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("appends the reply normally when no reset happens", async () => {
    const { result, onNavigateViewPath } = setup();
    createMock.mockResolvedValue({ content: [{ type: "text", text: "A normal answer." }] });

    await act(async () => {
      await result.current.sendMessage("hello");
    });

    const assistant = result.current.messages.filter((m) => m.role === "assistant");
    expect(assistant).toHaveLength(1);
    expect(assistant[0]).toMatchObject({ content: "A normal answer." });
    expect(onNavigateViewPath).not.toHaveBeenCalled();
    expect(result.current.phase).toEqual({ kind: "idle" });
  });

  it("aborts the in-flight request's signal on reset and drops its reply", async () => {
    const { result } = setup();

    let capturedSignal: AbortSignal | undefined;
    createMock.mockImplementation(async (_body: unknown, options?: { signal?: AbortSignal }) => {
      capturedSignal = options?.signal;
      // Reset arrives while the request is in flight.
      result.current.resetSession();
      return { content: [{ type: "text", text: "stale answer" }] };
    });

    await act(async () => {
      await result.current.sendMessage("question");
    });

    // The request was cancelled at the network layer …
    expect(capturedSignal?.aborted).toBe(true);
    // … and its reply / error never reached the cleared session.
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.phase).toEqual({ kind: "idle" });
  });
});
