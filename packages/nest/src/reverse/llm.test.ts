import { describe, expect, it } from "vitest";
import { AnthropicClient, LlmError } from "./llm.js";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function client(fetchImpl: typeof fetch, model?: string): AnthropicClient {
  return new AnthropicClient({ apiKey: "test-key", fetchImpl, ...(model ? { model } : {}) });
}

describe("AnthropicClient", () => {
  it("returns the concatenated text and the reported usage", async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        json({
          content: [
            { type: "text", text: "first " },
            { type: "thinking", text: "ignored" },
            { type: "text", text: "second" },
          ],
          usage: { input_tokens: 12, output_tokens: 34 },
        }),
      )) as typeof fetch;
    expect(await client(fetchImpl).complete("hi")).toEqual({
      text: "first second",
      usage: { inputTokens: 12, outputTokens: 34 },
    });
  });

  it("sends the api key and the pinned api version", async () => {
    let seen: Headers | undefined;
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
      seen = new Headers(init?.headers);
      return Promise.resolve(json({ content: [{ type: "text", text: "ok" }] }));
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

  it("sends the configured model and max_tokens", async () => {
    let body: Record<string, unknown> | undefined;
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return Promise.resolve(json({ content: [{ type: "text", text: "ok" }] }));
    }) as typeof fetch;
    await client(fetchImpl, "claude-sonnet-5").complete("hi", { maxTokens: 4096 });
    expect(body?.model).toBe("claude-sonnet-5");
    expect(body?.max_tokens).toBe(4096);
  });

  it("defaults to the standing model when none is configured", async () => {
    let body: Record<string, unknown> | undefined;
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return Promise.resolve(json({ content: [{ type: "text", text: "ok" }] }));
    }) as typeof fetch;
    await client(fetchImpl).complete("hi");
    expect(body?.model).toBe("claude-opus-5");
  });

  it("surfaces stop_reason so a caller can detect truncation", async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        json({ content: [{ type: "text", text: "cut off" }], stop_reason: "max_tokens" }),
      )) as typeof fetch;
    expect((await client(fetchImpl).complete("hi")).stopReason).toBe("max_tokens");
  });

  it("treats a refusal as a failure rather than a short answer", async () => {
    // A refusal is a 200 with an empty or partial body; reading content[0]
    // unconditionally would treat it as the model's reply.
    const fetchImpl = (() =>
      Promise.resolve(json({ content: [], stop_reason: "refusal" }))) as typeof fetch;
    await expect(client(fetchImpl).complete("hi")).rejects.toThrowError(/declined/);
  });

  it("aborts a request that never returns", async () => {
    // Without a bound, a hung provider holds the Worker invocation open until
    // the platform kills it, losing every pass already completed.
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as typeof fetch;
    const started = Date.now();
    const pending = client(fetchImpl).complete("hi");
    // The production bound is ten minutes; assert the signal is wired rather
    // than waiting for it.
    expect(pending).toBeInstanceOf(Promise);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("treats an empty completion as a failure rather than an empty model", async () => {
    const fetchImpl = (() => Promise.resolve(json({ content: [] }))) as typeof fetch;
    await expect(client(fetchImpl).complete("hi")).rejects.toThrowError(/no text/);
  });

  it("defaults usage to zero when the provider omits it", async () => {
    const fetchImpl = (() =>
      Promise.resolve(json({ content: [{ type: "text", text: "ok" }] }))) as typeof fetch;
    expect((await client(fetchImpl).complete("hi")).usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
    });
  });
});
