import { test as base, expect } from "@playwright/test";

/**
 * OPFS fixture for Playwright tests.
 *
 * See `docs/design/opfs-fixture-helper.md` for the design rationale.
 *
 * Usage:
 *
 *   import { test, expect } from "../fixtures/opfs";
 *
 *   test("seeded project is preselected", async ({ page, opfs }) => {
 *     await opfs.seed({
 *       projects: [
 *         { id: "demo", name: "Demo", files: { "index.krs": 'system "X" {}\n' } },
 *       ],
 *       lastProjectId: "demo",
 *     });
 *     await opfs.gotoApp();
 *
 *     await expect(
 *       page.locator(".project-selector select.project-selector-dropdown"),
 *     ).toHaveValue("demo");
 *   });
 *
 * Chromium-only: OPFS support varies across browsers and the karasu Playwright
 * setup is already chromium-only. The fixture does not attempt cross-browser
 * fallbacks.
 */

export type Mode = "opfs" | "memory";

export type SeedProject = {
  /** Project id stored in `/meta/projects.json`. Used as `rootPath = /projects/<id>`. */
  id: string;
  /** Display name shown in the ProjectSelector dropdown. */
  name: string;
  /** Map of project-relative path → file content. Directories are created as needed. */
  files: Record<string, string>;
};

export type SeedOptions = {
  /** Projects to materialize in OPFS. Ignored when `mode === "memory"`. */
  projects?: SeedProject[];
  /** Value written to `localStorage["karasu-last-project-id"]`. */
  lastProjectId?: string;
  /**
   * Selects which app mode subsequent `gotoApp()` calls boot into.
   * - `"opfs"` (default): seed OPFS and load `ProjectModeApp`.
   * - `"memory"`: skip OPFS seeding and load `MemoryModeApp` (`?mode=memory`).
   */
  mode?: Mode;
};

export type OpfsFixture = {
  /** Wipe OPFS + localStorage, then optionally seed projects/last-project. */
  seed(options?: SeedOptions): Promise<void>;
  /** Wipe OPFS + localStorage without seeding anything. */
  reset(): Promise<void>;
  /** Read a file from OPFS, or `null` if the path does not exist. */
  read(path: string): Promise<string | null>;
  /** Navigate to the app, applying `?mode=memory` when the fixture is in memory mode. */
  gotoApp(path?: string): Promise<void>;
  /** Current mode, updated by the most recent `seed()` call. */
  readonly mode: Mode;
};

const META_PATH_DIR = "meta";
const META_PATH_FILE = "projects.json";
const PROJECTS_DIR = "projects";
const LAST_PROJECT_KEY = "karasu-last-project-id";

export const test = base.extend<{ opfs: OpfsFixture }>({
  opfs: async ({ page, baseURL }, use) => {
    if (!baseURL) throw new Error("opfs fixture requires Playwright baseURL");

    let mode: Mode = "opfs";
    let originReady = false;

    // Establish the OPFS origin once per fixture instance by booting memory
    // mode (which never touches OPFS). After this, `page.evaluate(...)` runs
    // in a real document at the karasu origin and can call
    // `navigator.storage.getDirectory()`.
    const ensureOrigin = async () => {
      if (originReady) return;
      const url = new URL("/", baseURL);
      url.searchParams.set("mode", "memory");
      await page.goto(url.toString());
      originReady = true;
    };

    const wipe = async () => {
      await page.evaluate(async () => {
        localStorage.clear();
        const root = await navigator.storage.getDirectory();
        const names: string[] = [];
        for await (const [name] of root as unknown as AsyncIterable<[string, FileSystemHandle]>) {
          names.push(name);
        }
        for (const name of names) {
          await root.removeEntry(name, { recursive: true });
        }
      });
    };

    const reset = async () => {
      await ensureOrigin();
      await wipe();
    };

    const seed = async (options: SeedOptions = {}) => {
      mode = options.mode ?? "opfs";
      await ensureOrigin();
      await wipe();

      await page.evaluate(
        async ({
          projects,
          lastProjectId,
          mode: seedMode,
          metaDir,
          metaFile,
          projectsDir,
          lastProjectKey,
        }) => {
          if (lastProjectId) localStorage.setItem(lastProjectKey, lastProjectId);
          if (seedMode === "memory") return;

          if (projects && projects.length > 0) {
            const root = await navigator.storage.getDirectory();
            const now = new Date().toISOString();
            const meta = projects.map((p) => ({
              id: p.id,
              name: p.name,
              rootPath: `/${projectsDir}/${p.id}`,
              createdAt: now,
              updatedAt: now,
            }));

            const metaDirHandle = await root.getDirectoryHandle(metaDir, { create: true });
            const metaFileHandle = await metaDirHandle.getFileHandle(metaFile, { create: true });
            const metaWritable = await metaFileHandle.createWritable();
            await metaWritable.write(JSON.stringify(meta, null, 2));
            await metaWritable.close();

            const projectsDirHandle = await root.getDirectoryHandle(projectsDir, { create: true });
            for (const p of projects) {
              const projectDir = await projectsDirHandle.getDirectoryHandle(p.id, {
                create: true,
              });
              for (const [path, content] of Object.entries(p.files)) {
                const segments = path.split("/").filter((s) => s !== "");
                if (segments.length === 0) continue;
                const fileName = segments.pop() as string;
                let dir = projectDir;
                for (const seg of segments) {
                  dir = await dir.getDirectoryHandle(seg, { create: true });
                }
                const fileHandle = await dir.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(content);
                await writable.close();
              }
            }
          }
        },
        {
          projects: options.projects ?? [],
          lastProjectId: options.lastProjectId,
          mode,
          metaDir: META_PATH_DIR,
          metaFile: META_PATH_FILE,
          projectsDir: PROJECTS_DIR,
          lastProjectKey: LAST_PROJECT_KEY,
        },
      );
    };

    const read = async (path: string): Promise<string | null> => {
      await ensureOrigin();
      return page.evaluate(async (p) => {
        try {
          const segments = p.split("/").filter((s) => s !== "");
          if (segments.length === 0) return null;
          const fileName = segments.pop() as string;
          let dir = await navigator.storage.getDirectory();
          for (const seg of segments) {
            dir = await dir.getDirectoryHandle(seg);
          }
          const fileHandle = await dir.getFileHandle(fileName);
          const file = await fileHandle.getFile();
          return await file.text();
        } catch {
          return null;
        }
      }, path);
    };

    const gotoApp = async (path = "/") => {
      await ensureOrigin();
      const url = new URL(path, baseURL);
      if (mode === "memory" && !url.searchParams.has("mode")) {
        url.searchParams.set("mode", "memory");
      }
      await page.goto(url.toString());
    };

    await use({
      seed,
      reset,
      read,
      gotoApp,
      get mode() {
        return mode;
      },
    });
  },
});

export { expect };
