/**
 * A stored submission, as a diagram.
 *
 * `GET /<owner>/<repo>` returning `.krs` text was one of the three problems
 * [#2378](https://github.com/kompiro/karasu/pull/2378) named, and it is the one
 * the gallery inherits: a gallery whose entries are only readable as source is
 * not a gallery.
 *
 * **ADR-2259's 8000-character ceiling does not apply here.** That limit binds
 * because `resolveRepoPermalink` folds a repository's `.krs` back into a
 * `/s?s=` URL — what is capped is what fits in a URL. A stored submission is
 * served by id, so no model rides in a URL on this path and the ceiling has
 * nothing to bind. The ADR stays in force for the permalink face it was
 * written for, which is untouched.
 *
 * The shape mirrors `renderSharePayload` in `packages/app` — a
 * framework-agnostic `{status, contentType, body}` that a route turns into a
 * `Response` — but the code is not shared. Importing from `packages/app` would
 * make a static site's build a dependency of this Worker; `@karasu-tools/core`
 * is the piece both faces genuinely have in common, and both call it directly.
 */
import {
  buildAllViewsSvg,
  compile,
  type DiagramTheme,
  type DiagramType,
  type DisplayMode,
} from "@karasu-tools/core";

export interface RenderResult {
  status: number;
  contentType: string;
  body: string;
}

const PLAIN = "text/plain; charset=utf-8";
const SVG = "image/svg+xml; charset=utf-8";

function parseView(raw: string | null): DiagramType | null | "invalid" {
  if (raw === null) return null; // absent -> the bundled all-views diagram
  if (raw === "system" || raw === "deploy" || raw === "org") return raw;
  return "invalid";
}

const parseTheme = (raw: string | null): DiagramTheme | undefined =>
  raw === "light" || raw === "dark" ? raw : undefined;

const parseDisplayMode = (raw: string | null): DisplayMode | undefined =>
  raw === "icon" || raw === "shape" ? raw : undefined;

/**
 * Render a submission to SVG.
 *
 * Query parameters: `view` (system|deploy|org; omit for the bundled all-views
 * diagram), `theme` (light|dark), `displayMode` (icon|shape).
 *
 * A document with errors answers 422 rather than 500. It was checked at ingest
 * (`gallery/validate.ts`), so reaching this state means either the compiler's
 * idea of an error moved under a stored document or the store returned
 * something it should not have — both of which are "this cannot be shown",
 * not "the server broke".
 */
export function renderSubmission(krs: string, params: URLSearchParams): RenderResult {
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
      ? compile(krs, { diagramType: view, displayMode, theme })
      : buildAllViewsSvg(krs, undefined, displayMode, undefined, theme);
    const errors = result.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    ).length;
    if (errors > 0) {
      return {
        status: 422,
        contentType: PLAIN,
        body: `Cannot render: this submission has ${errors} error(s).`,
      };
    }
    return { status: 200, contentType: SVG, body: result.svg };
  } catch (cause) {
    // The message is the renderer's own, about a document its author
    // submitted; it carries nothing derived from anyone else's repository,
    // because the service never reads one.
    return {
      status: 422,
      contentType: PLAIN,
      body: `Render error: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
}
