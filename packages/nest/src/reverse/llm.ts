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
 * Non-streaming, so this has to stay inside the SDK/HTTP timeout envelope.
 * The synthesis pass raises it explicitly; a truncated `.krs` is caught by
 * the `stop_reason` check rather than cached as complete.
 */
const DEFAULT_MAX_TOKENS = 16_000;

/**
 * A wall-clock bound on one model call. Without it a hung provider request
 * holds a Worker invocation open until the platform kills it, and every pass
 * already completed is lost with it.
 */
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

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
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await this.fetchImpl(API_URL, {
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
          messages: [{ role: "user", content: prompt }],
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // The body is the provider's and may quote the prompt, which is derived
      // from someone's private repository. Status only.
      throw new LlmError(response.status, `the model provider returned ${response.status}`);
    }

    const body = (await response.json()) as {
      content?: { type?: string; text?: string }[];
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    // A refusal is a 200 with an empty or partial body. Reading `content[0]`
    // unconditionally would treat it as a short answer.
    if (body.stop_reason === "refusal") {
      throw new LlmError(200, "the model declined the request");
    }
    const text = (body.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("");
    if (text.length === 0) throw new LlmError(200, "the model returned no text");

    return {
      text,
      ...(body.stop_reason === undefined ? {} : { stopReason: body.stop_reason }),
      usage: {
        inputTokens: body.usage?.input_tokens ?? 0,
        outputTokens: body.usage?.output_tokens ?? 0,
      },
    };
  }
}
