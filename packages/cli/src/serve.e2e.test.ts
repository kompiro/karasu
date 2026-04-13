import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as http from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolveDefaultFile, serve } from "./serve.js";

/**
 * AT-0032: karasu serve — end-to-end with the real file watcher.
 *
 * The existing serve.test.ts mocks chokidar, which makes it impossible
 * to exercise the live-reload SSE path. This file leaves the watcher
 * intact so we can drive the full TC-04 (real-time update) scenario
 * and the TC-05 fallback that the unit tests do not cover.
 */

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise, reject) => {
    const req = http.request({ host: "localhost", port, path }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("AT-0032 karasu serve — integration (real watcher)", () => {
  let tmpDir: string;
  let server: Server;
  let port: number;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-serve-e2e-"));
    writeFileSync(join(tmpDir, "index.krs"), "system Original {}");
    server = serve(tmpDir, 0);
    await new Promise<void>((r) => server.once("listening", r));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("serves the seeded index.krs through /api/file/index (TC-02)", async () => {
    const { status, body } = await get(port, "/api/file/index");
    expect(status).toBe(200);
    expect(body).toBe("system Original {}");
  });

  it("emits an SSE event when a watched file is rewritten (TC-04)", async () => {
    const events = await new Promise<string>((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        req.destroy();
        reject(new Error("Did not receive a change event within 5s"));
      }, 5000);

      let buffer = "";
      const req = http.request({ host: "localhost", port, path: "/api/watch" }, (res) => {
        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          // The initial keep-alive comment is `: connected`. After that we
          // expect a real `data:` line once the watcher fires.
          if (/^data:/m.test(buffer)) {
            clearTimeout(timer);
            req.destroy();
            resolvePromise(buffer);
          }
        });
        res.on("error", () => {
          // ECONNRESET on destroy is expected.
        });
      });
      req.on("error", (err) => {
        if ((err as NodeJS.ErrnoException).code !== "ECONNRESET") reject(err);
      });
      req.end();

      // Give the SSE pipe a moment to subscribe before we mutate the file.
      setTimeout(() => {
        writeFileSync(join(tmpDir, "index.krs"), "system Updated {}");
      }, 300);
    });

    expect(events).toMatch(/^data:/m);
  });
});

describe("AT-0032 karasu serve — default file fallback (TC-05)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "karasu-serve-default-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns the lone .krs file name when index.krs is absent", async () => {
    writeFileSync(join(tmpDir, "system.krs"), "system Solo {}");
    expect(await resolveDefaultFile(tmpDir)).toBe("system");
  });

  it("returns null when multiple .krs files exist with no index.krs", async () => {
    writeFileSync(join(tmpDir, "a.krs"), "");
    writeFileSync(join(tmpDir, "b.krs"), "");
    expect(await resolveDefaultFile(tmpDir)).toBeNull();
  });
});

describe("AT-0032 karasu serve — startup banner (TC-01)", () => {
  it("writes the karasu serve banner with the resolved directory and preview URL", async () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    const tmpDir = mkdtempSync(join(tmpdir(), "karasu-serve-banner-"));
    const server = serve(tmpDir, 0);
    try {
      await new Promise<void>((r) => server.once("listening", r));
      // Allow the listen callback (and its writes) to flush.
      await new Promise<void>((r) => setTimeout(r, 10));
      const out = writes.join("");
      expect(out).toContain("karasu serve");
      expect(out).toContain("Directory");
      expect(out).toContain("Preview");
      expect(out).toContain("http://localhost:");
    } finally {
      spy.mockRestore();
      await new Promise<void>((r) => server.close(() => r()));
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
