import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
}

export const test = base.extend<{ serveProject: ServeProjectFixture }>({
  serveProject: async ({ page }, use) => {
    const touched = new Set<string>();
    await use({
      dir: SERVE_SCRATCH_DIR,
      async open(path = "/") {
        await page.goto(path);
      },
      async write(name, content) {
        touched.add(name);
        await writeFile(join(SERVE_SCRATCH_DIR, `${name}.krs`), content);
      },
    });
    for (const name of touched) {
      const original = await readFile(join(SERVE_FIXTURE_DIR, `${name}.krs`), "utf8");
      await writeFile(join(SERVE_SCRATCH_DIR, `${name}.krs`), original);
    }
  },
});
