// Generate the Starlight content collection from docs/ (the single source of
// truth). For each published page: strip the H1 into a Starlight frontmatter
// `title`, rewrite repo-relative links to site/GitHub URLs, and write the result
// under src/content/docs/. Output is gitignored — re-run `pnpm run sync`.

import fs from "node:fs";
import path from "node:path";
import { extractTitle } from "./lib/markdown.ts";
import { rewriteBody } from "./lib/rewrite.ts";
import { contentPathOf, slugOf } from "./lib/site-map.ts";
import { CONTENT_DIR, listSources, PKG_ROOT, publishedSet } from "./sources.ts";

// Hand-authored splash home pages (committed under home/), copied to the locale
// roots. The existing landing content lives here so the generated content dir can
// stay fully gitignored.
const HOME_PAGES: ReadonlyArray<{ template: string; out: string }> = [
  { template: "en.md", out: "index.md" },
  { template: "ja.md", out: "ja/index.md" },
];

function copyHomePages(): void {
  for (const { template, out } of HOME_PAGES) {
    const src = path.join(PKG_ROOT, "home", template);
    const dest = path.join(CONTENT_DIR, out);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

/** Fallback title from the slug when a doc has no H1 (e.g. "spec/syntax" -> "syntax"). */
function fallbackTitle(docsRel: string): string {
  const leaf = slugOf(docsRel).split("/").pop() ?? docsRel;
  return leaf.replace(/[-_]/g, " ");
}

function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function main(): void {
  const sources = listSources();
  const published = publishedSet(sources);

  fs.rmSync(CONTENT_DIR, { recursive: true, force: true });

  for (const { docsRel, absPath } of sources) {
    const raw = fs.readFileSync(absPath, "utf8");
    const { title, body } = extractTitle(raw);
    const rewritten = rewriteBody(body, { srcDocsRel: docsRel, published });
    const frontmatter = `---\ntitle: ${yamlQuote(title ?? fallbackTitle(docsRel))}\n---\n\n`;

    const outPath = path.join(CONTENT_DIR, contentPathOf(docsRel));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, frontmatter + rewritten.replace(/\s*$/, "") + "\n");
  }

  copyHomePages();

  process.stdout.write(
    `✓ Synced ${sources.length} pages + ${HOME_PAGES.length} home pages from docs/ into the docs site.\n`,
  );
}

main();
