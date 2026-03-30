import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { FileWatcher } from "./watcher.js";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

function getAppDistDir(): string {
  const cliDir = fileURLToPath(new URL(".", import.meta.url));
  return resolve(cliDir, "../../app/dist");
}

export async function collectKrsFiles(dir: string): Promise<string[]> {
  const names: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".krs")) {
        const rel = relative(dir, fullPath);
        names.push(rel.replace(/\.krs$/, ""));
      }
    }
  }
  await walk(dir);
  return names.sort();
}

export async function resolveKrsFile(dir: string, name: string): Promise<string | null> {
  const filePath = join(dir, `${name}.krs`);
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

export function serve(dir: string, port: number): Server {
  const absDir = resolve(dir);
  const appDistDir = getAppDistDir();
  const watcher = new FileWatcher(absDir);
  watcher.start();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const pathname = url.pathname;

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

    // 静的アセット（app dist）
    if (pathname !== "/" && pathname !== "") {
      const assetPath = join(appDistDir, pathname);
      const served = await serveStaticFile(assetPath, res);
      if (served) return;
    }

    // SPA fallback — index.html
    const indexPath = join(appDistDir, "index.html");
    const served = await serveStaticFile(indexPath, res);
    if (!served) {
      res.writeHead(503);
      res.end("App not built. Run: npm run build --workspace=packages/app");
    }
  });

  server.listen(port, () => {
    process.stdout.write(`karasu serve\n`);
    process.stdout.write(`  Directory : ${absDir}\n`);
    process.stdout.write(`  Preview   : http://localhost:${port}\n`);
    process.stdout.write(`\nWatching for .krs file changes...\n`);
  });
  return server;
}
