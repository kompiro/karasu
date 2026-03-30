import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import type { ServerResponse, Server } from "node:http";
import * as http from "node:http";

vi.mock("chokidar", () => ({
  watch: vi.fn(() => ({ on: vi.fn().mockReturnThis() })),
}));

import {
  collectKrsFiles,
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

  it("returns null for a path traversal attempt", async () => {
    expect(await resolveKrsFile(tmpDir, "../../etc/passwd")).toBeNull();
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
    return { writeHead: vi.fn(), end: vi.fn() };
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
    it("returns 503 when the app has not been built", async () => {
      const { status } = await get(port, "/");
      expect(status).toBe(503);
    });

    it("returns 503 for unknown asset paths", async () => {
      const { status } = await get(port, "/assets/unknown.js");
      expect(status).toBe(503);
    });
  });
});
