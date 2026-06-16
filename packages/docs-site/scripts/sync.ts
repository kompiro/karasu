// Generate the Starlight content collection from docs/ (the single source of
// truth). For each published page: strip the H1 into a Starlight frontmatter
// `title`, rewrite repo-relative links to site/GitHub URLs, and write the result
// under src/content/docs/. Output is gitignored — re-run `pnpm run sync`.

import fs from "node:fs";
import path from "node:path";
import { GALLERY_PAGES, type Locale, resolveEntry } from "./lib/examples-manifest.ts";
import { examplePageMarkdown, indexPageMarkdown } from "./lib/gallery-pages.ts";
import { extractTitle } from "./lib/markdown.ts";
import { renderDiagram, type RenderedDiagram } from "./lib/render-examples.ts";
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

function writeContent(relPath: string, content: string): void {
  const dest = path.join(CONTENT_DIR, relPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
}

/**
 * Render every gallery example at build time and write its en/ja pages plus the
 * index. examples/ stays the single source of truth; the SVGs are derived here
 * (never committed). Renders are cached per entry path, so locale-shared sources
 * render once while localized pairs (e.g. getting started) render both variants.
 */
async function generateGallery(): Promise<number> {
  writeContent("examples.md", indexPageMarkdown("en"));
  writeContent("ja/examples.md", indexPageMarkdown("ja"));

  // Render once per distinct entry path; locale-shared sources resolve to the
  // same path and are reused, while localized pairs (e.g. getting started) render
  // their en/ja variants.
  const cache = new Map<string, RenderedDiagram>();
  const render = async (entry: string): Promise<RenderedDiagram> => {
    const cached = cache.get(entry);
    if (cached) return cached;
    const rendered = await renderDiagram(entry);
    cache.set(entry, rendered);
    return rendered;
  };
  const renderPage = async (page: (typeof GALLERY_PAGES)[number], locale: Locale) =>
    Promise.all(page.diagrams.map((d) => render(resolveEntry(d.entry, locale))));

  for (const page of GALLERY_PAGES) {
    writeContent(
      `examples/${page.slug}.md`,
      examplePageMarkdown(page, await renderPage(page, "en"), "en"),
    );
    writeContent(
      `ja/examples/${page.slug}.md`,
      examplePageMarkdown(page, await renderPage(page, "ja"), "ja"),
    );
  }
  return GALLERY_PAGES.length;
}

async function main(): Promise<void> {
  const sources = listSources();
  const published = publishedSet(sources);

  fs.rmSync(CONTENT_DIR, { recursive: true, force: true });

  for (const { docsRel, absPath } of sources) {
    const raw = fs.readFileSync(absPath, "utf8");
    const { title, body } = extractTitle(raw);
    const rewritten = rewriteBody(body, { srcDocsRel: docsRel, published });
    const frontmatter = `---\ntitle: ${yamlQuote(title ?? fallbackTitle(docsRel))}\n---\n\n`;
    writeContent(contentPathOf(docsRel), frontmatter + rewritten.replace(/\s*$/, "") + "\n");
  }

  copyHomePages();
  const galleryCount = await generateGallery();

  process.stdout.write(
    `✓ Synced ${sources.length} pages + ${HOME_PAGES.length} home pages + ${galleryCount} example pages from docs/ into the docs site.\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
