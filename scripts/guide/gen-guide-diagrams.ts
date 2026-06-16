// Render the "hero" `.krs` snippets in docs/guide/*.md to committed SVG files
// and wire an image reference in below each one (Issue #1574).
//
// The fenced ```krs block in the markdown stays the single source of truth;
// the SVG is derived from it — no sidecar `.krs` copies to drift against
// (TPL-20260510-18). A snippet is rendered only when an HTML-comment marker
// sits directly above its fence:
//
//   <!-- render: system id=01-monolith -->
//   ```krs
//   system Shop { ... }
//   ```
//   <!-- gen:guide-diagram:01-monolith — DO NOT EDIT ... -->
//   ![system view — 01-monolith](diagrams/01-monolith.svg)
//   <!-- /gen:guide-diagram:01-monolith -->
//
// The image lives in a managed region between `gen:guide-diagram` markers
// (same arrangement as scripts/reference/gen-docs.ts) so reruns update it in
// place. SVGs go to docs/guide/diagrams/<id>.<lang>.svg; `<lang>` is `ja` for
// `*.ja.md` and `en` otherwise, so the per-language labels render to distinct
// files (TPL-20260510-11).
//
// Optional theming: `<!-- render: system id=05-styled style -->` uses the
// *next* fenced block (a `.krs.style` / css block) as the stylesheet and
// strips the snippet's `@import "*.krs.style"` line (which would otherwise
// reference a file that does not exist next to the markdown).
//
// `compile()` is deterministic, so regeneration is diff-stable. Run
//   pnpm gen:guide-diagrams           # (re)write SVGs + image refs
//   pnpm gen:guide-diagrams --check   # exit non-zero if anything is stale
// The --check mode backs the lefthook + CI drift guard.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compile, type DiagramType } from "../../packages/core/src/index.ts";

export type Lang = "en" | "ja";

const GUIDE_DIR = "docs/guide";
const DIAGRAMS_SUBDIR = "diagrams";
const VIEWS: readonly DiagramType[] = ["system", "deploy", "org"] as const;

// CommonMark: a fence is 3+ backticks or tildes, indented at most 3 spaces;
// the closing fence matches the opener's char, is at least as long, and has no
// info string. Mirrors scripts/lint/spec-structure-sync.ts.
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

interface Fence {
  /** Info string after the opening fence (e.g. "krs", "css"). */
  info: string;
  /** Snippet body (between the fences), already joined with "\n". */
  body: string;
  /** 0-based line index of the opening fence. */
  openLine: number;
  /** 0-based line index of the closing fence. */
  closeLine: number;
}

/** All fenced code blocks in `content`, in document order. */
export function scanFences(content: string): Fence[] {
  const lines = content.split("\n");
  const fences: Fence[] = [];
  let open: { char: string; length: number; line: number; info: string } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE_RE.exec(lines[i]);
    if (!m) continue;
    const marker = m[1];
    const info = m[2].trim();
    if (open === null) {
      open = { char: marker[0], length: marker.length, line: i, info };
      continue;
    }
    if (marker[0] === open.char && marker.length >= open.length && info === "") {
      fences.push({
        info: open.info,
        body: lines.slice(open.line + 1, i).join("\n"),
        openLine: open.line,
        closeLine: i,
      });
      open = null;
    }
  }
  return fences;
}

export interface RenderMarker {
  id: string;
  view: DiagramType;
  style: boolean;
  /** 0-based line index of the `<!-- render: ... -->` marker. */
  line: number;
}

const RENDER_MARKER_RE = /^<!--\s*render:\s*(\w+)\s+id=([\w-]+)(\s+style)?\s*-->$/;

/** Parse every `<!-- render: <view> id=<id> [style] -->` marker in `content`. */
export function parseRenderMarkers(content: string, file: string): RenderMarker[] {
  const markers: RenderMarker[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = RENDER_MARKER_RE.exec(lines[i].trim());
    if (!m) continue;
    const view = m[1] as DiagramType;
    if (!VIEWS.includes(view)) {
      throw new Error(`${file}:${i + 1}: unknown view "${m[1]}" (expected system | deploy | org)`);
    }
    markers.push({ view, id: m[2], style: Boolean(m[3]), line: i });
  }
  return markers;
}

export function langOf(file: string): Lang {
  return file.endsWith(".ja.md") ? "ja" : "en";
}

const IMPORT_STYLE_RE = /^\s*@import\s+"[^"]*\.krs\.style"\s*;?\s*$/;

/** Strip `@import "*.krs.style"` lines — the stylesheet is inlined via styleSource. */
function stripStyleImports(krs: string): string {
  return krs
    .split("\n")
    .filter((l) => !IMPORT_STYLE_RE.test(l))
    .join("\n");
}

export interface RenderedDiagram {
  id: string;
  /** SVG output path relative to repo root. */
  svgPath: string;
  svg: string;
}

const MARKER_NOTE = "DO NOT EDIT. Generated from the snippet above; run `pnpm gen:guide-diagrams`.";

function imageBlock(id: string, view: DiagramType, lang: Lang): string {
  const open = `<!-- gen:guide-diagram:${id} — ${MARKER_NOTE} -->`;
  const close = `<!-- /gen:guide-diagram:${id} -->`;
  const rel = `${DIAGRAMS_SUBDIR}/${id}${lang === "ja" ? ".ja" : ""}.svg`;
  return `${open}\n![${view} view — ${id}](${rel})\n${close}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The line range [start, end] (0-based, inclusive) of an existing
 * `<!-- gen:guide-diagram:<id> -->` … `<!-- /gen:guide-diagram:<id> -->`
 * region in `lines`, or null if none exists yet.
 */
function findExistingRegion(lines: string[], id: string): { start: number; end: number } | null {
  const openRe = new RegExp(`^<!-- gen:guide-diagram:${escapeRegExp(id)}\\b`);
  const close = `<!-- /gen:guide-diagram:${id} -->`;
  for (let i = 0; i < lines.length; i++) {
    if (!openRe.test(lines[i])) continue;
    for (let j = i; j < lines.length; j++) {
      if (lines[j] === close) return { start: i, end: j };
    }
  }
  return null;
}

interface FileResult {
  /** Markdown content after wiring all image regions. */
  markdown: string;
  diagrams: RenderedDiagram[];
}

interface WireOp {
  /** Sort key: the line the op touches (0-based, in original coordinates). */
  pos: number;
  /** Existing region to replace, or null to insert after `pos`. */
  region: { start: number; end: number } | null;
  blockLines: string[];
}

/**
 * Render every marked snippet in one guide file: produce the SVGs and return
 * the markdown with image regions inserted/updated. Pure (no disk writes).
 *
 * All edit positions are computed against the original line numbers, then
 * applied bottom-to-top so that inserting one image block never shifts the
 * anchor of another in the same file.
 */
export function processFile(file: string, content: string): FileResult {
  const lang = langOf(file);
  const markers = parseRenderMarkers(content, file);
  if (markers.length === 0) return { markdown: content, diagrams: [] };

  const fences = scanFences(content);
  const lines = content.split("\n");
  const diagrams: RenderedDiagram[] = [];
  const ops: WireOp[] = [];

  for (const marker of markers) {
    // The krs fence must be the first fence opening after the marker line.
    const krsFence = fences.find((f) => f.openLine > marker.line);
    if (!krsFence || krsFence.info !== "krs") {
      throw new Error(
        `${file}:${marker.line + 1}: \`<!-- render: ${marker.view} id=${marker.id} -->\` must sit directly above a \`\`\`krs block`,
      );
    }

    let styleSource: string | undefined;
    let anchorClose = krsFence.closeLine;
    if (marker.style) {
      const styleFence = fences.find((f) => f.openLine > krsFence.closeLine);
      if (!styleFence || !["css", "krs.style", "style"].includes(styleFence.info)) {
        throw new Error(
          `${file}:${marker.line + 1}: \`style\` flag requires a css / krs.style block right after the krs block`,
        );
      }
      styleSource = styleFence.body;
      anchorClose = styleFence.closeLine;
    }

    const krs = marker.style ? stripStyleImports(krsFence.body) : krsFence.body;
    const result = compile(krs, { diagramType: marker.view, theme: "light", styleSource });
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      const detail = errors.map((d) => `    - ${d.code}: ${JSON.stringify(d.params)}`).join("\n");
      throw new Error(
        `${file}: snippet "${marker.id}" failed to compile (${marker.view} view):\n${detail}`,
      );
    }

    const svgPath = `${GUIDE_DIR}/${DIAGRAMS_SUBDIR}/${marker.id}${lang === "ja" ? ".ja" : ""}.svg`;
    diagrams.push({ id: marker.id, svgPath, svg: result.svg });

    const blockLines = imageBlock(marker.id, marker.view, lang).split("\n");
    const region = findExistingRegion(lines, marker.id);
    ops.push({ pos: region ? region.start : anchorClose, region, blockLines });
  }

  // Apply bottom-to-top: a higher-line edit cannot shift a lower-line anchor.
  ops.sort((a, b) => b.pos - a.pos);
  for (const op of ops) {
    if (op.region) {
      lines.splice(op.region.start, op.region.end - op.region.start + 1, ...op.blockLines);
    } else {
      lines.splice(op.pos + 1, 0, "", ...op.blockLines);
    }
  }

  return { markdown: lines.join("\n"), diagrams };
}

function listGuideFiles(root: string): string[] {
  const dir = resolve(root, GUIDE_DIR);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => `${GUIDE_DIR}/${f}`)
    .sort();
}

export interface RegenerateResult {
  /** Guide files or SVGs whose generated output differs from disk. */
  stale: string[];
  /** Files actually written (empty when `check` is true). */
  updated: string[];
}

export function regenerate(opts: { root: string; check: boolean }): RegenerateResult {
  const stale: string[] = [];
  const updated: string[] = [];
  const seen = new Map<string, string>(); // svgPath -> source guide file

  for (const file of listGuideFiles(opts.root)) {
    const absMd = resolve(opts.root, file);
    const before = readFileSync(absMd, "utf8");
    const { markdown, diagrams } = processFile(file, before);

    for (const d of diagrams) {
      const prevOwner = seen.get(d.svgPath);
      if (prevOwner && prevOwner !== file) {
        throw new Error(`Duplicate diagram id maps to ${d.svgPath} (in ${prevOwner} and ${file})`);
      }
      seen.set(d.svgPath, file);

      const absSvg = resolve(opts.root, d.svgPath);
      const existing = readFileMaybe(absSvg);
      if (existing !== d.svg) {
        stale.push(d.svgPath);
        if (!opts.check) {
          mkdirSync(resolve(opts.root, GUIDE_DIR, DIAGRAMS_SUBDIR), { recursive: true });
          writeFileSync(absSvg, d.svg);
          updated.push(d.svgPath);
        }
      }
    }

    if (markdown !== before) {
      stale.push(file);
      if (!opts.check) {
        writeFileSync(absMd, markdown);
        updated.push(file);
      }
    }
  }

  return { stale, updated };
}

function readFileMaybe(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function main(): void {
  const check = process.argv.includes("--check");
  const root = process.cwd();
  const { stale, updated } = regenerate({ root, check });
  if (check) {
    if (stale.length > 0) {
      const list = [...new Set(stale)].map((f) => `  - ${relative(".", f)}`).join("\n");
      process.stderr.write(`Stale guide diagrams / image refs:\n${list}\n`);
      process.stderr.write("Run `pnpm gen:guide-diagrams` and commit the result.\n");
      process.exitCode = 1;
    } else {
      process.stdout.write("Guide diagrams already up to date.\n");
    }
    return;
  }
  if (updated.length > 0) {
    process.stdout.write(`Updated:\n${[...new Set(updated)].map((f) => `  - ${f}`).join("\n")}\n`);
  } else {
    process.stdout.write("Guide diagrams already up to date.\n");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
