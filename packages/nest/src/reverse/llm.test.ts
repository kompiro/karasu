import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicClient, LlmError } from "./llm.js";

/** One Messages API event stream, framed the way the provider frames it. */
const sse = (events: Record<string, unknown>[]): Response =>
  new Response(
    events
      .map((event) => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`)
      .join(""),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );

/** The shortest stream that still carries text: what most cases only need. */
const reply = (text: string, extra: Record<string, unknown>[] = []): Response =>
  sse([
    { type: "message_start", message: { model: "claude-opus-5", usage: { input_tokens: 0 } } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    ...extra,
  ]);

function client(fetchImpl: typeof fetch, model?: string): AnthropicClient {
  return new AnthropicClient({ apiKey: "test-key", fetchImpl, ...(model ? { model } : {}) });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("AnthropicClient", () => {
  it("assembles the streamed text and the reported usage", async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        sse([
          {
            type: "message_start",
            message: { model: "claude-opus-5-20260101", usage: { input_tokens: 12 } },
          },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "first " } },
          // A thinking delta is not part of the reply; splicing it in would
          // put reasoning inside the generated `.krs`.
          { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", text: "no" } },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "second" } },
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn" },
            usage: { output_tokens: 34 },
          },
          { type: "message_stop" },
        ]),
      )) as typeof fetch;
    expect(await client(fetchImpl).complete("hi")).toEqual({
      text: "first second",
      model: "claude-opus-5-20260101",
      stopReason: "end_turn",
      usage: { inputTokens: 12, outputTokens: 34 },
    });
  });

  it("asks for a stream", async () => {
    // A non-streaming call for a long synthesis pass is what an intermediary
    // times out on, whatever the model is doing (#2374).
    let body: Record<string, unknown> | undefined;
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return Promise.resolve(reply("ok"));
    }) as typeof fetch;
    await client(fetchImpl).complete("hi");
    expect(body?.stream).toBe(true);
  });

  it("reassembles a frame that arrives split across chunks", async () => {
    const framed = `event: content_block_delta\ndata: ${JSON.stringify({
      type: "content_block_delta",
      delta: { type: "text_delta", text: "whole" },
    })}\n\n`;
    const cut = Math.floor(framed.length / 2);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(framed.slice(0, cut)));
        controller.enqueue(encoder.encode(framed.slice(cut)));
        controller.close();
      },
    });
    const fetchImpl = (() => Promise.resolve(new Response(stream))) as typeof fetch;
    expect((await client(fetchImpl).complete("hi")).text).toBe("whole");
  });

  it("sends the api key and the pinned api version", async () => {
    let seen: Headers | undefined;
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
      seen = new Headers(init?.headers);
      return Promise.resolve(reply("ok"));
    }) as typeof fetch;
    await client(fetchImpl).complete("hi");
    expect(seen?.get("x-api-key")).toBe("test-key");
    expect(seen?.get("anthropic-version")).toBe("2023-06-01");
  });

  it("keeps the provider's response body out of the error", async () => {
    // The prompt is derived from someone's private repository, and a provider
    // error can quote it back.
    const fetchImpl = (() =>
      Promise.resolve(
        new Response("prompt echo: secret business logic", { status: 429 }),
      )) as typeof fetch;
    const thrown = await client(fetchImpl)
      .complete("hi")
      .catch((cause: unknown) => cause as LlmError);
    expect(thrown).toBeInstanceOf(LlmError);
    expect((thrown as LlmError).status).toBe(429);
    expect((thrown as LlmError).message).toBe("the model provider returned 429");
  });

  it("carries the provider's error type, which is a fixed vocabulary", async () => {
    // Without it every refusal looks identical at the only place we can see
    // it, and the cost of learning which one it was is another whole run.
    const fetchImpl = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            type: "error",
            error: { type: "invalid_request_error", message: "prompt echo: secret" },
          }),
          { status: 400 },
        ),
      )) as typeof fetch;
    const thrown = await client(fetchImpl)
      .complete("hi")
      .catch((cause: unknown) => cause as LlmError);
    expect((thrown as LlmError).message).toBe(
      "the model provider returned 400 (invalid_request_error)",
    );
    expect((thrown as LlmError).message).not.toContain("prompt echo");
  });

  it("drops an error type that is not shaped like one", async () => {
    // A provider that puts prose in that field has told us nothing we are
    // allowed to repeat, so the fallback is the status alone.
    const fetchImpl = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { type: "prompt echo: secret business logic" } }), {
          status: 400,
        }),
      )) as typeof fetch;
    const thrown = await client(fetchImpl)
      .complete("hi")
      .catch((cause: unknown) => cause as LlmError);
    expect((thrown as LlmError).message).toBe("the model provider returned 400");
  });

  it("leaves no unread body behind on an error", async () => {
    // An unconsumed response stream holds the invocation open and the runtime
    // cancels the Worker for hanging.
    const response = new Response(JSON.stringify({ error: { type: "overloaded_error" } }), {
      status: 529,
    });
    const fetchImpl = (() => Promise.resolve(response)) as typeof fetch;
    await client(fetchImpl)
      .complete("hi")
      .catch(() => undefined);
    expect(response.bodyUsed).toBe(true);
  });

  it("keeps an in-stream error's message out of the error it raises", async () => {
    // An error event arrives after 200 OK, so the status check above cannot
    // catch it, and its message is as much the provider's as a body is.
    const fetchImpl = (() =>
      Promise.resolve(
        sse([
          { type: "message_start", message: { model: "claude-opus-5" } },
          {
            type: "error",
            error: { type: "overloaded_error", message: "prompt echo: secret business logic" },
          },
        ]),
      )) as typeof fetch;
    const thrown = await client(fetchImpl)
      .complete("hi")
      .catch((cause: unknown) => cause as LlmError);
    expect(thrown).toBeInstanceOf(LlmError);
    expect((thrown as LlmError).message).toBe("the model provider sent a overloaded_error event");
  });

  it("sends the configured model and max_tokens", async () => {
    let body: Record<string, unknown> | undefined;
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return Promise.resolve(reply("ok"));
    }) as typeof fetch;
    await client(fetchImpl, "claude-sonnet-5").complete("hi", { maxTokens: 4096 });
    expect(body?.model).toBe("claude-sonnet-5");
    expect(body?.max_tokens).toBe(4096);
  });

  it("defaults to the standing model when none is configured", async () => {
    let body: Record<string, unknown> | undefined;
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return Promise.resolve(reply("ok"));
    }) as typeof fetch;
    await client(fetchImpl).complete("hi");
    expect(body?.model).toBe("claude-opus-5");
  });

  it("reports the model the provider served, not the one that was asked for", async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        sse([
          { type: "message_start", message: { model: "claude-opus-5-20260101" } },
          { type: "content_block_delta", delta: { type: "text_delta", text: "ok" } },
        ]),
      )) as typeof fetch;
    expect((await client(fetchImpl, "claude-opus-5").complete("hi")).model).toBe(
      "claude-opus-5-20260101",
    );
  });

  it("surfaces stop_reason so a caller can detect truncation", async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        reply("cut off", [{ type: "message_delta", delta: { stop_reason: "max_tokens" } }]),
      )) as typeof fetch;
    expect((await client(fetchImpl).complete("hi")).stopReason).toBe("max_tokens");
  });

  it("treats a refusal as a failure rather than a short answer", async () => {
    // A refusal ends the stream with little or no text; returning what arrived
    // would present it as the model's reply.
    const fetchImpl = (() =>
      Promise.resolve(
        sse([
          { type: "message_start", message: { model: "claude-opus-5" } },
          { type: "content_block_delta", delta: { type: "text_delta", text: "I cannot" } },
          { type: "message_delta", delta: { stop_reason: "refusal" } },
        ]),
      )) as typeof fetch;
    await expect(client(fetchImpl).complete("hi")).rejects.toThrowError(/declined/);
  });

  it("treats an empty completion as a failure rather than an empty model", async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        sse([
          { type: "message_start", message: { model: "claude-opus-5" } },
          { type: "message_stop" },
        ]),
      )) as typeof fetch;
    await expect(client(fetchImpl).complete("hi")).rejects.toThrowError(/no text/);
  });

  it("gives up on a stream that goes silent", async () => {
    // The bound is on silence rather than on duration: a synthesis pass that
    // keeps producing tokens for minutes is allowed to finish.
    vi.useFakeTimers();
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as typeof fetch;
    const pending = client(fetchImpl)
      .complete("hi")
      .catch((cause: unknown) => cause as LlmError);
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    const thrown = await pending;
    expect(thrown).toBeInstanceOf(LlmError);
    expect((thrown as LlmError).status).toBe(504);
    expect((thrown as LlmError).message).toBe("the model provider stopped sending data");
  });

  it("defaults usage to zero when the provider omits it", async () => {
    const fetchImpl = (() => Promise.resolve(reply("ok"))) as typeof fetch;
    expect((await client(fetchImpl).complete("hi")).usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
    });
  });
});
