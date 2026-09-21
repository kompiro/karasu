// Generate `packages/core/src/shapes/builtin-icons.generated.ts` from the
// built-in icon set in `packages/core/icons/` (Issue #2802).
//
// The `.svg` files and `icons.json` stay the source of truth (ADR-9005: an
// icon must remain previewable as a file). This script turns that set into a
// plain TypeScript module so that core registers its own built-in icons on
// import, on every drawing surface — browser app, `karasu render`, the VS
// Code extension host, the LSP, Cloudflare Workers — with no per-bundler
// `.svg` loader and no host-side registration call (TPL-2802).
//
// Run `pnpm gen:icons` to (re)write the module; `pnpm gen:icons --check`
// exits non-zero when the committed module is stale. The core vitest suite
// (`builtin-icons.generated.test.ts`) mirrors the check so CI catches drift
// even when nobody runs the script.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const ICONS_DIR = "packages/core/icons";
export const MANIFEST_FILE = `${ICONS_DIR}/icons.json`;
export const OUTPUT_FILE = "packages/core/src/shapes/builtin-icons.generated.ts";

interface IconManifest {
  icons: { name: string; file: string }[];
}

export interface BuiltinIconSource {
  name: string;
  svg: string;
}

/** Read the manifest and every SVG it names, in manifest order. */
export function readBuiltinIconSources(repoRoot: string): BuiltinIconSource[] {
  const manifest = JSON.parse(
    readFileSync(resolve(repoRoot, MANIFEST_FILE), "utf8"),
  ) as IconManifest;
  return manifest.icons.map((entry) => ({
    name: entry.name,
    svg: readFileSync(resolve(repoRoot, ICONS_DIR, entry.file), "utf8"),
  }));
}

/**
 * A string literal spelled the way the repo formatter (oxfmt, prettier rules)
 * would spell it: the quote that needs fewer escapes wins, double on a tie.
 * SVG markup is full of `"` attribute quotes, so it lands in single quotes.
 * Emitting the formatter's own choice keeps `format:check` green without
 * running the formatter over a generated file.
 */
export function quote(value: string): string {
  const doubles = (value.match(/"/g) ?? []).length;
  const singles = (value.match(/'/g) ?? []).length;
  const json = JSON.stringify(value);
  if (doubles <= singles) return json;
  const inner = json.slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'");
  return `'${inner}'`;
}

/** The module text for a given icon set. Pure, so the drift test can call it. */
export function renderModule(sources: readonly BuiltinIconSource[]): string {
  const entries = sources
    .map((s) => `  {\n    name: ${quote(s.name)},\n    svg: ${quote(s.svg)},\n  },`)
    .join("\n");
  return `// GENERATED FILE — do not edit by hand.
//
// Source of truth: \`packages/core/icons/icons.json\` and the \`.svg\` files
// beside it. Regenerate with \`pnpm gen:icons\`; \`pnpm gen:icons --check\`
// and \`builtin-icons.generated.test.ts\` fail when this file is stale.
//
// Why a generated module exists at all: core registers the built-in icon
// set on import (\`builtin-icons.ts\`), so every drawing surface resolves
// \`shape: url("<name>")\` and icon display mode identically without a
// host-side registration call (Issue #2802, TPL-2802). ADR-9005 keeps the
// \`.svg\` files as the editable originals; this file is a build product.

export interface BuiltinIconSource {
  /** Icon name — the \`url("<name>")\` argument and the manifest \`name\`. */
  readonly name: string;
  /** The full \`.svg\` file content, as \`svg-icon-loader\` parses it. */
  readonly svg: string;
}

export const BUILTIN_ICON_SOURCES: readonly BuiltinIconSource[] = [
${entries}
];
`;
}

function main(argv: string[]): number {
  const repoRoot = resolve(import.meta.dirname, "../..");
  const check = argv.includes("--check");
  const expected = renderModule(readBuiltinIconSources(repoRoot));
  const outPath = resolve(repoRoot, OUTPUT_FILE);

  if (check) {
    let actual: string | null = null;
    try {
      actual = readFileSync(outPath, "utf8");
    } catch {
      actual = null;
    }
    if (actual !== expected) {
      process.stderr.write(
        `${OUTPUT_FILE} is stale — run \`pnpm gen:icons\` and commit the result.\n`,
      );
      return 1;
    }
    process.stdout.write(`${OUTPUT_FILE} is up to date.\n`);
    return 0;
  }

  writeFileSync(outPath, expected);
  process.stdout.write(`wrote ${OUTPUT_FILE}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
