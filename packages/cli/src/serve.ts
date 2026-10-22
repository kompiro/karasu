import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, extname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isSafeRelativePath } from "@karasu-tools/core";
import { FileWatcher } from "./watcher.js";
import { handleRender } from "./render-endpoint.js";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

const APP_PACKAGE_NAME = "@karasu-tools/app";

export type AppDistLookup = { dir: string } | { dir: null; inMonorepo: boolean; tried: string[] };

function isKarasuApp(appRoot: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8")) as {
      name?: unknown;
    };
    return manifest.name === APP_PACKAGE_NAME;
  } catch {
    return false;
  }
}

/**
 * Find the preview app build that `serve` hands to the browser (#3017,
 * TPL-1024). `cliDir` is the directory of the running bundle.
 *
 * - The `karasu` npm package ships the app as `app/` beside the bundle
 *   (`dist/app/`, staged by `scripts/stage-app.ts` at pack time).
 * - In the monorepo the bundle sits in `packages/cli/dist/` (or the source in
 *   `packages/cli/src/`), and the app's own build is `packages/app/dist/`.
 *   That candidate is taken only when its `package.json` names the karasu
 *   app, so an unrelated `node_modules/app` beside an installed karasu is
 *   never served.
 */
export function findAppDistDir(cliDir: string): AppDistLookup {
  const packaged = join(cliDir, "app");
  if (existsSync(join(packaged, "index.html"))) return { dir: packaged };
  const appRoot = resolve(cliDir, "../../app");
  const dev = join(appRoot, "dist");
  const inMonorepo = isKarasuApp(appRoot);
  if (inMonorepo && existsSync(join(dev, "index.html"))) return { dir: dev };
  return { dir: null, inMonorepo, tried: inMonorepo ? [packaged, dev] : [packaged] };
}

/** What `serve` says when no app was found: what to run, in the reader's setting. */
export function missingAppMessage(lookup: { inMonorepo: boolean; tried: string[] }): string {
  const looked = `looked in ${lookup.tried.join(", ")}`;
  return lookup.inMonorepo
    ? `The preview app has not been built (${looked}). ` +
        `Run: pnpm --filter ${APP_PACKAGE_NAME} run build\n`
    : `The preview app is missing from this karasu installation (${looked}). ` +
        `Reinstall karasu (npm i -g karasu@latest) or run: npx --yes karasu@latest serve\n`;
}

/**
 * Every regular file under `dir` whose name passes `accept`, as `/`-separated
 * paths relative to `dir`. Symlinks are skipped: `Dirent.isDirectory()` and
 * `isFile()` do not follow them, so a link is neither walked into nor read,
 * and nothing outside `dir` can come back through one (TPL-168).
 */
async function walkFiles(dir: string, accept: (name: string) => boolean): Promise<string[]> {
  const paths: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && accept(entry.name)) {
        paths.push(relative(dir, fullPath).split(sep).join("/"));
      }
    }
  }
  await walk(dir);
  return paths.sort();
}

export async function collectKrsFiles(dir: string): Promise<string[]> {
  const paths = await walkFiles(dir, (name) => name.endsWith(".krs"));
  return paths.map((path) => path.replace(/\.krs$/, ""));
}

export interface ProjectFile {
  /** `/`-separated, relative to the served directory, extension included. */
  path: string;
  content: string;
}

/**
 * The whole served directory as the preview needs it to resolve imports
 * (#3258): every `.krs` and `.krs.style`, at its real relative path. The app
 * writes these into its in-memory fs and compiles the entry from there, so
 * whole-file, named, directory and style imports all find their targets.
 * Paths come from the walk, never from the request.
 */
export async function collectProjectFiles(dir: string): Promise<ProjectFile[]> {
  const paths = await walkFiles(
    dir,
    (name) => name.endsWith(".krs") || name.endsWith(".krs.style"),
  );
  const files = await Promise.all(
    paths.map(async (path): Promise<ProjectFile | null> => {
      try {
        return { path, content: await readFile(join(dir, path), "utf-8") };
      } catch (err) {
        // Gone since the walk: an editor's atomic save (temp file, then
        // rename) or a delete. Leave it out rather than fail the snapshot;
        // its own watch event brings the next one.
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    }),
  );
  return files.filter((f): f is ProjectFile => f !== null);
}

export async function resolveKrsFile(dir: string, name: string): Promise<string | null> {
  // Shared trust-boundary segment check (TPL-168): rejects absolute
  // paths, backslashes and ".." segments before any path is assembled.
  if (!isSafeRelativePath(name)) {
    return null;
  }
  // Normalise dir so a trailing sep never causes startsWith to fail. Kept as
  // OS-level defense in depth on top of the segment check above.
  // Note: this guard is a string-level check and does not resolve symlinks;
  // a symlink inside dir that points outside would bypass it.
  const safeDir = resolve(dir);
  const filePath = join(safeDir, `${name}.krs`);
  if (!filePath.startsWith(safeDir + sep)) {
    return null;
  }
  try {
    await stat(filePath);
    return filePath;
  } catch {
    return null;
  }
}

export async function resolveDefaultFile(dir: string): Promise<string | null> {
  const indexPath = join(dir, "index.krs");
  try {
    await stat(indexPath);
    return "index";
  } catch {
    // index.krs が存在しない場合は .krs が1つだけなら自動選択
    const files = await collectKrsFiles(dir);
    return files.length === 1 ? (files[0] ?? null) : null;
  }
}

export async function serveStaticFile(filePath: string, res: ServerResponse): Promise<boolean> {
  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

export function serve(dir: string, port: number, appDistDir?: string): Server {
  const absDir = resolve(dir);
  let missingApp: string | null = null;
  if (appDistDir === undefined) {
    const lookup = findAppDistDir(fileURLToPath(new URL(".", import.meta.url)));
    if (lookup.dir === null) missingApp = missingAppMessage(lookup);
    else appDistDir = lookup.dir;
  }
  const appDir = appDistDir ?? null;
  const watcher = new FileWatcher(absDir);
  watcher.start();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const pathname = url.pathname;

    // SVG rendering endpoint (mermaid.ink pattern)
    if (pathname === "/render") {
      await handleRender(req, res, url.searchParams);
      return;
    }

    // SSE — ファイル変更通知
    if (pathname === "/api/watch") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(": connected\n\n");
      watcher.addClient(res);
      return;
    }

    // .krs ファイル一覧
    if (pathname === "/api/files") {
      try {
        const files = await collectKrsFiles(absDir);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ files }));
      } catch {
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Failed to list files" }));
      }
      return;
    }

    // 配信ディレクトリの .krs / .krs.style すべて（import の解決用、#3258）
    if (pathname === "/api/project") {
      try {
        const files = await collectProjectFiles(absDir);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ files }));
      } catch {
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Failed to read project" }));
      }
      return;
    }

    // .krs ファイル内容
    if (pathname.startsWith("/api/file/")) {
      const name = pathname.slice("/api/file/".length);
      if (!name) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "File name required" }));
        return;
      }
      const filePath = await resolveKrsFile(absDir, name);
      if (!filePath) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "File not found" }));
        return;
      }
      try {
        const content = await readFile(filePath, "utf-8");
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(content);
      } catch {
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Failed to read file" }));
      }
      return;
    }

    // デフォルトファイル解決エンドポイント
    if (pathname === "/api/default") {
      const name = await resolveDefaultFile(absDir);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ file: name }));
      return;
    }

    if (appDir !== null) {
      // 静的アセット（app dist）
      if (pathname !== "/" && pathname !== "") {
        const assetPath = join(appDir, pathname);
        const served = await serveStaticFile(assetPath, res);
        if (served) return;
      }

      // SPA fallback — index.html
      const indexPath = join(appDir, "index.html");
      const served = await serveStaticFile(indexPath, res);
      if (served) return;
    }
    res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(missingApp ?? `The preview app is not at ${appDir}.\n`);
  });

  server.listen(port, () => {
    process.stdout.write(`karasu serve\n`);
    process.stdout.write(`  Directory : ${absDir}\n`);
    process.stdout.write(`  Preview   : http://localhost:${port}\n`);
    process.stdout.write(`\nWatching for .krs and .krs.style file changes...\n`);
    if (missingApp !== null) process.stderr.write(`\nWarning: ${missingApp}`);
  });
  return server;
}
