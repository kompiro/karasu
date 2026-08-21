// The HTML shell every PoC report was rewriting by hand (Issue #2419): page
// styles, a header carrying the provenance of the run, and the before/after
// pair layout that is the whole point of most reports.
//
// The output is deliberately one self-contained file — inline styles, inline
// SVG, images as data URIs, no external subresource. A report gets opened from
// a file:// path, published as a private Claude Artifact, or attached to an
// issue; anything fetched over the network would be broken in at least one of
// those, and the Artifact sandbox blocks it outright.
//
// See reports/README.md for the surrounding convention.

/** One piece of artwork in a report: inline SVG, or a `dataUri()` image. */
export interface Pane {
  /** Column heading — "before" / "after" for a comparison, otherwise a name. */
  label: string;
  /** Inline SVG markup. Mutually exclusive with `image`. */
  svg?: string;
  /** Image URL, normally from `dataUri()`. Mutually exclusive with `svg`. */
  image?: string;
  /**
   * Backdrop behind the artwork. Diagrams compiled with the default dark theme
   * are unreadable on the light card, so this defaults to "dark"; pass "light"
   * for anything rendered with `theme: "light"`.
   */
  background?: "dark" | "light";
  /** Optional line under the artwork — settings, timings, caveats. */
  note?: string;
}

export interface ReportSection {
  /** Heading. Omit for an untitled lead-in block. */
  title?: string;
  /** Anchor id. Defaults to a slug of `title`. */
  id?: string;
  /** Raw HTML — compose with `pair()` / `pane()` and `escapeHtml()`. */
  body: string;
}

export interface ReportPageOptions {
  title: string;
  /** Document language. Reports are usually written in Japanese. */
  lang?: string;
  /** One line under the title — what the run was trying to find out. */
  subtitle?: string;
  /** Provenance pills: branch, date, issue. Rendered as plain text. */
  meta?: readonly string[];
  sections: readonly ReportSection[];
}

const STYLES = `
:root {
  --bg: #FAFAF8; --card: #FFFFFF; --ink: #1F2933; --muted: #5B6672;
  --line: #E3E1DC; --accent: #0F4C81; --dark: #0F172A;
  --mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font-family: "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", system-ui, sans-serif;
  line-height: 1.75; font-size: 15px;
}
header { background: linear-gradient(135deg, #0F172A 0%, #1E3A5F 100%); color: #E2E8F0; padding: 44px 24px 36px; }
header .wrap, main { max-width: 1040px; margin: 0 auto; padding: 0 8px; }
header h1 { margin: 0 0 8px; font-size: 26px; letter-spacing: .02em; }
header p { margin: 4px 0; color: #94A3B8; font-size: 13.5px; }
header .meta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; font-size: 12.5px; }
header .meta span { border: 1px solid #334155; border-radius: 999px; padding: 2px 12px; color: #CBD5E1; }
main { padding: 36px 8px 80px; }
h2 { font-size: 20px; margin: 48px 0 16px; padding-bottom: 8px; border-bottom: 2px solid var(--accent); color: var(--accent); }
h2:first-of-type { margin-top: 8px; }
h3 { font-size: 16.5px; margin: 28px 0 10px; }
p { margin: 10px 0; }
a { color: var(--accent); }
code { font-family: var(--mono); font-size: 12.5px; background: #EFEDE8; border-radius: 4px; padding: 1px 6px; }
pre { background: var(--dark); color: #E2E8F0; border-radius: 8px; padding: 14px 18px; overflow-x: auto; font-size: 12.5px; line-height: 1.6; }
pre code { background: none; color: inherit; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 13.5px; background: var(--card); }
th, td { border: 1px solid var(--line); padding: 7px 12px; text-align: left; vertical-align: top; }
th { background: #F1EFEA; font-weight: 600; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
@media (max-width: 760px) { .pair { grid-template-columns: 1fr; } }
.pane { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px; margin: 16px 0; }
.pair .pane { margin: 0; }
.pane .label { font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
.pane .art { border-radius: 6px; overflow: hidden; }
.pane .art.dark { background: var(--dark); }
.pane .art.light { background: #FFFFFF; border: 1px solid var(--line); }
.pane svg, .pane img { width: 100%; height: auto; display: block; }
.pane .note { font-size: 12.5px; color: var(--muted); margin-top: 8px; }
figcaption { font-size: 13px; color: var(--muted); margin-top: 10px; }
`.trim();

/** Escapes text for interpolation into element content or a quoted attribute. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Embeds binary content in the document. Keeping images inline is what lets a
 * report be moved around as a single file.
 */
export function dataUri(bytes: Uint8Array, mime = "image/png"): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

/** A single full-width pane. */
export function pane(options: Pane): string {
  return `<figure class="pane">\n${paneBody(options)}\n</figure>`;
}

/**
 * Two panes side by side (stacked below 760px) — the before/after comparison a
 * PoC exists to produce. `caption` describes what differs between them.
 */
export function pair(before: Pane, after: Pane, caption?: string): string {
  const cells =
    `<div class="pair">\n<figure class="pane">\n${paneBody(before)}\n</figure>\n` +
    `<figure class="pane">\n${paneBody(after)}\n</figure>\n</div>`;
  return caption ? `${cells}\n<figcaption>${escapeHtml(caption)}</figcaption>` : cells;
}

/**
 * Rewrites every id and same-document reference in an inlined SVG to carry
 * `prefix`.
 *
 * Two compiled diagrams share their generated ids (`arrow-0`, clip paths, …),
 * and once both are inlined in one document the second one's `url(#arrow-0)`
 * resolves to the *first* pane's definition — the "after" pane silently draws
 * the "before" pane's arrowheads, which reads as "nothing changed" in exactly
 * the comparison a report exists to make.
 */
function namespaceSvgIds(svg: string, prefix: string): string {
  return svg
    .replaceAll(/\bid="([^"]*)"/g, `id="${prefix}$1"`)
    .replaceAll(/url\(#([^)]*)\)/g, `url(#${prefix}$1)`)
    .replaceAll(/\b(xlink:href|href)="#([^"]*)"/g, `$1="#${prefix}$2"`);
}

/** Feeds `namespaceSvgIds`. Deterministic per generator run, which is enough. */
let paneSequence = 0;

function paneBody({ label, svg, image, background = "dark", note }: Pane): string {
  if ((svg === undefined) === (image === undefined)) {
    throw new Error(`pane "${label}": pass exactly one of \`svg\` or \`image\``);
  }
  paneSequence += 1;
  const art =
    svg === undefined
      ? `<img alt="${escapeHtml(label)}" src="${escapeHtml(image ?? "")}">`
      : namespaceSvgIds(svg, `p${paneSequence}-`);
  const lines = [
    `<div class="label">${escapeHtml(label)}</div>`,
    `<div class="art ${background}">${art}</div>`,
  ];
  if (note) lines.push(`<div class="note">${escapeHtml(note)}</div>`);
  return lines.join("\n");
}

/**
 * Anchor id from a heading. ASCII-only, because a Japanese heading would
 * percent-encode into an unreadable fragment — those fall back to the section
 * index, and a report that wants a stable anchor sets `id` explicitly.
 */
function slug(title: string, index: number): string {
  const ascii = title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
  return ascii || `section-${index + 1}`;
}

/**
 * The header and the sections: everything that is the report itself, with no
 * document skeleton around it. Shared by the two output forms so they can
 * never drift apart in what they actually show.
 */
function reportContent({ title, subtitle, meta = [], sections }: ReportPageOptions): string {
  const pills = meta.map((m) => `<span>${escapeHtml(m)}</span>`).join("\n");
  // Two sections can share a heading ("Results" twice); a duplicated anchor
  // would send every deep link to the first one, so repeats fall back to the
  // positional id.
  const taken = new Set<string>();
  const body = sections
    .map((section, index) => {
      if (!section.title) return section.body;
      const preferred = section.id ?? slug(section.title, index);
      const id = taken.has(preferred) ? `section-${index + 1}` : preferred;
      taken.add(id);
      return `<h2 id="${escapeHtml(id)}">${escapeHtml(section.title)}</h2>\n${section.body}`;
    })
    .join("\n\n");

  return `<header>
  <div class="wrap">
    <h1>${escapeHtml(title)}</h1>
${subtitle ? `    <p>${escapeHtml(subtitle)}</p>\n` : ""}${
    pills ? `    <div class="meta">\n${pills}\n    </div>\n` : ""
  }  </div>
</header>
<main>
${body}
</main>`;
}

/** Renders the complete, self-contained report document. */
export function reportPage(options: ReportPageOptions): string {
  const { title, lang = "ja" } = options;

  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${STYLES}
</style>
</head>
<body>
${reportContent(options)}
</body>
</html>
`;
}

/**
 * The same report for a host that supplies the document skeleton itself, which
 * is how a report is published as a private Claude Artifact (Issue #2436): the
 * content is wrapped in `<!doctype html>…<body>` at publish time, so handing it
 * a complete document would nest one document inside another.
 *
 * `<title>` comes first because the host reads it out of the head of the file,
 * and the styles stay inline because the publish sandbox refuses every external
 * host. `lang` is ignored here: the `<html>` element belongs to the host.
 */
export function reportFragment(options: ReportPageOptions): string {
  return `<title>${escapeHtml(options.title)}</title>
<style>
${STYLES}
</style>
${reportContent(options)}
`;
}
