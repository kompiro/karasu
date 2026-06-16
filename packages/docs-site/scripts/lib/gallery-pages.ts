// Build the Starlight markdown for the Examples gallery from the manifest + the
// rendered diagrams. Each per-view SVG is embedded as a self-contained data-URI
// <img> so the (id-bearing) SVGs never collide when several share a page, and so
// the markup is base-path independent. Pure (no fs) — unit tested.

import type { DiagramType } from "../../../core/src/index.ts";
import {
  GALLERY_PAGES,
  GROUP_LABELS,
  GROUP_ORDER,
  type GalleryPage,
  type LocalizedString,
} from "./examples-manifest.ts";
import type { RenderedDiagram } from "./render-examples.ts";
import { REPO_BRANCH, REPO_SLUG } from "./site-map.ts";

type Locale = "en" | "ja";

const VIEW_LABEL: Record<DiagramType, LocalizedString> = {
  system: { en: "System view", ja: "System ビュー" },
  deploy: { en: "Deploy view", ja: "Deploy ビュー" },
  org: { en: "Org view", ja: "Org ビュー" },
};

function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function dataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function figures(rendered: RenderedDiagram, locale: Locale): string {
  return rendered.views
    .map((v) => {
      const label = VIEW_LABEL[v.type][locale];
      return `<figure class="krs-diagram">\n<figcaption>${label}</figcaption>\n<img alt="${label}" src="${dataUri(v.svg)}" />\n</figure>`;
    })
    .join("\n\n");
}

function sourceFence(source: string): string {
  const body = source.replace(/\s+$/, "");
  // CommonMark variable-length fence: use more backticks than the longest run in
  // the source, so a ``` inside a comment/string can't close the fence early.
  const longestRun = Math.max(0, ...[...body.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}krs\n${body}\n${fence}`;
}

function githubLink(page: GalleryPage, locale: Locale): string {
  const text = locale === "ja" ? "GitHub でソースを見る" : "View the source on GitHub";
  return `[${text}](https://github.com/${REPO_SLUG}/tree/${REPO_BRANCH}/${page.githubDir})`;
}

/** Markdown for a single example page (one diagram), or the feature-samples page (many). */
export function examplePageMarkdown(
  page: GalleryPage,
  rendered: readonly RenderedDiagram[],
  locale: Locale,
): string {
  const out = [`---\ntitle: ${yamlQuote(page.title[locale])}\n---\n`, page.blurb[locale], ""];
  out.push(githubLink(page, locale), "");

  if (page.diagrams.length === 1) {
    out.push(figures(rendered[0], locale), "");
    out.push(locale === "ja" ? "## ソース" : "## Source", "", sourceFence(rendered[0].source));
  } else {
    page.diagrams.forEach((diagram, i) => {
      const caption = diagram.caption?.[locale];
      if (caption) out.push(`## ${caption}`, "");
      out.push(figures(rendered[i], locale), "");
      out.push(sourceFence(rendered[i].source), "");
    });
  }
  return `${out.join("\n")}\n`;
}

/** Markdown for the gallery index, grouped like examples/README.md. */
export function indexPageMarkdown(locale: Locale): string {
  const intro =
    locale === "ja"
      ? "`.krs` のサンプルと、そこから karasu が生成する図。ソースはすべて `examples/` が正典で、図はビルド時に生成される。"
      : "Sample `.krs` projects and the diagrams karasu renders from them. `examples/` is the single source of truth; the diagrams are rendered at build time.";

  const groups = GROUP_ORDER.map((group) => {
    const items = GALLERY_PAGES.filter((p) => p.group === group)
      .map((p) => `- [${p.title[locale]}](./${p.slug}/) — ${p.blurb[locale]}`)
      .join("\n");
    return `## ${GROUP_LABELS[group][locale]}\n\n${items}`;
  }).join("\n\n");

  return `---\ntitle: ${yamlQuote("Examples")}\n---\n\n${intro}\n\n${groups}\n`;
}
