import { test as opfsTest, expect } from "./opfs.js";

/**
 * Anthropic transport fixture for the Chat UI.
 *
 * Intercepts `POST https://api.anthropic.com/v1/messages` (the only endpoint
 * `useChatSession` hits via `@anthropic-ai/sdk`) and returns scripted
 * responses, so AT-0050 (BYOK Chat UI) can run deterministically without a
 * real API key.
 *
 * Design rationale: see `docs/design/chat-anthropic-mock-fixture.md`.
 *
 * Composes with the `opfs` fixture so a single test can seed both the
 * filesystem and the API key:
 *
 *   import { test, expect } from "../fixtures/anthropic";
 *
 *   test("chat round-trip", async ({ page, opfs, anthropic }) => {
 *     await opfs.seed({ projects: [...], lastProjectId: "demo" });
 *     await anthropic.seedApiKey("sk-ant-test-fake");
 *     await anthropic.scriptTurns([{ kind: "text", text: "Hi" }]);
 *     await opfs.gotoApp();
 *     // ...
 *   });
 */

export type ScriptedTurn =
  | {
      kind: "text";
      text: string;
      stopReason?: "end_turn" | "max_tokens" | "stop_sequence";
    }
  | {
      kind: "tool_use";
      tool: "navigate_view" | "apply_krs_patch";
      input: Record<string, unknown>;
      /** Optional assistant text emitted alongside the tool_use block. */
      precedingText?: string;
      /** Override the tool_use_id Anthropic would assign (default: auto). */
      toolUseId?: string;
    };

export type ScriptedError = {
  status: 401 | 429 | 500;
  /** Anthropic error `type`. Defaults match the SDK's classification. */
  errorType?: string;
  message?: string;
};

export type CapturedRequest = {
  body: {
    model: string;
    messages: unknown[];
    tools?: unknown[];
    system?: unknown;
    max_tokens?: number;
  };
};

export type SeedApiKeyOptions = {
  /** Where to store the key. Mirrors `karasu.ai.settings.persist`. Default: `"session"`. */
  persist?: "session" | "local";
};

export type AnthropicFixture = {
  /**
   * Replace the response queue. Each turn is consumed (FIFO) by one
   * `client.messages.create` call. If the queue empties while the app is
   * still calling the API, the next request gets a 500 + a console-visible
   * marker so the test fails loudly rather than hanging.
   */
  scriptTurns(turns: ReadonlyArray<ScriptedTurn>): Promise<void>;
  /** Make the next request fail with the given status. One-shot. */
  respondWithError(error: ScriptedError): Promise<void>;
  /** Captured request bodies, in arrival order. */
  readonly requests: ReadonlyArray<CapturedRequest>;
  /** Seed the BYOK API key + persist setting. Must be called before `gotoApp()`. */
  seedApiKey(apiKey: string, options?: SeedApiKeyOptions): Promise<void>;
  /** Remove the stored API key from both storages. */
  clearApiKey(): Promise<void>;
};

const ANTHROPIC_URL_GLOB = "https://api.anthropic.com/**";
const KEY_API_KEY = "karasu.ai.anthropic.apiKey";
const KEY_PERSIST = "karasu.ai.settings.persist";

type QueueState =
  | { kind: "turns"; turns: ScriptedTurn[] }
  | { kind: "error"; error: ScriptedError; consumed: boolean };

let messageCounter = 0;
const nextMessageId = () => `msg_test_${Date.now()}_${++messageCounter}`;
const nextToolUseId = () => `toolu_test_${Date.now()}_${++messageCounter}`;

function buildMessageResponse(turn: ScriptedTurn): Record<string, unknown> {
  const content: Array<Record<string, unknown>> = [];
  let stopReason: string;

  if (turn.kind === "text") {
    content.push({ type: "text", text: turn.text });
    stopReason = turn.stopReason ?? "end_turn";
  } else {
    if (turn.precedingText && turn.precedingText.length > 0) {
      content.push({ type: "text", text: turn.precedingText });
    }
    content.push({
      type: "tool_use",
      id: turn.toolUseId ?? nextToolUseId(),
      name: turn.tool,
      input: turn.input,
    });
    stopReason = "tool_use";
  }

  return {
    id: nextMessageId(),
    type: "message",
    role: "assistant",
    model: "claude-test-fake",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

function buildErrorResponse(error: ScriptedError): {
  status: number;
  body: Record<string, unknown>;
} {
  const defaultType =
    error.status === 401
      ? "authentication_error"
      : error.status === 429
        ? "rate_limit_error"
        : "api_error";
  const defaultMessage =
    error.status === 401
      ? "invalid x-api-key"
      : error.status === 429
        ? "rate limit exceeded"
        : "server error";
  return {
    status: error.status,
    body: {
      type: "error",
      error: {
        type: error.errorType ?? defaultType,
        message: error.message ?? defaultMessage,
      },
    },
  };
}

export const test = opfsTest.extend<{ anthropic: AnthropicFixture }>({
  anthropic: async ({ page }, use) => {
    let queue: QueueState = { kind: "turns", turns: [] };
    const requests: CapturedRequest[] = [];

    await page.route(ANTHROPIC_URL_GLOB, async (route) => {
      const request = route.request();

      // Only POST /v1/messages is mocked. Other verbs (preflight, etc.) get a
      // permissive default so we don't accidentally swallow non-message calls.
      if (request.method() !== "POST" || !request.url().includes("/v1/messages")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "{}",
        });
        return;
      }

      try {
        const body = request.postDataJSON() as CapturedRequest["body"];
        requests.push({ body });
      } catch {
        // postDataJSON() throws if the body isn't valid JSON. Capture nothing
        // but still serve a response so the test can observe the failure.
      }

      if (queue.kind === "error") {
        if (queue.consumed) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({
              type: "error",
              error: {
                type: "fixture_exhausted",
                message: "anthropic fixture: scripted error already consumed",
              },
            }),
          });
          return;
        }
        queue.consumed = true;
        const { status, body } = buildErrorResponse(queue.error);
        await route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
        // After consuming the one-shot error, fall back to an empty turn queue.
        queue = { kind: "turns", turns: [] };
        return;
      }

      const turn = queue.turns.shift();
      if (!turn) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            type: "error",
            error: {
              type: "fixture_exhausted",
              message:
                "anthropic fixture: no scripted turns left — call scriptTurns(...) before triggering the request",
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildMessageResponse(turn)),
      });
    });

    const fixture: AnthropicFixture = {
      async scriptTurns(turns) {
        queue = { kind: "turns", turns: [...turns] };
      },
      async respondWithError(error) {
        queue = { kind: "error", error, consumed: false };
      },
      get requests() {
        return requests;
      },
      async seedApiKey(apiKey, options = {}) {
        const persist = options.persist ?? "session";
        await page.evaluate(
          ({ key, where, keyApiKey, keyPersist }) => {
            localStorage.setItem(keyPersist, where);
            const target = where === "local" ? localStorage : sessionStorage;
            const other = where === "local" ? sessionStorage : localStorage;
            target.setItem(keyApiKey, key);
            other.removeItem(keyApiKey);
          },
          { key: apiKey, where: persist, keyApiKey: KEY_API_KEY, keyPersist: KEY_PERSIST },
        );
      },
      async clearApiKey() {
        await page.evaluate(
          ({ keyApiKey }) => {
            sessionStorage.removeItem(keyApiKey);
            localStorage.removeItem(keyApiKey);
          },
          { keyApiKey: KEY_API_KEY },
        );
      },
    };

    await use(fixture);

    await page.unroute(ANTHROPIC_URL_GLOB);
  },
});

export { expect };
