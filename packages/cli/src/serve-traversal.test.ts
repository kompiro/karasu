import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { connect, type AddressInfo } from "node:net";
import type { Server } from "node:http";

vi.mock("chokidar", () => ({
  watch: vi.fn<() => object>(() => ({ on: vi.fn<() => void>().mockReturnThis() })),
}));

import { serve } from "./serve.js";

// Traversal payloads against the whole HTTP surface of `karasu serve`, not one
// resolver (TPL-168): every route prefix the server answers, plus the static
// asset branch, which joins the request path onto the app directory with no
// bounds check of its own and relies on the URL parser dropping dot segments.
// A file outside both the served directory and the app directory holds a
// sentinel; no response may carry it. The routes are listed by hand, so a new
// route is fuzzed only once it is added here: a related test for TPL-168, not
// a guard of it.

const SENTINEL = "SENTINEL-OUTSIDE-THE-ROOT";

const PREFIXES = [
  "/",
  "/api/file/",
  "/api/files/",
  "/api/project/",
  "/api/default/",
  "/api/watch/",
  "/render/",
  "/assets/",
];

const PAYLOADS = [
  "../outside/secret",
  "../../outside/secret.krs",
  "../../../outside/secret.txt",
  "..%2foutside%2fsecret",
  "..%2F..%2Foutside%2Fsecret.txt",
  "%2e%2e/outside/secret",
  "%2e%2e%2f%2e%2e%2foutside%2fsecret.txt",
  "..\\outside\\secret",
  "..%5c..%5coutside%5csecret.txt",
  "secret%00.krs",
  "../outside/secret%00.txt",
  "....//outside/secret.txt",
  ".%2e/.%2e/outside/secret.txt",
];

/** Send a raw GET for `target` and resolve with the whole response text. */
function rawGet(port: number, target: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: "127.0.0.1", port });
    let data = "";
    socket.on("data", (chunk: Buffer) => {
      data += chunk.toString();
    });
    socket.on("end", () => resolve(data));
    socket.on("error", reject);
    socket.write(`GET ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
  });
}

describe("serve answers no traversal payload with a file outside its roots (TPL-168)", () => {
  let base: string;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "karasu-traversal-"));
    // root/ is served, app/ is the app build, outside/ must stay unreachable.
    // Nested one level so `../../` from either root still lands in `base`.
    for (const dir of ["nest/root", "nest/app", "outside", "nest/outside"]) {
      await mkdir(join(base, dir), { recursive: true });
    }
    for (const dir of ["outside", "nest/outside"]) {
      await writeFile(join(base, dir, "secret.krs"), `system ${SENTINEL} {}`);
      await writeFile(join(base, dir, "secret.txt"), SENTINEL);
      await writeFile(join(base, dir, "secret"), SENTINEL);
    }
    await writeFile(join(base, "nest/root/index.krs"), "system App {}");
    await writeFile(join(base, "nest/app/index.html"), "<div id=root></div>");
    server = serve(join(base, "nest/root"), 0, { appDistDir: join(base, "nest/app") });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(base, { recursive: true });
  });

  it("serves the app at all, so a refusal below is not just a dead server", async () => {
    expect(await rawGet(port, "/")).toContain("<div id=root></div>");
  });

  it.each(PREFIXES.flatMap((prefix) => PAYLOADS.map((payload) => `${prefix}${payload}`)))(
    "%s",
    async (target) => {
      // /api/watch/ is not /api/watch, so no SSE stream holds the socket open.
      expect(await rawGet(port, target)).not.toContain(SENTINEL);
    },
  );
});
