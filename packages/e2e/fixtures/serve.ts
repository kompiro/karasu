import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test as base } from "./network.js";
import { SERVE_FIXTURE_DIR, SERVE_SCRATCH_DIR } from "./serve-env.js";

export { expect } from "@playwright/test";

/**
 * The directory `karasu serve` is watching (`scripts/start-serve.ts`), for
 * specs in the `serve` project (#3049).
 */
export interface ServeProjectFixture {
  /** Absolute path of the served directory. */
  readonly dir: string;
  /**
   * Navigate to `path` on the serve server (`/` is the default file,
   * `/<name>` is `<name>.krs`). Serve mode reads its files from the server,
   * so there is no project to seed or wipe first, unlike `opfs.gotoApp()`.
   */
  open(path?: string): Promise<void>;
  /**
   * Overwrite `<name>.krs` in the served directory, as an external editor
   * would. The file is put back to its checked-in content after the test, so
   * a reused local server starts the next run from the fixture.
   */
  write(name: string, content: string): Promise<void>;
  /**
   * Overwrite any file in the served directory, `.krs.style` included.
   * `path` is relative to the directory, extension included. Put back after
   * the test like `write`.
   */
  writeFile(path: string, content: string): Promise<void>;
  /** Delete a file from the served directory. Put back after the test. */
  remove(path: string): Promise<void>;
}

export const test = base.extend<{ serveProject: ServeProjectFixture }>({
  serveProject: async ({ page }, use) => {
    const touched = new Set<string>();
    const writeFileAt = async (path: string, content: string) => {
      touched.add(path);
      await mkdir(dirname(join(SERVE_SCRATCH_DIR, path)), { recursive: true });
      await writeFile(join(SERVE_SCRATCH_DIR, path), content);
    };
    await use({
      dir: SERVE_SCRATCH_DIR,
      async open(path = "/") {
        await page.goto(path);
      },
      write: (name, content) => writeFileAt(`${name}.krs`, content),
      writeFile: writeFileAt,
      async remove(path) {
        touched.add(path);
        await rm(join(SERVE_SCRATCH_DIR, path), { force: true });
      },
    });
    for (const path of touched) {
      const original = await readFile(join(SERVE_FIXTURE_DIR, path), "utf8");
      await mkdir(dirname(join(SERVE_SCRATCH_DIR, path)), { recursive: true });
      await writeFile(join(SERVE_SCRATCH_DIR, path), original);
    }
  },
});
