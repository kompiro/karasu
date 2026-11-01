import type { IncomingMessage, ServerResponse } from "node:http";
import { compile, buildAllViewsSvg } from "@karasu-tools/core";
import type { DiagramType } from "@karasu-tools/core";
import { formatDiagnostic } from "./i18n.js";
import {
  fetchSrc as defaultFetchSrc,
  isBlockedAddress,
  isIpLiteral,
  type FetchSrcOptions,
} from "./render-fetch.js";

// ---------------------------------------------------------------------------
// SSRF protection
// ---------------------------------------------------------------------------

/**
 * The synchronous first pass over `src`: refuses what can be refused without
 * resolving a name. Names other than `localhost` are checked where they are
 * resolved, on every hop (`fetchSrc`, #3426).
 */
export function isSafeUrl(
  raw: string,
  isBlocked: (address: string) => boolean = (address) => isBlockedAddress(address),
): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;

  // `new URL` has already turned `0x7f.1`, `2130706433` and `127.1` into
  // dotted decimal, so every IP spelling reaches this check.
  if (isIpLiteral(url.hostname)) return !isBlocked(url.hostname);

  const name = url.hostname.replace(/\.+$/, "");
  return name !== "localhost" && !name.endsWith(".localhost");
}

// ---------------------------------------------------------------------------
// Parameter parsing
// ---------------------------------------------------------------------------

type RenderParams =
  | { kind: "src"; src: string; view: DiagramType | null }
  | { kind: "code"; code: string; view: DiagramType | null }
  | { kind: "error"; status: number; message: string };

export function parseRenderParams(
  searchParams: URLSearchParams,
  isBlocked?: (address: string) => boolean,
): RenderParams {
  const src = searchParams.get("src");
  const code = searchParams.get("code");
  const viewRaw = searchParams.get("view");

  const view = parseView(viewRaw);
  if (viewRaw !== null && view === null) {
    return {
      kind: "error",
      status: 400,
      message: `Invalid view: "${viewRaw}". Must be system, deploy, or org.`,
    };
  }

  if (src) {
    if (!isSafeUrl(src, isBlocked)) {
      return {
        kind: "error",
        status: 400,
        message: "Invalid src URL. Only public http/https URLs are allowed.",
      };
    }
    return { kind: "src", src, view };
  }

  if (code) {
    return { kind: "code", code, view };
  }

  return { kind: "error", status: 400, message: "Either src or code query parameter is required." };
}

function parseView(raw: string | null): DiagramType | null {
  if (raw === null) return null;
  if (raw === "system" || raw === "deploy" || raw === "org") return raw;
  return null;
}

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

/**
 * Caps the `src` fetches in flight. `dns.lookup` holds one of libuv's four
 * threadpool threads until it returns and cannot be cancelled, so a slot is
 * held until the response is sent *and* every lookup has returned. Two
 * leaves threads for `serve`'s own `fs` calls.
 */
export class SrcFetchLimiter {
  private active = 0;

  constructor(private readonly max = 2) {}

  /** A release function, or null when every slot is taken. */
  tryAcquire(): (() => void) | null {
    if (this.active >= this.max) return null;
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
    };
  }
}

const defaultLimiter = new SrcFetchLimiter();

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export interface RenderDeps {
  fetchSrc?: typeof defaultFetchSrc;
  /** Passed to `fetchSrc` and to the first-pass check. */
  fetchOptions?: Omit<FetchSrcOptions, "signal">;
  limiter?: SrcFetchLimiter;
  timeoutMs?: number;
}

function sendText(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

export async function handleRender(
  _req: IncomingMessage,
  res: ServerResponse,
  searchParams: URLSearchParams,
  deps: RenderDeps = {},
): Promise<void> {
  const params = parseRenderParams(searchParams, deps.fetchOptions?.isBlocked);

  if (params.kind === "error") {
    sendText(res, params.status, params.message);
    return;
  }

  if (params.kind === "code") {
    // base64 → string (support both standard and URL-safe base64)
    let source: string;
    try {
      source = Buffer.from(params.code.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf-8",
      );
    } catch {
      sendText(res, 400, "Invalid base64 encoding in code parameter.");
      return;
    }
    respondWithSvg(res, source, params.view);
    return;
  }

  const release = (deps.limiter ?? defaultLimiter).tryAcquire();
  if (release === null) {
    sendText(res, 503, "Too many src fetches in progress. Try again shortly.");
    return;
  }
  const fetchSrc = deps.fetchSrc ?? defaultFetchSrc;
  let lookupsSettled: Promise<void> = Promise.resolve();
  try {
    const fetching = fetchSrc(params.src, {
      ...deps.fetchOptions,
      signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
    });
    lookupsSettled = fetching.lookupsSettled;
    const result = await fetching.result;
    if (!result.ok) {
      const prefix = result.status === 400 ? "Invalid src URL" : "Failed to fetch src";
      sendText(res, result.status, `${prefix}: ${result.message}`);
      return;
    }
    respondWithSvg(res, result.text, params.view);
  } finally {
    void lookupsSettled.then(release, release);
  }
}

function respondWithSvg(res: ServerResponse, source: string, view: DiagramType | null): void {
  // Compile.
  //
  // The /render HTTP endpoint is a single-file boundary by design: the source
  // arrives either as a single remote URL (`?src=`) or as a base64-encoded
  // text blob (`?code=`), with no filesystem context for resolving sibling
  // `.krs` files. We therefore use the convenience `compile` /
  // `buildAllViewsSvg` APIs rather than the principled `compileProject`
  // variants — `import { ... } from "./other.krs"` declarations in the posted
  // source are intentionally left unresolved. Multi-file projects are out of
  // scope for this endpoint; consumers that need import resolution should use
  // the `karasu render` CLI (which resolves against a real filesystem) or the
  // VS Code preview. See TPL-239 for the convenience-vs-principled
  // API distinction.
  let svg: string;
  try {
    const result = view ? compile(source, { diagramType: view }) : buildAllViewsSvg(source);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      sendText(res, 422, errors.map((d) => formatDiagnostic(d)).join("\n"));
      return;
    }
    svg = result.svg;
  } catch (err) {
    sendText(res, 422, `Compile error: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  res.writeHead(200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=60",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(svg);
}
