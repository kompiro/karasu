import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, open, readdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import type { ServerResponse, Server } from "node:http";
import * as http from "node:http";

// Pass-through, so a test can stand in for the directory changing between
// the walk and the read: a file vanishing, or a path swapped for a symlink.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: vi.fn<typeof actual.open>(actual.open),
    readdir: vi.fn<typeof actual.readdir>(actual.readdir),
  };
});

vi.mock("chokidar", () => ({
  watch: vi.fn<() => object>(() => ({ on: vi.fn<() => void>().mockReturnThis() })),
}));

import {
  collectKrsFiles,
  collectProjectFiles,
  findAppDistDir,
  missingAppMessage,
  resolveDefaultFile,
  resolveKrsFile,
  serveStaticFile,
  serve,
} from "./serve.js";

// ── helpers ──────────────────────────────────────────────────────────────────

async function get(
  port: number,
  path: string,
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "localhost", port, path }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "karasu-test-"));
}

// ── collectKrsFiles ───────────────────────────────────────────────────────────

describe("collectKrsFiles", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("returns empty array for empty directory", async () => {
    expect(await collectKrsFiles(tmpDir)).toEqual([]);
  });

  it("returns .krs files without extension, sorted", async () => {
    await writeFile(join(tmpDir, "system.krs"), "");
    await writeFile(join(tmpDir, "index.krs"), "");
    expect(await collectKrsFiles(tmpDir)).toEqual(["index", "system"]);
  });

  it("ignores non-.krs files", async () => {
    await writeFile(join(tmpDir, "readme.md"), "");
    await writeFile(join(tmpDir, "index.krs"), "");
    expect(await collectKrsFiles(tmpDir)).toEqual(["index"]);
  });

  it("walks subdirectories recursively", async () => {
    await mkdir(join(tmpDir, "services"));
    await writeFile(join(tmpDir, "services", "api.krs"), "");
    await writeFile(join(tmpDir, "index.krs"), "");
    expect(await collectKrsFiles(tmpDir)).toEqual(["index", "services/api"]);
  });
});

// ── collectProjectFiles (#3258) ───────────────────────────────────────────────

describe("collectProjectFiles", () => {
  let tmpDir: string;
  let outside: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    outside = await makeTmpDir();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
    await rm(outside, { recursive: true });
  });

  it("returns every .krs and .krs.style with its nested path and content", async () => {
    await mkdir(join(tmpDir, "services", "billing"), { recursive: true });
    await writeFile(join(tmpDir, "index.krs"), 'import "services/"');
    await writeFile(join(tmpDir, "theme.krs.style"), "service { color: red }");
    await writeFile(join(tmpDir, "services", "billing", "api.krs"), "system Billing {}");
    expect(await collectProjectFiles(tmpDir)).toEqual([
      { path: "index.krs", content: 'import "services/"' },
      { path: "services/billing/api.krs", content: "system Billing {}" },
      { path: "theme.krs.style", content: "service { color: red }" },
    ]);
  });

  it("leaves out every other extension", async () => {
    await writeFile(join(tmpDir, "index.krs"), "");
    await writeFile(join(tmpDir, "notes.md"), "");
    await writeFile(join(tmpDir, "theme.style"), "");
    await writeFile(join(tmpDir, "old.krs.bak"), "");
    expect((await collectProjectFiles(tmpDir)).map((f) => f.path)).toEqual(["index.krs"]);
  });

  it("leaves out a file that disappears between the walk and the read", async () => {
    await writeFile(join(tmpDir, "index.krs"), "system A {}");
    await writeFile(join(tmpDir, "saving.krs"), "");
    const actual = vi.mocked(open).getMockImplementation() as typeof open;
    vi.mocked(open).mockImplementation(((path: string, ...rest: [never]) =>
      String(path).endsWith("saving.krs")
        ? Promise.reject(Object.assign(new Error("gone"), { code: "ENOENT" }))
        : actual(path, ...rest)) as typeof open);
    try {
      expect(await collectProjectFiles(tmpDir)).toEqual([
        { path: "index.krs", content: "system A {}" },
      ]);
    } finally {
      vi.mocked(open).mockImplementation(actual);
    }
  });

  it("holds a bounded number of files open at once, and keeps their order", async () => {
    const names = Array.from({ length: 100 }, (_, i) => `f${String(i).padStart(3, "0")}.krs`);
    await Promise.all(names.map((name) => writeFile(join(tmpDir, name), name)));
    const actual = vi.mocked(open).getMockImplementation() as typeof open;
    let inFlight = 0;
    let peak = 0;
    vi.mocked(open).mockImplementation((async (...args: Parameters<typeof open>) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      try {
        // Hold each open long enough for the others to pile up if unbounded.
        await new Promise((r) => setTimeout(r, 1));
        return await actual(...args);
      } finally {
        inFlight--;
      }
    }) as typeof open);
    try {
      const files = await collectProjectFiles(tmpDir);
      expect(files.map((f) => f.path)).toEqual(names);
      expect(files.every((f) => f.content === f.path)).toBe(true);
      expect(peak).toBeGreaterThan(1);
      expect(peak).toBeLessThanOrEqual(32);
    } finally {
      vi.mocked(open).mockImplementation(actual);
    }
  });

  // TPL-168, #3327 review: the listing saw a plain file or directory, and by
  // the time it is read the entry is a link out of the served directory.
  describe("an entry swapped for a symlink after it was listed", () => {
    let actualReaddir: typeof readdir;

    beforeEach(async () => {
      await writeFile(join(outside, "secret.krs"), "system Secret {}");
      await writeFile(join(tmpDir, "index.krs"), "");
      await symlink(join(outside, "secret.krs"), join(tmpDir, "linked.krs"));
      await symlink(outside, join(tmpDir, "linked-dir"));
      actualReaddir = vi.mocked(readdir).getMockImplementation() as typeof readdir;
      // List each link as what it was before the swap.
      vi.mocked(readdir).mockImplementation((async (path: string, options: never) => {
        const entries = (await actualReaddir(path, options)) as unknown as {
          name: string;
          isFile(): boolean;
          isDirectory(): boolean;
        }[];
        return entries.map((entry) =>
          entry.name === "linked.krs"
            ? { name: entry.name, isFile: () => true, isDirectory: () => false }
            : entry.name === "linked-dir"
              ? { name: entry.name, isFile: () => false, isDirectory: () => true }
              : entry,
        );
      }) as typeof readdir);
    });

    afterEach(() => {
      vi.mocked(readdir).mockImplementation(actualReaddir);
    });

    it("does not read through either link", async () => {
      const files = await collectProjectFiles(tmpDir);
      expect(files.map((f) => f.path)).toEqual(["index.krs"]);
      expect(JSON.stringify(files)).not.toContain("Secret");
    });

    it("does not list the swapped directory's files in /api/files either", async () => {
      expect(await collectKrsFiles(tmpDir)).not.toContain("linked-dir/secret");
    });
  });

  // TPL-168: a link inside the served directory must not read what lies outside it.
  it("does not follow a symlinked file or directory out of the served directory", async () => {
    await writeFile(join(outside, "secret.krs"), "system Secret {}");
    await writeFile(join(outside, "secret.krs.style"), "service { color: red }");
    await writeFile(join(tmpDir, "index.krs"), "");
    await symlink(join(outside, "secret.krs"), join(tmpDir, "linked.krs"));
    await symlink(join(outside, "secret.krs.style"), join(tmpDir, "linked.krs.style"));
    await symlink(outside, join(tmpDir, "linked-dir"));
    const files = await collectProjectFiles(tmpDir);
    expect(files.map((f) => f.path)).toEqual(["index.krs"]);
    expect(JSON.stringify(files)).not.toContain("Secret");
  });
});

// ── resolveKrsFile ────────────────────────────────────────────────────────────

describe("resolveKrsFile", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("returns the full path when the file exists", async () => {
    await writeFile(join(tmpDir, "index.krs"), "");
    const result = await resolveKrsFile(tmpDir, "index");
    expect(result).toBe(join(tmpDir, "index.krs"));
  });

  it("returns null when the file does not exist", async () => {
    expect(await resolveKrsFile(tmpDir, "nonexistent")).toBeNull();
  });

  it("returns null for a multi-step path traversal (../../)", async () => {
    expect(await resolveKrsFile(tmpDir, "../../etc/passwd")).toBeNull();
  });

  it("returns null for a single-step path traversal (../)", async () => {
    expect(await resolveKrsFile(tmpDir, "../sibling")).toBeNull();
  });

  it("returns null for an absolute path input", async () => {
    expect(await resolveKrsFile(tmpDir, "/etc/passwd")).toBeNull();
  });

  it("returns null for backslash-separated traversal (shared segment check, #1526)", async () => {
    expect(await resolveKrsFile(tmpDir, "..\\..\\etc\\passwd")).toBeNull();
  });

  it("returns null for traversal through a subdirectory prefix", async () => {
    expect(await resolveKrsFile(tmpDir, "sub/../../etc/passwd")).toBeNull();
  });
});

// ── resolveDefaultFile ────────────────────────────────────────────────────────

describe("resolveDefaultFile", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("returns 'index' when index.krs exists", async () => {
    await writeFile(join(tmpDir, "index.krs"), "");
    expect(await resolveDefaultFile(tmpDir)).toBe("index");
  });

  it("returns the single file name when only one .krs file exists", async () => {
    await writeFile(join(tmpDir, "system.krs"), "");
    expect(await resolveDefaultFile(tmpDir)).toBe("system");
  });

  it("returns null when multiple .krs files exist but no index.krs", async () => {
    await writeFile(join(tmpDir, "a.krs"), "");
    await writeFile(join(tmpDir, "b.krs"), "");
    expect(await resolveDefaultFile(tmpDir)).toBeNull();
  });

  it("returns null when no .krs files exist", async () => {
    expect(await resolveDefaultFile(tmpDir)).toBeNull();
  });
});

// ── serveStaticFile ───────────────────────────────────────────────────────────

describe("serveStaticFile", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  function makeRes(): { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
    return { writeHead: vi.fn<() => void>(), end: vi.fn<() => void>() };
  }

  it("serves a .js file with correct content type", async () => {
    const filePath = join(tmpDir, "app.js");
    await writeFile(filePath, "console.log('hi');");
    const res = makeRes();

    const result = await serveStaticFile(filePath, res as unknown as ServerResponse);

    expect(result).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "application/javascript",
    });
  });

  it("serves a .css file with correct content type", async () => {
    const filePath = join(tmpDir, "style.css");
    await writeFile(filePath, "body {}");
    const res = makeRes();

    await serveStaticFile(filePath, res as unknown as ServerResponse);

    expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "text/css" });
  });

  it("falls back to application/octet-stream for unknown extensions", async () => {
    const filePath = join(tmpDir, "data.bin");
    await writeFile(filePath, "binary");
    const res = makeRes();

    await serveStaticFile(filePath, res as unknown as ServerResponse);

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "application/octet-stream",
    });
  });

  it("returns false for a non-existent file", async () => {
    const res = makeRes();
    const result = await serveStaticFile("/no/such/file.html", res as unknown as ServerResponse);

    expect(result).toBe(false);
    expect(res.writeHead).not.toHaveBeenCalled();
  });
});

// ── HTTP endpoints ────────────────────────────────────────────────────────────

describe("HTTP server", () => {
  let tmpDir: string;
  let server: Server;
  let port: number;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    server = serve(tmpDir, 0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(tmpDir, { recursive: true });
  });

  describe("GET /api/files", () => {
    it("returns an empty file list", async () => {
      const { status, body } = await get(port, "/api/files");
      expect(status).toBe(200);
      expect(JSON.parse(body)).toEqual({ files: [] });
    });

    it("returns .krs files in the directory", async () => {
      await writeFile(join(tmpDir, "index.krs"), "");
      await writeFile(join(tmpDir, "system.krs"), "");
      const { status, body } = await get(port, "/api/files");
      expect(status).toBe(200);
      expect(JSON.parse(body)).toEqual({ files: ["index", "system"] });
    });
  });

  describe("GET /api/file/:name", () => {
    it("returns file content with 200", async () => {
      await writeFile(join(tmpDir, "index.krs"), "system App {}");
      const { status, body } = await get(port, "/api/file/index");
      expect(status).toBe(200);
      expect(body).toBe("system App {}");
    });

    it("returns 404 for a missing file", async () => {
      const { status } = await get(port, "/api/file/nonexistent");
      expect(status).toBe(404);
    });

    it("returns 400 when the file name is empty", async () => {
      const { status } = await get(port, "/api/file/");
      expect(status).toBe(400);
    });
  });

  describe("GET /api/project (#3258)", () => {
    it("returns the .krs and .krs.style files with their paths and content", async () => {
      await mkdir(join(tmpDir, "services"));
      await writeFile(join(tmpDir, "index.krs"), '@import "theme.krs.style"');
      await writeFile(join(tmpDir, "theme.krs.style"), "service { color: red }");
      await writeFile(join(tmpDir, "services", "api.krs"), "system Api {}");
      await writeFile(join(tmpDir, "readme.md"), "# readme");
      const { status, body, headers } = await get(port, "/api/project");
      expect(status).toBe(200);
      expect(headers["content-type"]).toBe("application/json");
      expect(JSON.parse(body)).toEqual({
        files: [
          { path: "index.krs", content: '@import "theme.krs.style"' },
          { path: "services/api.krs", content: "system Api {}" },
          { path: "theme.krs.style", content: "service { color: red }" },
        ],
      });
    });

    it("returns an empty list for an empty directory", async () => {
      const { status, body } = await get(port, "/api/project");
      expect(status).toBe(200);
      expect(JSON.parse(body)).toEqual({ files: [] });
    });
  });

  describe("GET /api/default", () => {
    it("returns the default file name when index.krs exists", async () => {
      await writeFile(join(tmpDir, "index.krs"), "");
      const { status, body } = await get(port, "/api/default");
      expect(status).toBe(200);
      expect(JSON.parse(body)).toEqual({ file: "index" });
    });

    it("returns null when no suitable default exists", async () => {
      const { status, body } = await get(port, "/api/default");
      expect(status).toBe(200);
      expect(JSON.parse(body)).toEqual({ file: null });
    });
  });

  describe("GET /api/watch (SSE)", () => {
    it("responds with SSE headers and initial keep-alive comment", async () => {
      await new Promise<void>((resolve, reject) => {
        const req = http.request({ host: "localhost", port, path: "/api/watch" }, (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers["content-type"]).toBe("text/event-stream");

          res.once("data", (chunk: Buffer) => {
            expect(chunk.toString()).toContain(": connected");
            req.destroy();
            resolve();
          });
        });
        req.on("error", (err) => {
          // ECONNRESET is expected when we destroy the request
          if ((err as NodeJS.ErrnoException).code !== "ECONNRESET") reject(err);
          else resolve();
        });
        req.end();
      });
    });
  });

  describe("SPA fallback", () => {
    let spaServer: Server;
    let spaPort: number;

    beforeEach(async () => {
      spaServer = serve(tmpDir, 0, "/nonexistent-dist");
      await new Promise<void>((resolve) => spaServer.once("listening", resolve));
      spaPort = (spaServer.address() as AddressInfo).port;
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => spaServer.close(() => resolve()));
    });

    it("returns 503 when the app has not been built", async () => {
      const { status, body } = await get(spaPort, "/");
      expect(status).toBe(503);
      expect(body).toContain("/nonexistent-dist");
    });

    it("returns 503 for unknown asset paths", async () => {
      const { status } = await get(spaPort, "/assets/unknown.js");
      expect(status).toBe(503);
    });
  });
});

// ── findAppDistDir (#3017, TPL-1024) ─────────────────────────────────────────

describe("findAppDistDir", () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTmpDir();
  });

  afterEach(async () => {
    await rm(root, { recursive: true });
  });

  async function writeIndex(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), "<div id=root></div>");
  }

  async function writeAppPackage(appRoot: string, name: string): Promise<void> {
    await mkdir(appRoot, { recursive: true });
    await writeFile(join(appRoot, "package.json"), JSON.stringify({ name }));
  }

  it("takes the app the npm package ships beside the bundle", async () => {
    // node_modules/karasu/dist/index.js → node_modules/karasu/dist/app/
    const cliDir = join(root, "node_modules/karasu/dist");
    await writeIndex(join(cliDir, "app"));
    expect(findAppDistDir(cliDir)).toEqual({ dir: join(cliDir, "app") });
  });

  it("prefers the shipped app over the monorepo build", async () => {
    const cliDir = join(root, "packages/cli/dist");
    await writeIndex(join(cliDir, "app"));
    await writeAppPackage(join(root, "packages/app"), "@karasu-tools/app");
    await writeIndex(join(root, "packages/app/dist"));
    expect(findAppDistDir(cliDir)).toEqual({ dir: join(cliDir, "app") });
  });

  it("falls back to the monorepo's packages/app/dist", async () => {
    const cliDir = join(root, "packages/cli/dist");
    await writeAppPackage(join(root, "packages/app"), "@karasu-tools/app");
    await writeIndex(join(root, "packages/app/dist"));
    expect(findAppDistDir(cliDir)).toEqual({ dir: join(root, "packages/app/dist") });
  });

  it("does not serve an unrelated package that happens to sit at ../../app", async () => {
    // An installed karasu: node_modules/karasu/dist → node_modules/app/dist
    const cliDir = join(root, "node_modules/karasu/dist");
    await writeAppPackage(join(root, "node_modules/app"), "app");
    await writeIndex(join(root, "node_modules/app/dist"));
    expect(findAppDistDir(cliDir)).toEqual({
      dir: null,
      inMonorepo: false,
      tried: [join(cliDir, "app")],
    });
  });

  it("reports both places in the monorepo when the app has not been built", async () => {
    const cliDir = join(root, "packages/cli/dist");
    await writeAppPackage(join(root, "packages/app"), "@karasu-tools/app");
    expect(findAppDistDir(cliDir)).toEqual({
      dir: null,
      inMonorepo: true,
      tried: [join(cliDir, "app"), join(root, "packages/app/dist")],
    });
  });
});

describe("missingAppMessage", () => {
  it("tells an npm user to reinstall, not to run a monorepo command (#3017)", () => {
    const message = missingAppMessage({ inMonorepo: false, tried: ["/x/dist/app"] });
    expect(message).toContain("/x/dist/app");
    expect(message).toContain("karasu@latest");
    expect(message).not.toMatch(/pnpm|--workspace|--filter/);
  });

  it("tells a monorepo contributor which build to run", () => {
    const message = missingAppMessage({
      inMonorepo: true,
      tried: ["/r/packages/cli/dist/app", "/r/packages/app/dist"],
    });
    expect(message).toContain("/r/packages/app/dist");
    expect(message).toContain("pnpm --filter @karasu-tools/app run build");
  });
});
