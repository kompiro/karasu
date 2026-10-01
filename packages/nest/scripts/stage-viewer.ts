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
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  VIEWER_ASSET_HEADERS,
  VIEWER_ASSET_PREFIX,
  VIEWER_TEMPLATE_PATH,
} from "../src/gallery/viewer-assets.ts";

const NEST_ROOT = resolve(import.meta.dirname, "..");
export const VIEWER_BUILD_DIR = resolve(NEST_ROOT, "../app/dist-viewer");
export const STAGED_DIR = join(NEST_ROOT, "viewer-assets");

/** Replace `outDir` with the staged copy of `buildDir`. */
export function stageViewer(buildDir: string, outDir: string): void {
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
}

if (import.meta.main) {
  stageViewer(VIEWER_BUILD_DIR, STAGED_DIR);
  process.stdout.write(`Staged the gallery viewer into ${STAGED_DIR}\n`);
}
