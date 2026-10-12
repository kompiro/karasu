/**
 * Stage the preview app that `karasu serve` hands to the browser (#3017).
 *
 *   tsx scripts/stage-app.ts   (run by `pnpm run build:app`, which `prepack` runs)
 *
 * Run through `tsx`, like `prebuild`, so it works on every Node the package
 * declares (`>=22.12`), which strips types and has `import.meta.main` only later.
 *
 * Copies what `packages/app`'s `build:serve` produced into `dist/app/`, where
 * the bundle's `findAppDistDir` (`src/serve.ts`) looks first and which the
 * package's `files` ships. The directory is emptied first, so the tarball
 * carries exactly the current serve build and nothing a previous run left
 * (TPL-1681).
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CLI_ROOT = resolve(import.meta.dirname, "..");
export const APP_BUILD_DIR = resolve(CLI_ROOT, "../app/dist-serve");
export const STAGED_APP_DIR = join(CLI_ROOT, "dist/app");

/** Replace `outDir` with a copy of the serve build in `buildDir`. */
export function stageApp(buildDir: string, outDir: string): void {
  if (!existsSync(join(buildDir, "index.html"))) {
    throw new Error(
      `No serve build at ${buildDir}. Run \`pnpm --filter @karasu-tools/app run build:serve\` first.`,
    );
  }
  rmSync(outDir, { recursive: true, force: true });
  cpSync(buildDir, outDir, { recursive: true });
}

// Only run when invoked directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  stageApp(APP_BUILD_DIR, STAGED_APP_DIR);
  process.stdout.write(`Staged the preview app into ${STAGED_APP_DIR}\n`);
}
