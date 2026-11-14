// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { LocaleProvider } from "../i18n/index.js";
import { useChatSession } from "./useChatSession.js";

// TPL-2374: a transient upstream failure (5xx, overloaded) and a deterministic
// one (400, 401) must be told apart by the retry policy. The policy lives in
// the SDK client that `runTurn` builds, the only place the chat builds one, so
// this drives the real SDK through a stubbed `fetch` instead of mocking it.

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cleanup();
});

// `retry-after-ms` keeps the SDK's back-off short so the test does not sleep
// for the default delay. It does not decide whether a retry happens.
const headers = { "content-type": "application/json", "retry-after-ms": "1" };

function errorResponse(status: number, type: string): Response {
  return new Response(JSON.stringify({ type: "error", error: { type, message: "failure" } }), {
    status,
    headers,
  });
}

function okResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { status: 200, headers },
  );
}

function wrapper({ children }: { children: ReactNode }) {
  return <LocaleProvider initialLocale="en">{children}</LocaleProvider>;
}

function setup() {
  const { result } = renderHook(
    () =>
      useChatSession({
        fileContent: 'system S { service App { label "App" } }\n',
        currentFilePath: "/index.krs",
        scopeLabel: "Root",
        viewPath: [],
        resolvedSystems: [],
        organizations: [],
        ownerIndex: new Map(),
        apiKey: "test-key",
        onNavigateViewPath: vi.fn<(p: string[]) => void>(),
        onEditorChange: vi.fn<(v: string) => void>(),
      }),
    { wrapper },
  );
  return result;
}

describe("useChatSession — retry policy separates transient from deterministic failures (TPL-2374)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each([
    [529, "overloaded_error"],
    [500, "api_error"],
    [503, "api_error"],
  ])("retries a transient %s and succeeds", async (status, type) => {
    fetchMock
      .mockResolvedValueOnce(errorResponse(status, type))
      .mockResolvedValueOnce(okResponse("Recovered."));
    const result = setup();

    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const last = result.current.messages.at(-1);
    expect(last).toMatchObject({ role: "assistant", content: "Recovered." });
  });

  it.each([
    [400, "invalid_request_error", "server"],
    [401, "authentication_error", "auth"],
  ] as const)("does not retry a deterministic %s", async (status, type, errorType) => {
    fetchMock.mockImplementation(async () => errorResponse(status, type));
    const result = setup();

    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const last = result.current.messages.at(-1);
    expect(last).toMatchObject({ role: "error", errorType, apiErrorType: type });
  });
});
