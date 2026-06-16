// Link rewriting + classification, the main technical risk of the docs site
// (issue #1575). Repo-relative links in docs/ are resolved to one of:
//   - an in-site route (route-relative URL, base-agnostic) for published pages,
//   - a GitHub blob/tree URL for everything else under the repo, or
//   - left untouched for external / scheme / in-page-anchor links.
// Explicit `<a id>` anchors and `#fragment`s are always preserved. Pure (no fs).

import path from "node:path";
import { eachLine } from "./fences.ts";
import { REPO_BRANCH, REPO_SLUG, routeOf, routeRelative } from "./site-map.ts";

interface RewriteContext {
  /** docs-relative path of the source document, e.g. "guide/05-communicating-diagrams.md" */
  srcDocsRel: string;
  /** docs-relative paths actually published as site pages (en + existing ja siblings) */
  published: ReadonlySet<string>;
}

// `suffix` is everything from the first `?` or `#` (query + fragment), preserved
// verbatim on rewrite so it never pollutes the resolved path.
type ResolvedLink =
  | { kind: "external"; href: string }
  | { kind: "in-page"; suffix: string }
  | { kind: "internal"; route: string; suffix: string }
  | { kind: "repo"; repoPath: string; suffix: string; isDir: boolean };

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

  const splitIdx = raw.search(/[#?]/);
  const pathPart = splitIdx >= 0 ? raw.slice(0, splitIdx) : raw;
  const suffix = splitIdx >= 0 ? raw.slice(splitIdx) : "";

  if (pathPart === "") return { kind: "in-page", suffix };

  const srcAbs = path.posix.join("docs", ctx.srcDocsRel);
  const srcDir = path.posix.dirname(srcAbs);
  const targetRepo = path.posix.normalize(path.posix.join(srcDir, pathPart));

  if (targetRepo.startsWith("docs/")) {
    const docsRelTarget = targetRepo.slice("docs/".length);
    if (ctx.published.has(docsRelTarget)) {
      return { kind: "internal", route: routeOf(docsRelTarget), suffix };
    }
  }

  return { kind: "repo", repoPath: targetRepo, suffix, isDir: targetRepo.endsWith("/") };
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
      return routeRelative(fromRoute, resolved.route) + resolved.suffix;
    }
    case "repo": {
      const kind = resolved.isDir ? "tree" : "blob";
      return `https://github.com/${REPO_SLUG}/${kind}/${REPO_BRANCH}/${resolved.repoPath}${resolved.suffix}`;
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

/** Every inline link/image target in the body, excluding fenced code blocks. */
export function extractLinkTargets(body: string): string[] {
  const targets: string[] = [];
  for (const { line, isProse } of eachLine(body)) {
    if (!isProse) continue;
    for (const m of line.matchAll(LINK_RE)) targets.push(unangle(m[1]));
  }
  return targets;
}

function rewriteLine(line: string, ctx: RewriteContext): string {
  let out = line.replace(LINK_RE, (_m, target: string, title = "") => {
    return `](${rewriteLinkTarget(unangle(target), ctx)}${title})`;
  });

  // Reference-style link definitions: `[id]: target "optional title"`
  out = out.replace(
    /^(\s*\[[^\]]+\]:\s*)(\S+)(.*)$/,
    (_m, head: string, target: string, rest: string) =>
      `${head}${rewriteLinkTarget(unangle(target), ctx)}${rest}`,
  );
  return out;
}

/**
 * Rewrite every inline link/image target in a markdown body, skipping fenced code
 * blocks so `](...)` inside `krs` examples is never touched. Reference-definition
 * lines (`[id]: target`) are also rewritten.
 */
export function rewriteBody(body: string, ctx: RewriteContext): string {
  const out: string[] = [];
  for (const { line, isProse } of eachLine(body)) {
    out.push(isProse ? rewriteLine(line, ctx) : line);
  }
  return out.join("\n");
}
