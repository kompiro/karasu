import {
  compile,
  buildAllViewsSvg,
  type DiagramType,
  type DiagramTheme,
  type DisplayMode,
} from "@karasu-tools/core";
import { decodeShare } from "../utils/inline-share.js";

/**
 * Static render endpoint for karasu-nest (design:
 * docs/design/karasu-nest-hosted-preview.md, "static SVG endpoint").
 *
 * Turns a share payload (`?s=<encoded {krs, style}>`, the same bundle the Share
 * button produces) into a standalone SVG for README embedding / OGP. Unlike the
 * inline-share fragment, the payload here travels in the QUERY so the server can
 * read and render it.
 *
 * Framework-agnostic: returns a plain result that the Cloudflare Pages Function
 * (`functions/render.ts`) maps onto a `Response`. Kept here (app `src`, fully
 * unit-tested) rather than in the thin function so the logic is testable without
 * the Workers runtime.
 */
interface ShareRenderResult {
  status: number;
  contentType: string;
  body: string;
}

const PLAIN = "text/plain; charset=utf-8";
const SVG = "image/svg+xml; charset=utf-8";

function parseView(raw: string | null): DiagramType | null | "invalid" {
  if (raw === null) return null; // absent → bundled all-views
  if (raw === "system" || raw === "deploy" || raw === "org") return raw;
  return "invalid";
}

function parseTheme(raw: string | null): DiagramTheme | undefined {
  return raw === "light" || raw === "dark" ? raw : undefined;
}

function parseDisplayMode(raw: string | null): DisplayMode | undefined {
  return raw === "icon" || raw === "shape" ? raw : undefined;
}

/**
 * Render a share payload to SVG.
 *
 * Query params: `s` (required, encoded payload), `view` (system|deploy|org;
 * omit for the bundled all-views diagram), `theme` (light|dark), `displayMode`
 * (icon|shape). Status: 200 SVG, 400 bad request, 422 source has errors.
 */
export function renderSharePayload(params: URLSearchParams): ShareRenderResult {
  const s = params.get("s");
  if (!s) return { status: 400, contentType: PLAIN, body: "Missing 's' query parameter." };

  const payload = decodeShare(s);
  if (payload === null) {
    return { status: 400, contentType: PLAIN, body: "Invalid or corrupt 's' payload." };
  }

  const view = parseView(params.get("view"));
  if (view === "invalid") {
    return {
      status: 400,
      contentType: PLAIN,
      body: "Invalid 'view'. Must be system, deploy, or org.",
    };
  }

  const theme = parseTheme(params.get("theme"));
  const displayMode = parseDisplayMode(params.get("displayMode"));

  try {
    const result = view
      ? compile(payload.krs, { diagramType: view, styleSource: payload.style, displayMode, theme })
      : buildAllViewsSvg(payload.krs, payload.style, displayMode, undefined, theme);

    const errorCount = result.diagnostics.filter((d) => d.severity === "error").length;
    if (errorCount > 0) {
      return {
        status: 422,
        contentType: PLAIN,
        body: `Cannot render: the shared source has ${errorCount} error(s).`,
      };
    }
    return { status: 200, contentType: SVG, body: result.svg };
  } catch (err) {
    return {
      status: 422,
      contentType: PLAIN,
      body: `Render error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
