import { fileURLToPath } from "node:url";

/**
 * Where the `serve` project's server lives (#3049). Shared by
 * `playwright.config.ts`, `scripts/start-serve.ts` (which starts the server)
 * and `fixtures/serve.ts` (which rewrites files under it), so this module
 * imports nothing from `@playwright/test`.
 */

/** Port of `karasu serve`; the app's own server keeps 5173. */
export const SERVE_PORT = Number(process.env.PLAYWRIGHT_SERVE_PORT ?? 5174);

/** The checked-in `.krs` files the server starts from. Never served directly. */
export const SERVE_FIXTURE_DIR = fileURLToPath(new URL("./serve-project/", import.meta.url));

/**
 * The directory `karasu serve` watches: a fresh copy of `SERVE_FIXTURE_DIR`
 * made on every server start, so a test that rewrites a file never edits a
 * tracked one. Git-ignored.
 */
export const SERVE_SCRATCH_DIR = fileURLToPath(new URL("../.serve-scratch/", import.meta.url));
