// Generate the machine-derived tables in `docs/spec/*.md` (and the `.ja.md`
// counterparts) from `packages/core/src/builtins/reference-data.ts`.
//
// Each generated table lives between a pair of HTML-comment markers:
//
//   <!-- gen:reference:<id> — DO NOT EDIT ... -->
//   | ... a markdown table ... |
//   <!-- /gen:reference:<id> -->
//
// Everything outside the markers — the surrounding prose — stays
// hand-written. This is the same arrangement as the auto-generated
// `docs/adr/effective.md`, scoped down to individual table regions so the
// docs stay readable. See docs/adr/20260512-03-reference-data-single-source.md (Issue #1328).
//
// Run `pnpm gen:reference` to (re)write the tables; `pnpm gen:reference
// --check` exits non-zero if anything is stale (used by lefthook + CI).

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { REFERENCE_DATA } from "../../packages/core/src/builtins/reference-data.ts";

export type Locale = "en" | "ja";

export interface TableSpec {
  /** Identifier used in the `<!-- gen:reference:<id> -->` markers. */
  id: string;
  /** Source file per locale, relative to the repo root. */
  file: Record<Locale, string>;
  /** Column headers per locale. */
  headers: Record<Locale, string[]>;
  /** The table body for a locale: one array of cell strings per row. */
  rows: (locale: Locale) => string[][];
}

const code = (s: string): string => `\`${s}\``;

/** Render a `canContain` list for the "May contain" column — `` `a`, `b` `` or an em dash when empty. */
const mayContain = (kinds: string[]): string =>
  kinds.length > 0 ? kinds.map(code).join(", ") : "—";

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Approximate terminal/source column width: characters in the common
 * East-Asian wide ranges (Hiragana, Katakana, CJK ideographs, fullwidth
 * forms) count as 2. Used only to pad the table separator row so the
 * generated markdown lines up roughly with the header — markdown itself
 * is indifferent to it.
 */
function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0x303e) ||
      (cp >= 0x3041 && cp <= 0x33ff) ||
      (cp >= 0x3400 && cp <= 0x4dbf) ||
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0xa000 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6);
    w += wide ? 2 : 1;
  }
  return w;
}

export const TABLES: TableSpec[] = [
  {
    id: "annotations",
    file: {
      en: "docs/spec/tags-annotations.md",
      ja: "docs/spec/tags-annotations.ja.md",
    },
    headers: {
      en: ["Annotation", "Meaning", "Default rendering"],
      ja: ["アノテーション", "意味", "デフォルト描画"],
    },
    rows: (locale) =>
      REFERENCE_DATA.annotations.map((a) => [
        code(`@${a.name}`),
        a.description[locale],
        a.defaultRendering[locale],
      ]),
  },
  {
    id: "shapes",
    file: { en: "docs/spec/style.md", ja: "docs/spec/style.ja.md" },
    headers: {
      en: ["Keyword", "Shape", "Typical use"],
      ja: ["キーワード", "形状", "主な用途"],
    },
    rows: (locale) =>
      REFERENCE_DATA.shapes.map((s) => [code(s.name), s.description[locale], s.typicalUse[locale]]),
  },
  {
    id: "tags",
    file: {
      en: "docs/spec/tags-annotations.md",
      ja: "docs/spec/tags-annotations.ja.md",
    },
    headers: {
      en: ["Tag", "Meaning", "Effect on default rendering"],
      ja: ["タグ", "意味", "デフォルト描画への影響"],
    },
    rows: (locale) =>
      REFERENCE_DATA.tags.map((t) => [
        code(`[${t.name}]`),
        t.description[locale],
        t.defaultEffect[locale],
      ]),
  },
  {
    id: "client-form-factor-tags",
    file: { en: "docs/spec/syntax.md", ja: "docs/spec/syntax.ja.md" },
    headers: {
      en: ["Tag", "Form factor"],
      ja: ["タグ", "Form factor"],
    },
    rows: (locale) =>
      REFERENCE_DATA.tags.flatMap((t) =>
        t.formFactor ? [[code(`[${t.name}]`), t.formFactor[locale]]] : [],
      ),
  },
  {
    id: "deploy-unit-kinds",
    file: { en: "docs/spec/syntax.md", ja: "docs/spec/syntax.ja.md" },
    headers: {
      en: ["Keyword", "Description", "Properties"],
      ja: ["キーワード", "説明", "プロパティ"],
    },
    rows: (locale) =>
      REFERENCE_DATA.deployUnitKinds.map((k) => [
        code(k.kind),
        k.description[locale],
        k.properties
          .filter((p) => p !== "label")
          .map(code)
          .join(", "),
      ]),
  },
  {
    id: "node-kinds-logical",
    file: { en: "docs/spec/syntax.md", ja: "docs/spec/syntax.ja.md" },
    headers: {
      en: ["Keyword", "Meaning", "May contain"],
      ja: ["キーワード", "意味", "含むことができるもの"],
    },
    rows: (locale) =>
      REFERENCE_DATA.nodeKinds.flatMap((k) =>
        k.layer === "logical"
          ? [[code(k.kind), k.description[locale], mayContain(k.canContain)]]
          : [],
      ),
  },
  {
    id: "selector-specificity",
    file: { en: "docs/spec/style.md", ja: "docs/spec/style.ja.md" },
    headers: {
      en: ["Selector", "Example", "Score"],
      ja: ["セレクタ", "例", "スコア"],
    },
    rows: (locale) =>
      REFERENCE_DATA.selectorSpecificity.map((s) => [
        s.selector[locale],
        code(s.example),
        String(s.score),
      ]),
  },
  {
    id: "node-kinds-infra",
    file: { en: "docs/spec/syntax.md", ja: "docs/spec/syntax.ja.md" },
    headers: {
      en: ["Keyword", "Layer", "Intended use", "May contain"],
      ja: ["キーワード", "階層", "用途", "含むことができるもの"],
    },
    rows: (locale) =>
      REFERENCE_DATA.nodeKinds.flatMap((k) =>
        k.layer !== "logical" && k.infraLayerLabel && k.infraIntendedUse
          ? [
              [
                code(k.kind),
                k.infraLayerLabel[locale],
                k.infraIntendedUse[locale],
                mayContain(k.canContain),
              ],
            ]
          : [],
      ),
  },
];

const MARKER_NOTE =
  "DO NOT EDIT. Generated from packages/core/src/builtins/reference-data.ts; run `pnpm gen:reference`.";

function renderTable(headers: string[], rows: string[][]): string {
  const headerLine = `| ${headers.join(" | ")} |`;
  const sepLine = `|${headers.map((h) => "-".repeat(displayWidth(h) + 2)).join("|")}|`;
  const bodyLines = rows.map((r) => `| ${r.join(" | ")} |`);
  return [headerLine, sepLine, ...bodyLines].join("\n");
}

export function blockFor(spec: TableSpec, locale: Locale): string {
  const open = `<!-- gen:reference:${spec.id} — ${MARKER_NOTE} -->`;
  const close = `<!-- /gen:reference:${spec.id} -->`;
  return `${open}\n${renderTable(spec.headers[locale], spec.rows(locale))}\n${close}`;
}

function markerRegex(id: string): RegExp {
  const e = escapeRegExp(id);
  return new RegExp(
    `<!-- gen:reference:${e}\\b[\\s\\S]*?-->[\\s\\S]*?<!-- /gen:reference:${e} -->`,
  );
}

/** Replace the marked region for `spec`/`locale` inside `content`. Throws if the markers are missing. */
export function applyBlock(content: string, spec: TableSpec, locale: Locale): string {
  const re = markerRegex(spec.id);
  if (!re.test(content)) {
    throw new Error(`gen:reference:${spec.id} markers not found in ${spec.file[locale]}`);
  }
  return content.replace(re, blockFor(spec, locale));
}

export interface RegenerateResult {
  /** Files whose generated region differs from what's on disk. */
  stale: string[];
  /** Files actually written (empty when `check` is true). */
  updated: string[];
}

export function regenerate(opts: { root: string; check: boolean }): RegenerateResult {
  const stale: string[] = [];
  const updated: string[] = [];
  for (const spec of TABLES) {
    for (const locale of ["en", "ja"] as const) {
      const path = resolve(opts.root, spec.file[locale]);
      const before = readFileSync(path, "utf8");
      const after = applyBlock(before, spec, locale);
      if (before === after) continue;
      stale.push(spec.file[locale]);
      if (!opts.check) {
        writeFileSync(path, after);
        updated.push(spec.file[locale]);
      }
    }
  }
  return { stale, updated };
}

function main(): void {
  const check = process.argv.includes("--check");
  const { stale, updated } = regenerate({ root: process.cwd(), check });
  if (check) {
    if (stale.length > 0) {
      process.stderr.write(`Stale generated tables:\n${stale.map((f) => `  - ${f}`).join("\n")}\n`);
      process.stderr.write("Run `pnpm gen:reference` and commit the result.\n");
      process.exitCode = 1;
    }
    return;
  }
  if (updated.length > 0) {
    process.stdout.write(`Updated:\n${updated.map((f) => `  - ${f}`).join("\n")}\n`);
  } else {
    process.stdout.write("Reference docs already up to date.\n");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
