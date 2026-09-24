// Generate `packages/core/src/shapes/builtin-icons.generated.ts` from the
// built-in icon set in `packages/core/icons/` (Issue #2802).
//
// The `.svg` files and `icons.json` stay the source of truth (ADR-9005): an
// icon must remain openable as a file to be designed and previewed. This
// script turns that set into a plain TypeScript module so core can register
// its own built-in icons on import, on every drawing surface — browser app,
// `karasu render`, the VS Code extension host, the LSP, Cloudflare Workers —
// with no per-bundler `.svg` loader and no host-side registration call
// (TPL-2802).
//
// Run `pnpm gen:icons` to (re)write the module; `pnpm gen:icons --check`
// exits non-zero when the committed module is stale. `gen-builtin-icons.test.ts`
// mirrors that check in CI, and lefthook runs it on push.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { IconManifest } from "../../packages/core/src/renderer/icon-manifest.ts";

export const ICONS_DIR = "packages/core/icons";
export const MANIFEST_FILE = `${ICONS_DIR}/icons.json`;
export const OUTPUT_FILE = "packages/core/src/shapes/builtin-icons.generated.ts";

export interface RegenerateResult {
  /** `[OUTPUT_FILE]` when the committed module does not match a fresh render. */
  stale: string[];
  /** `[OUTPUT_FILE]` when this run rewrote it. Empty under `check`. */
  updated: string[];
}

/** Read the manifest and every SVG it names, in manifest order. */
export function readBuiltinIconSources(repoRoot: string): { name: string; svg: string }[] {
  const manifest = JSON.parse(
    readFileSync(resolve(repoRoot, MANIFEST_FILE), "utf8"),
  ) as IconManifest;
  return manifest.icons.map((entry) => ({
    name: entry.name,
    svg: readFileSync(resolve(repoRoot, ICONS_DIR, entry.file), "utf8"),
  }));
}

/**
 * The module text for a given icon set. Pure, so the drift test can render a
 * fresh copy and compare bytes.
 *
 * The array carries a `// prettier-ignore`, so the formatter leaves these
 * lines exactly as written and the emitter needs no opinion about how a
 * string literal should be quoted or wrapped.
 */
export function renderModule(sources: readonly { name: string; svg: string }[]): string {
  const entries = sources
    .map((s) => `  { name: ${JSON.stringify(s.name)}, svg: ${JSON.stringify(s.svg)} },`)
    .join("\n");
  return `// GENERATED FILE — do not edit by hand.
//
// Source of truth: \`packages/core/icons/icons.json\` and the \`.svg\` files
// beside it. Regenerate with \`pnpm gen:icons\`; \`pnpm gen:icons --check\`
// and \`scripts/icons/gen-builtin-icons.test.ts\` fail when this file is stale.
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

// prettier-ignore
export const BUILTIN_ICON_SOURCES: readonly BuiltinIconSource[] = [
${entries}
];
`;
}

export function regenerate(opts: { root: string; check: boolean }): RegenerateResult {
  const expected = renderModule(readBuiltinIconSources(opts.root));
  const outPath = resolve(opts.root, OUTPUT_FILE);
  const before = existingText(outPath);
  if (before === expected) return { stale: [], updated: [] };
  if (opts.check) return { stale: [OUTPUT_FILE], updated: [] };
  writeFileSync(outPath, expected);
  return { stale: [OUTPUT_FILE], updated: [OUTPUT_FILE] };
}

/** The committed module, or `null` when it has never been generated. */
function existingText(outPath: string): string | null {
  try {
    return readFileSync(outPath, "utf8");
  } catch {
    return null;
  }
}

function main(): void {
  const check = process.argv.includes("--check");
  const { stale, updated } = regenerate({ root: process.cwd(), check });
  if (check) {
    if (stale.length > 0) {
      process.stderr.write(`Stale generated module: ${OUTPUT_FILE}\n`);
      process.stderr.write("Run `pnpm gen:icons` and commit the result.\n");
      process.exitCode = 1;
    }
    return;
  }
  process.stdout.write(
    updated.length > 0 ? `Updated: ${OUTPUT_FILE}\n` : "Built-in icons already up to date.\n",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
