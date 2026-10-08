/**
 * Stage the gallery viewer's build for this Worker's static assets (#2998).
 *
 *   node scripts/stage-viewer.ts   (run by `pnpm run build:viewer`)
 *
 * Copies what `packages/app`'s `build:viewer` produced (#2997) into
 * `viewer-assets/`, the directory `wrangler.toml` publishes: the bundle under
 * `assets/`, the page template, and a `_headers` file. Nothing else from the
 * build is taken, so the deploy carries exactly what `gallery/viewer-assets.ts`
 * describes.
 *
 * It also stages the four fonts the OGP image is drawn with (#2995) from the
 * app's `public/fonts/` into `og-fonts/`, the set `gallery/og-image.ts` names.
 * They are not part of the viewer build; they sit beside it because the same
 * `[assets]` directory is the only static storage this Worker has.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { OG_FONT_FILES, OG_FONT_PREFIX } from "../src/gallery/og-image.ts";
import {
  VIEWER_ASSET_HEADERS,
  VIEWER_ASSET_PREFIX,
  VIEWER_TEMPLATE_PATH,
} from "../src/gallery/viewer-assets.ts";

const NEST_ROOT = resolve(import.meta.dirname, "..");
export const VIEWER_BUILD_DIR = resolve(NEST_ROOT, "../app/dist-viewer");
export const STAGED_DIR = join(NEST_ROOT, "viewer-assets");
export const APP_FONTS_DIR = resolve(NEST_ROOT, "../app/public/fonts");

/** Replace `outDir` with the staged copy of `buildDir`, plus the OGP fonts from `fontsDir`. */
export function stageViewer(buildDir: string, outDir: string, fontsDir = APP_FONTS_DIR): void {
  const template = join(buildDir, VIEWER_TEMPLATE_PATH);
  const assets = join(buildDir, VIEWER_ASSET_PREFIX);
  if (!existsSync(template) || !existsSync(assets)) {
    throw new Error(
      `No viewer build at ${buildDir}. Run \`pnpm --filter @karasu-tools/app run build:viewer\` first.`,
    );
  }
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(assets, join(outDir, VIEWER_ASSET_PREFIX), { recursive: true });
  cpSync(template, join(outDir, VIEWER_TEMPLATE_PATH));
  writeFileSync(join(outDir, "_headers"), VIEWER_ASSET_HEADERS);
  const staged = join(outDir, OG_FONT_PREFIX);
  mkdirSync(staged, { recursive: true });
  for (const file of OG_FONT_FILES) {
    const font = join(fontsDir, file);
    // A missing font fails the deploy here, rather than every OGP image later.
    if (!existsSync(font)) throw new Error(`No OGP font at ${font}.`);
    cpSync(font, join(staged, file));
  }
}

if (import.meta.main) {
  stageViewer(VIEWER_BUILD_DIR, STAGED_DIR);
  process.stdout.write(`Staged the gallery viewer into ${STAGED_DIR}\n`);
}
