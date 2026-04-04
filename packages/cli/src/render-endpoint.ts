import type { IncomingMessage, ServerResponse } from "node:http";
import { compile, buildAllViewsSvg } from "@karasu/core";
import type { DiagramType } from "@karasu/core";

// ---------------------------------------------------------------------------
// SSRF protection
// ---------------------------------------------------------------------------

/**
 * Returns true only for safe, externally-reachable URLs.
 * Blocks loopback, private RFC-1918 ranges, link-local, and non-HTTP(S) schemes.
 */
export function isSafeUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const hostname = url.hostname;

  // IPv6 loopback
  if (hostname === "::1" || hostname === "[::1]") return false;

  // Hostname-based loopback / metadata
  if (hostname === "localhost") return false;

  // Dotted-decimal IPv4 checks
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b, c] = ipv4.map(Number);
    // 127.0.0.0/8 — loopback
    if (a === 127) return false;
    // 10.0.0.0/8 — private
    if (a === 10) return false;
    // 172.16.0.0/12 — private
    if (a === 172 && b >= 16 && b <= 31) return false;
    // 192.168.0.0/16 — private
    if (a === 192 && b === 168) return false;
    // 169.254.0.0/16 — link-local
    if (a === 169 && b === 254) return false;
    // 0.0.0.0/8
    if (a === 0) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Parameter parsing
// ---------------------------------------------------------------------------

type RenderParams =
  | { kind: "src"; src: string; view: DiagramType | null }
  | { kind: "code"; code: string; view: DiagramType | null }
  | { kind: "error"; status: number; message: string };

export function parseRenderParams(searchParams: URLSearchParams): RenderParams {
  const src = searchParams.get("src");
  const code = searchParams.get("code");
  const viewRaw = searchParams.get("view");

  const view = parseView(viewRaw);
  if (viewRaw !== null && view === null) {
    return { kind: "error", status: 400, message: `Invalid view: "${viewRaw}". Must be system, deploy, or org.` };
  }

  if (src) {
    if (!isSafeUrl(src)) {
      return { kind: "error", status: 400, message: "Invalid src URL. Only public http/https URLs are allowed." };
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
// Handler
// ---------------------------------------------------------------------------

export async function handleRender(
  _req: IncomingMessage,
  res: ServerResponse,
  searchParams: URLSearchParams,
): Promise<void> {
  const params = parseRenderParams(searchParams);

  if (params.kind === "error") {
    res.writeHead(params.status, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(params.message);
    return;
  }

  // Resolve source
  let source: string;
  if (params.kind === "src") {
    try {
      const response = await fetch(params.src, {
        headers: { "User-Agent": "karasu-render/1.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`Failed to fetch src: HTTP ${response.status}`);
        return;
      }
      source = await response.text();
    } catch (err) {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Failed to fetch src: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
  } else {
    // base64 → string (support both standard and URL-safe base64)
    try {
      source = Buffer.from(params.code.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Invalid base64 encoding in code parameter.");
      return;
    }
  }

  // Compile
  let svg: string;
  try {
    if (params.view) {
      const result = compile(source, { diagramType: params.view });
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      if (errors.length > 0) {
        res.writeHead(422, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(errors.map((d) => d.message).join("\n"));
        return;
      }
      svg = result.svg;
    } else {
      const result = buildAllViewsSvg(source);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      if (errors.length > 0) {
        res.writeHead(422, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(errors.map((d) => d.message).join("\n"));
        return;
      }
      svg = result.svg;
    }
  } catch (err) {
    res.writeHead(422, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Compile error: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  res.writeHead(200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=60",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(svg);
}
