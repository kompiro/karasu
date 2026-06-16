// Link rewriting + classification, the main technical risk of the docs site
// (issue #1575). Repo-relative links in docs/ are resolved to one of:
//   - an in-site route (route-relative URL, base-agnostic) for published pages,
//   - a GitHub blob/tree URL for everything else under the repo, or
//   - left untouched for external / scheme / in-page-anchor links.
// Explicit `<a id>` anchors and `#fragment`s are always preserved. Pure (no fs).

import path from "node:path";
import { REPO_BRANCH, REPO_SLUG, routeOf, routeRelative } from "./site-map.ts";

interface RewriteContext {
  /** docs-relative path of the source document, e.g. "guide/05-communicating-diagrams.md" */
  srcDocsRel: string;
  /** docs-relative paths actually published as site pages (en + existing ja siblings) */
  published: ReadonlySet<string>;
}

type ResolvedLink =
  | { kind: "external"; href: string }
  | { kind: "in-page"; fragment: string }
  | { kind: "internal"; route: string; fragment: string }
  | { kind: "repo"; repoPath: string; fragment: string; isDir: boolean };

function hasScheme(raw: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//");
}

/**
 * Classify a markdown link target as seen from `srcDocsRel`. The single resolver
 * used by both the rewriter (to emit hrefs) and the link checker (to validate
 * routes/anchors), so the two can never disagree.
 */
export function resolveLink(raw: string, ctx: RewriteContext): ResolvedLink {
  if (hasScheme(raw)) return { kind: "external", href: raw };

  const hashIdx = raw.indexOf("#");
  const pathPart = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
  const fragment = hashIdx >= 0 ? raw.slice(hashIdx) : "";

  if (pathPart === "") return { kind: "in-page", fragment };

  const srcAbs = path.posix.join("docs", ctx.srcDocsRel);
  const srcDir = path.posix.dirname(srcAbs);
  const targetRepo = path.posix.normalize(path.posix.join(srcDir, pathPart));

  if (targetRepo.startsWith("docs/")) {
    const docsRelTarget = targetRepo.slice("docs/".length);
    if (ctx.published.has(docsRelTarget)) {
      return { kind: "internal", route: routeOf(docsRelTarget), fragment };
    }
  }

  return { kind: "repo", repoPath: targetRepo, fragment, isDir: targetRepo.endsWith("/") };
}

/** Rewrite a single link target string to its final site href. */
export function rewriteLinkTarget(raw: string, ctx: RewriteContext): string {
  const resolved = resolveLink(raw, ctx);
  switch (resolved.kind) {
    case "external":
    case "in-page":
      return raw;
    case "internal": {
      const fromRoute = routeOf(ctx.srcDocsRel);
      return routeRelative(fromRoute, resolved.route) + resolved.fragment;
    }
    case "repo": {
      const kind = resolved.isDir ? "tree" : "blob";
      return `https://github.com/${REPO_SLUG}/${kind}/${REPO_BRANCH}/${resolved.repoPath}${resolved.fragment}`;
    }
  }
}

// Matches a markdown inline link / image target: the `(target)` (with an optional
// "title") in `](target)` / `](target "title")`. Targets containing whitespace or
// `)` are not matched (rare in our docs and risky to rewrite blindly).
const LINK_RE = /\]\(\s*(<[^>]+>|[^()\s]+)(\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;

function unangle(target: string): string {
  return target.startsWith("<") && target.endsWith(">") ? target.slice(1, -1) : target;
}

/** Iterate body lines, calling `fn` only for lines outside fenced code blocks. */
function forEachProseLine(body: string, fn: (line: string) => string): string {
  const lines = body.split("\n");
  let fence: string | null = null;
  return lines
    .map((line) => {
      const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
      if (fenceMatch) {
        const marker = fenceMatch[2][0];
        if (fence === null) fence = marker;
        else if (fence === marker) fence = null;
        return line;
      }
      if (fence !== null) return line;
      return fn(line);
    })
    .join("\n");
}

/** Every inline link/image target in the body, excluding fenced code blocks. */
export function extractLinkTargets(body: string): string[] {
  const targets: string[] = [];
  forEachProseLine(body, (line) => {
    for (const m of line.matchAll(LINK_RE)) targets.push(unangle(m[1]));
    return line;
  });
  return targets;
}

/**
 * Rewrite every inline link/image target in a markdown body, skipping fenced code
 * blocks so `](...)` inside `krs` examples is never touched. Reference-definition
 * lines (`[id]: target`) are also rewritten.
 */
export function rewriteBody(body: string, ctx: RewriteContext): string {
  return forEachProseLine(body, (line) => {
    let out = line.replace(LINK_RE, (_m, target: string, title = "") => {
      return `](${rewriteLinkTarget(unangle(target), ctx)}${title})`;
    });

    // Reference-style link definitions: `[id]: target "optional title"`
    out = out.replace(
      /^(\s*\[[^\]]+\]:\s*)(\S+)(.*)$/,
      (_m, head: string, target: string, rest: string) =>
        `${head}${rewriteLinkTarget(target, ctx)}${rest}`,
    );
    return out;
  });
}
