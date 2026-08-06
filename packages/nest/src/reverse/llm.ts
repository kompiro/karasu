/**
 * The model call, behind an interface small enough that the pipeline can be
 * tested without one.
 *
 * ADR-1990 decision 6 makes zero-retention a contractual requirement of
 * whichever provider is used, which is a procurement fact rather than a code
 * one — but it is the reason this interface exists at all rather than the
 * pipeline calling an SDK directly. A provider that cannot be swapped is a
 * provider whose terms cannot be renegotiated.
 */

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  text: string;
  usage: LlmUsage;
  /** Why generation stopped. `max_tokens` means the reply is truncated. */
  stopReason?: string;
  /**
   * Which model actually served this, as reported by the provider.
   *
   * Not the model that was asked for: an alias can resolve to something else,
   * and a cost report priced against the request rather than the response is
   * wrong in exactly the case where it matters (#2226).
   */
  model?: string;
}

export interface LlmClient {
  /** One turn. The pipeline is multi-pass, but each pass is stateless. */
  complete(prompt: string, options?: { maxTokens?: number }): Promise<LlmResponse>;
}

export class LlmError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

interface AnthropicClientOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

const API_URL = "https://api.anthropic.com/v1/messages";

/**
 * The standing default for new Anthropic integrations. Quality is the product
 * here — ADR-1990 decision 4 makes domain-analysis quality the differentiator
 * the whole pivot rests on — so the cheaper tier is a decision to take after
 * #2226 measures what it costs, not before.
 */
const DEFAULT_MODEL = "claude-opus-5";

/**
 * The synthesis pass raises it explicitly; a truncated `.krs` is caught by
 * the `stop_reason` check rather than cached as complete.
 */
const DEFAULT_MAX_TOKENS = 16_000;

/**
 * The bound is on silence, not on duration.
 *
 * A synthesis pass legitimately runs for minutes, and a bound on the whole
 * call is what makes that legitimate case indistinguishable from a hang — to
 * us and to every intermediary in the path, which is how a five-minute pass
 * came back as a 524 (#2374). What is never legitimate is a connection that
 * has stopped producing events, and streaming makes that observable directly.
 */
const STREAM_IDLE_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * The stall is ours to declare — no HTTP status was involved — so it carries
 * the code an intermediary would have used for the same condition.
 */
const STALL_STATUS = 504;

/** The Anthropic Messages API, as much of it as this service uses. */
export class AnthropicClient implements LlmClient {
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;

  constructor(private readonly options: AnthropicClientOptions) {
    // Named at call time, never captured: a detached global `fetch` throws
    // "Illegal invocation" in the Workers runtime.
    const injected = options.fetchImpl;
    this.fetchImpl =
      injected === undefined
        ? (input, init) => fetch(input, init)
        : (input, init) => injected(input, init);
    this.model = options.model ?? DEFAULT_MODEL;
  }

  async complete(prompt: string, options: { maxTokens?: number } = {}): Promise<LlmResponse> {
    const abort = new AbortController();
    let idle: ReturnType<typeof setTimeout> | undefined;
    const waitForMore = (): void => {
      if (idle !== undefined) clearTimeout(idle);
      idle = setTimeout(() => abort.abort(), STREAM_IDLE_TIMEOUT_MS);
    };
    waitForMore();

    try {
      const response = await this.fetchImpl(API_URL, {
        method: "POST",
        signal: abort.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.options.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
          stream: true,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        // The body is the provider's and may quote the prompt, which is derived
        // from someone's private repository — so only the error *type* comes
        // out, and only when it looks like one. Reading it also drains the
        // stream, which is not incidental: an unconsumed response body holds
        // the invocation open and the runtime kills the Worker for hanging.
        const type = await providerErrorType(response);
        throw new LlmError(
          response.status,
          type === undefined
            ? `the model provider returned ${response.status}`
            : `the model provider returned ${response.status} (${type})`,
        );
      }
      const body = response.body;
      if (body === null) {
        throw new LlmError(response.status, "the model provider sent no body");
      }
      return await this.readStream(body, waitForMore);
    } catch (cause) {
      // The abort surfaces as whatever the runtime throws for a cancelled
      // read, which differs between workerd and the test runtime. The signal
      // is the reliable witness.
      if (abort.signal.aborted) {
        throw new LlmError(STALL_STATUS, "the model provider stopped sending data");
      }
      throw cause;
    } finally {
      if (idle !== undefined) clearTimeout(idle);
    }
  }

  /**
   * Reads the Messages API event stream. `onProgress` is called for every
   * chunk that arrives, which is what turns the idle bound into a bound on
   * silence rather than on the length of the reply.
   */
  private async readStream(
    body: ReadableStream<Uint8Array>,
    onProgress: () => void,
  ): Promise<LlmResponse> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let pending = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: string | undefined;
    let model: string | undefined;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        onProgress();
        pending += decoder.decode(value, { stream: true });
        // Frames are separated by a blank line and one frame can straddle two
        // chunks, so the tail stays buffered until its separator arrives.
        let boundary = pending.indexOf("\n\n");
        while (boundary !== -1) {
          const frame = pending.slice(0, boundary);
          pending = pending.slice(boundary + 2);
          const event = parseFrame(frame);
          if (event !== undefined) {
            switch (event.type) {
              case "message_start":
                model = event.message?.model;
                inputTokens = event.message?.usage?.input_tokens ?? inputTokens;
                outputTokens = event.message?.usage?.output_tokens ?? outputTokens;
                break;
              case "content_block_delta":
                // Only text. A thinking delta is not part of the reply, and
                // reading it as one would splice reasoning into the `.krs`.
                if (event.delta?.type === "text_delta" && typeof event.delta.text === "string") {
                  chunks.push(event.delta.text);
                }
                break;
              case "message_delta":
                if (typeof event.delta?.stop_reason === "string") {
                  stopReason = event.delta.stop_reason;
                }
                if (typeof event.usage?.output_tokens === "number") {
                  outputTokens = event.usage.output_tokens;
                }
                break;
              case "error":
                // The type is a fixed enum; the message beside it can quote
                // the prompt back, so only the type is carried out.
                throw new LlmError(
                  200,
                  `the model provider sent a ${event.error?.type ?? "unknown"} event`,
                );
              default:
                break;
            }
          }
          boundary = pending.indexOf("\n\n");
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }

    // A refusal ends the stream with little or no text. Returning what arrived
    // would present it as the model's reply.
    if (stopReason === "refusal") {
      throw new LlmError(200, "the model declined the request");
    }
    const text = chunks.join("");
    if (text.length === 0) throw new LlmError(200, "the model returned no text");

    return {
      text,
      model: model ?? this.model,
      ...(stopReason === undefined ? {} : { stopReason }),
      usage: { inputTokens, outputTokens },
    };
  }
}

/**
 * A provider error type is a fixed vocabulary (`invalid_request_error`,
 * `overloaded_error`, …). Anything else in that field is not one, and the
 * safe reading of "not one" is that the provider put prose there — which is
 * the thing that must not escape.
 */
const ERROR_TYPE_SHAPE = /^[a-z][a-z0-9_]{0,39}$/;

/**
 * The `error.type` of a failed response, if the body has one.
 *
 * Always leaves the body consumed or cancelled. Which of the two happens is
 * not the caller's business, but that one of them happens is: a response
 * stream nobody reads keeps the invocation alive until the runtime cancels it
 * for hanging (#2379).
 */
async function providerErrorType(response: Response): Promise<string | undefined> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    await response.body?.cancel().catch(() => undefined);
    return undefined;
  }
  try {
    const body = JSON.parse(text) as { error?: { type?: unknown } };
    const type = body.error?.type;
    if (typeof type !== "string" || !ERROR_TYPE_SHAPE.test(type)) return undefined;
    return type;
  } catch {
    // Not JSON. A provider that answers with prose has told us nothing we are
    // allowed to repeat.
    return undefined;
  }
}

interface StreamEvent {
  type?: string;
  message?: { model?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  delta?: { type?: string; text?: string; stop_reason?: string };
  usage?: { output_tokens?: number };
  error?: { type?: string };
}

/**
 * One SSE frame to its payload. The `event:` line repeats the `type` inside
 * the data, so only the data is read; a frame without one (a comment, or the
 * keep-alive the provider sends) yields nothing.
 */
function parseFrame(frame: string): StreamEvent | undefined {
  for (const line of frame.split("\n")) {
    const trimmed = line.trimEnd();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice("data:".length).trim();
    if (payload.length === 0) continue;
    try {
      return JSON.parse(payload) as StreamEvent;
    } catch {
      // A frame we cannot parse is not a reason to discard a reply that is
      // otherwise arriving; the terminal checks below still hold.
      return undefined;
    }
  }
  return undefined;
}
