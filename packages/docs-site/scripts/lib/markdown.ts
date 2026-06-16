// Markdown helpers shared by sync (title extraction) and link-check (anchor
// collection). Anchor slugging uses github-slugger, the same library rehype-slug
// (and therefore Starlight) uses, so validation matches the rendered page exactly.

import GithubSlugger from "github-slugger";
import { eachLine } from "./fences.ts";

/**
 * Strip the first level-1 heading from the body and return it as the page title.
 * Starlight renders the title from frontmatter, so the body must not keep its own
 * H1 (which would duplicate the heading). Returns `title: null` when there is no H1.
 */
export function extractTitle(body: string): { title: string | null; body: string } {
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#\s+(.+?)\s*$/);
    if (m) {
      const title = m[1].trim();
      lines.splice(i, 1);
      // Drop a single blank line left behind so the body starts cleanly.
      if (lines[i] === "") lines.splice(i, 1);
      return { title, body: lines.join("\n") };
    }
  }
  return { title: null, body };
}

/** Reduce inline markdown in heading text to its rendered text before slugging. */
function headingText(raw: string): string {
  return raw
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](url) -> text
    .replace(/[`*_~]/g, "")
    .trim();
}

/**
 * All anchor ids reachable on the published page: GitHub-style heading slugs plus
 * explicit `<a id>` / `<a name>` anchors. `title` (the stripped H1) is included
 * because Starlight renders it as an `<h1>` with its own slug.
 */
export function collectAnchors(body: string, title: string | null): Set<string> {
  const anchors = new Set<string>();
  const slugger = new GithubSlugger();
  if (title) slugger.slug(headingText(title));

  for (const { line, isProse } of eachLine(body)) {
    if (!isProse) continue;

    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading) anchors.add(slugger.slug(headingText(heading[1])));

    for (const m of line.matchAll(/<a\s+[^>]*?(?:id|name)="([^"]+)"/g)) {
      anchors.add(m[1]);
    }
  }

  return anchors;
}
