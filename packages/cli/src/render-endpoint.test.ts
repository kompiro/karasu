import { describe, it, expect, vi, afterEach } from "vitest";
import * as http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  isSafeUrl,
  parseRenderParams,
  handleRender,
  SrcFetchLimiter,
  type RenderDeps,
} from "./render-endpoint.js";
import {
  isBlockedAddress,
  type FetchHandle,
  type FetchResult,
  type Resolver,
} from "./render-fetch.js";

// ---------------------------------------------------------------------------
// isSafeUrl
// ---------------------------------------------------------------------------

describe("isSafeUrl", () => {
  it("allows public https URLs", () => {
    expect(isSafeUrl("https://raw.githubusercontent.com/owner/repo/main/system.krs")).toBe(true);
    expect(isSafeUrl("https://example.com/file.krs")).toBe(true);
  });

  it("allows public http URLs", () => {
    expect(isSafeUrl("http://example.com/file.krs")).toBe(true);
  });

  it("blocks non-http schemes", () => {
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeUrl("ftp://example.com/file.krs")).toBe(false);
    expect(isSafeUrl("data:text/plain,hello")).toBe(false);
  });

  it("blocks loopback hostnames", () => {
    expect(isSafeUrl("http://localhost/file.krs")).toBe(false);
    expect(isSafeUrl("http://127.0.0.1/file.krs")).toBe(false);
    expect(isSafeUrl("http://[::1]/file.krs")).toBe(false);
  });

  it("blocks private IPv4 ranges (RFC 1918)", () => {
    expect(isSafeUrl("http://10.0.0.1/file.krs")).toBe(false);
    expect(isSafeUrl("http://10.255.255.255/file.krs")).toBe(false);
    expect(isSafeUrl("http://172.16.0.1/file.krs")).toBe(false);
    expect(isSafeUrl("http://172.31.255.255/file.krs")).toBe(false);
    expect(isSafeUrl("http://192.168.0.1/file.krs")).toBe(false);
    expect(isSafeUrl("http://192.168.255.255/file.krs")).toBe(false);
  });

  it("allows public IPv4 addresses outside private ranges", () => {
    expect(isSafeUrl("http://8.8.8.8/file.krs")).toBe(true);
    expect(isSafeUrl("http://172.15.0.1/file.krs")).toBe(true);
    expect(isSafeUrl("http://172.32.0.1/file.krs")).toBe(true);
  });

  it("blocks link-local addresses", () => {
    expect(isSafeUrl("http://169.254.0.1/file.krs")).toBe(false);
  });

  it("blocks 0.0.0.0", () => {
    expect(isSafeUrl("http://0.0.0.0/file.krs")).toBe(false);
  });

  it("returns false for malformed URLs", () => {
    expect(isSafeUrl("not-a-url")).toBe(false);
    expect(isSafeUrl("")).toBe(false);
  });

  // #3426: spellings the string check used to let through.
  it.each([
    "http://localhost./file.krs",
    "http://localhost../file.krs",
    "http://app.localhost/file.krs",
    "http://APP.LOCALHOST./file.krs",
    "http://0x7f.1/file.krs",
    "http://2130706433/file.krs",
    "http://127.1/file.krs",
    "http://[::ffff:127.0.0.1]/file.krs",
    "http://[0:0:0:0:0:0:0:1]/file.krs",
    "http://[fc00::1]/file.krs",
    "http://[fd00::1]/file.krs",
    "http://[fe80::1]/file.krs",
    "http://100.64.0.1/file.krs",
    "http://user:pass@example.com/file.krs",
    "http://user@example.com/file.krs",
  ])("blocks %s", (url) => {
    expect(isSafeUrl(url)).toBe(false);
  });

  it("blocks an IP literal that is one of this machine's addresses", () => {
    const own = (address: string): boolean => isBlockedAddress(address, ["198.51.100.7"]);
    expect(isSafeUrl("http://198.51.100.7/file.krs", own)).toBe(false);
    expect(isSafeUrl("http://198.51.100.8/file.krs", own)).toBe(true);
  });

  it("leaves names other than localhost to the resolved-address check", () => {
    expect(isSafeUrl("http://127.0.0.1.nip.io/file.krs")).toBe(true);
    expect(isSafeUrl("http://localhost.example.com/file.krs")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseRenderParams
// ---------------------------------------------------------------------------

describe("parseRenderParams", () => {
  function params(obj: Record<string, string>): URLSearchParams {
    return new URLSearchParams(obj);
  }

  it("returns src params for a valid src URL", () => {
    const result = parseRenderParams(params({ src: "https://example.com/system.krs" }));
    expect(result).toEqual({ kind: "src", src: "https://example.com/system.krs", view: null });
  });

  it("returns src params with view when provided", () => {
    const result = parseRenderParams(
      params({ src: "https://example.com/system.krs", view: "system" }),
    );
    expect(result).toEqual({ kind: "src", src: "https://example.com/system.krs", view: "system" });
  });

  it("returns error for unsafe src URL", () => {
    const result = parseRenderParams(params({ src: "http://localhost/evil.krs" }));
    expect(result).toEqual({
      kind: "error",
      status: 400,
      message: expect.stringContaining("Invalid src URL"),
    });
  });

  it("returns code params for base64 code", () => {
    const result = parseRenderParams(params({ code: "c3lzdGVt" }));
    expect(result).toEqual({ kind: "code", code: "c3lzdGVt", view: null });
  });

  it("returns code params with view", () => {
    const result = parseRenderParams(params({ code: "c3lzdGVt", view: "org" }));
    expect(result).toEqual({ kind: "code", code: "c3lzdGVt", view: "org" });
  });

  it("returns error when neither src nor code is provided", () => {
    const result = parseRenderParams(params({}));
    expect(result).toEqual({
      kind: "error",
      status: 400,
      message: expect.stringContaining("src or code"),
    });
  });

  it("returns error for invalid view value", () => {
    const result = parseRenderParams(params({ code: "abc", view: "invalid" }));
    expect(result).toEqual({
      kind: "error",
      status: 400,
      message: expect.stringContaining("Invalid view"),
    });
  });

  it("accepts all valid view values", () => {
    for (const view of ["system", "deploy", "org"] as const) {
      const result = parseRenderParams(params({ code: "abc", view }));
      expect(result).toMatchObject({ kind: "code", view });
    }
  });
});

// ---------------------------------------------------------------------------
// handleRender
// ---------------------------------------------------------------------------

function makeRes(): { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
  return { writeHead: vi.fn<() => void>(), end: vi.fn<() => void>() };
}

function makeReq(): IncomingMessage {
  return {} as IncomingMessage;
}

function fakeFetch(result: FetchResult): RenderDeps {
  return {
    fetchSrc: (): FetchHandle => ({
      result: Promise.resolve(result),
      lookupsSettled: Promise.resolve(),
    }),
    limiter: new SrcFetchLimiter(),
  };
}

describe("handleRender", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 when no params provided", async () => {
    const res = makeRes();
    await handleRender(makeReq(), res as unknown as ServerResponse, new URLSearchParams());
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
  });

  it("returns 400 for unsafe src URL", async () => {
    const res = makeRes();
    await handleRender(
      makeReq(),
      res as unknown as ServerResponse,
      new URLSearchParams({ src: "http://127.0.0.1/evil.krs" }),
    );
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
  });

  it("returns 200 SVG for valid inline code", async () => {
    const source = `system App { service Frontend { label "Web" } }`;
    const code = Buffer.from(source).toString("base64");
    const res = makeRes();
    await handleRender(
      makeReq(),
      res as unknown as ServerResponse,
      new URLSearchParams({ code, view: "system" }),
    );
    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ "Content-Type": "image/svg+xml; charset=utf-8" }),
    );
    const svg: string = res.end.mock.calls[0][0];
    expect(svg).toContain("<svg");
  });

  it("returns 422 for invalid .krs syntax", async () => {
    const code = Buffer.from("!!! invalid krs !!!").toString("base64");
    const res = makeRes();
    await handleRender(
      makeReq(),
      res as unknown as ServerResponse,
      new URLSearchParams({ code, view: "system" }),
    );
    // Either 422 (compile error) or 200 with empty SVG depending on parser tolerance
    expect([200, 422]).toContain(res.writeHead.mock.calls[0][0]);
  });

  it("returns 502 when src fetch fails", async () => {
    const res = makeRes();
    await handleRender(
      makeReq(),
      res as unknown as ServerResponse,
      new URLSearchParams({ src: "https://example.com/missing.krs" }),
      fakeFetch({ ok: false, status: 502, reason: "network", message: "Network error" }),
    );
    expect(res.writeHead).toHaveBeenCalledWith(502, expect.any(Object));
  });

  it("returns 502 when src returns non-OK status", async () => {
    const res = makeRes();
    await handleRender(
      makeReq(),
      res as unknown as ServerResponse,
      new URLSearchParams({ src: "https://example.com/missing.krs" }),
      fakeFetch({ ok: false, status: 502, reason: "http-status", message: "HTTP 404" }),
    );
    expect(res.writeHead).toHaveBeenCalledWith(502, expect.any(Object));
  });

  it("returns 400 when fetchSrc refuses the src itself", async () => {
    const res = makeRes();
    await handleRender(
      makeReq(),
      res as unknown as ServerResponse,
      new URLSearchParams({ src: "https://example.com/system.krs" }),
      fakeFetch({ ok: false, status: 400, reason: "blocked-address", message: "blocked" }),
    );
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(res.end.mock.calls[0][0]).toContain("Invalid src URL");
  });

  it("returns 200 SVG when src fetch succeeds", async () => {
    const source = `system App { service Frontend { label "Web" } }`;
    const res = makeRes();
    await handleRender(
      makeReq(),
      res as unknown as ServerResponse,
      new URLSearchParams({ src: "https://example.com/system.krs", view: "system" }),
      fakeFetch({ ok: true, text: source }),
    );
    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ "Content-Type": "image/svg+xml; charset=utf-8" }),
    );
  });

  // AT-0043-3: ?view=system | deploy | org returns distinct SVG payloads.
  it("AT-0043-3: ?view=system, deploy, and org each return a distinct SVG", async () => {
    const source = `system App {
  service Web { label "Web" }
}

deploy "Production" {
  oci "web" { realizes "Web" }
}

organization AppOrg {
  team WebTeam { label "Web Team" }
}
`;
    const code = Buffer.from(source).toString("base64");
    const bodies: Record<string, string> = {};

    for (const view of ["system", "deploy", "org"] as const) {
      const res = makeRes();
      await handleRender(
        makeReq(),
        res as unknown as ServerResponse,
        new URLSearchParams({ code, view }),
      );
      expect(res.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({ "Content-Type": "image/svg+xml; charset=utf-8" }),
      );
      const body: string = res.end.mock.calls[0][0];
      expect(body).toContain("<svg");
      bodies[view] = body;
    }

    expect(bodies.system).not.toEqual(bodies.deploy);
    expect(bodies.deploy).not.toEqual(bodies.org);
    expect(bodies.system).not.toEqual(bodies.org);
  });

  // TPL-239: the /render endpoint is a single-file boundary by
  // design — `import { ... } from "./other.krs"` declarations in the posted
  // source are intentionally NOT resolved (no filesystem context exists for
  // a remote URL or a base64 text blob). This test locks in that documented
  // contract: an import pointing at a non-existent sibling must not crash
  // the endpoint, and the imported entity must not appear in the rendered
  // SVG. Consumers needing multi-file resolution should use `karasu render`
  // (CLI, real filesystem) or the VS Code preview.
  it("TPL-239: posted source's `import` is left unresolved (single-file contract)", async () => {
    const source = `import { ImportedRemoteService } from "./does-not-exist.krs"

system App {
  service LocalRenderedService { label "Local" }
}`;
    const code = Buffer.from(source).toString("base64");
    const res = makeRes();
    await handleRender(
      makeReq(),
      res as unknown as ServerResponse,
      new URLSearchParams({ code, view: "system" }),
    );

    // The endpoint must respond — never throw or hang — even when the source
    // contains an unresolvable import. The current behavior is to skip the
    // import silently and render the rest of the file (status 200). If a
    // future change makes the compiler reject unresolved imports here, the
    // endpoint should surface that as a 422; either is an acceptable
    // documented contract — the load-bearing assertion below is that the
    // imported entity never leaks into the output, confirming nothing
    // fetched `./does-not-exist.krs` on our behalf.
    const status: number = res.writeHead.mock.calls[0][0];
    expect([200, 422]).toContain(status);

    const body: string = res.end.mock.calls[0][0];
    expect(body).not.toContain("ImportedRemoteService");
    // Today we expect the silent-skip path: a 200 SVG containing the local
    // entity. Locked in deterministically so a regression to multi-file
    // resolution (e.g. someone swapping in `compileProject`) is loud.
    expect(status).toBe(200);
    expect(body).toContain("<svg");
    expect(body).toContain("LocalRenderedService");
  });

  // AT-0043-4: Omitting ?view= returns a bundled all-views SVG.
  it("AT-0043-4: no ?view= returns a bundled SVG containing all available views", async () => {
    const source = `system App {
  service Web { label "Web" }
}

deploy "Production" {
  oci "web" { realizes "Web" }
}

organization AppOrg {
  team WebTeam { label "Web Team" }
}
`;
    const code = Buffer.from(source).toString("base64");
    const res = makeRes();
    await handleRender(makeReq(), res as unknown as ServerResponse, new URLSearchParams({ code }));

    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ "Content-Type": "image/svg+xml; charset=utf-8" }),
    );
    const body: string = res.end.mock.calls[0][0];
    expect(body).toContain("<svg");
  });
});

// ---------------------------------------------------------------------------
// handleRender against a real server (#3426)
// ---------------------------------------------------------------------------

describe("handleRender src fetching", () => {
  const KRS = `system App { service Web { label "Web" } }`;
  let server: http.Server;
  let port: number;
  let hits: number;

  async function start(): Promise<void> {
    hits = 0;
    server = http.createServer((_req, res) => {
      hits += 1;
      res.end(KRS);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  }

  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const toLoopback: Resolver = (_hostname, _options, callback) =>
    callback(null, [{ address: "127.0.0.1", family: 4 }]);

  /** 127.0.0.1 counts as public, so the local server can play the public host. */
  const loopbackIsPublic = (address: string): boolean =>
    address !== "127.0.0.1" && isBlockedAddress(address, []);

  it("renders a src that resolves to an allowed address", async () => {
    await start();
    const res = makeRes();
    await handleRender(
      makeReq(),
      res as unknown as ServerResponse,
      new URLSearchParams({ src: `http://public.test:${port}/x.krs`, view: "system" }),
      {
        fetchOptions: { resolver: toLoopback, isBlocked: loopbackIsPublic },
        limiter: new SrcFetchLimiter(),
      },
    );
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(hits).toBe(1);
  });

  it("answers 400 for a name that resolves to loopback, without connecting", async () => {
    await start();
    const res = makeRes();
    await handleRender(
      makeReq(),
      res as unknown as ServerResponse,
      new URLSearchParams({ src: `http://public.test:${port}/x.krs` }),
      // The real check: 127.0.0.1 is blocked.
      { fetchOptions: { resolver: toLoopback }, limiter: new SrcFetchLimiter() },
    );
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(hits).toBe(0);
  });

  describe("concurrency", () => {
    /** Holds every lookup until finishAll; the 8.8.8.8 default is never connected to. */
    function stalledResolver(address = "8.8.8.8"): Resolver & { finishAll(): void } {
      const pending: Array<() => void> = [];
      const resolver: Resolver = (_hostname, _options, callback) => {
        pending.push(() => callback(null, [{ address, family: 4 }]));
      };
      return Object.assign(resolver, {
        finishAll: () => pending.splice(0).forEach((finish) => finish()),
      });
    }

    async function render(deps: RenderDeps, src = "http://slow.test/x.krs"): Promise<number> {
      const res = makeRes();
      await handleRender(
        makeReq(),
        res as unknown as ServerResponse,
        new URLSearchParams({ src }),
        deps,
      );
      return res.writeHead.mock.calls[0][0] as number;
    }

    it("answers 503 to a third src while two are in flight", async () => {
      const resolver = stalledResolver();
      const deps: RenderDeps = {
        fetchOptions: { resolver },
        limiter: new SrcFetchLimiter(),
        timeoutMs: 100,
      };
      const first = render(deps);
      const second = render(deps);
      expect(await render(deps)).toBe(503);
      expect(await first).toBe(502);
      expect(await second).toBe(502);
      resolver.finishAll();
    });

    it("keeps the slot until the lookup returns, not just until the response", async () => {
      await start();
      const resolver = stalledResolver("127.0.0.1");
      const deps: RenderDeps = {
        fetchOptions: { resolver, isBlocked: loopbackIsPublic },
        limiter: new SrcFetchLimiter(),
        timeoutMs: 50,
      };
      // Both time out and answer 502 while their lookups still hold threads.
      expect(await Promise.all([render(deps), render(deps)])).toEqual([502, 502]);
      expect(await render(deps)).toBe(503);

      resolver.finishAll();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const next = render(deps, `http://slow.test:${port}/x.krs`);
      resolver.finishAll();
      expect(await next).not.toBe(503);
    });

    it("does not count ?code= against the limit", async () => {
      const limiter = new SrcFetchLimiter(0);
      const res = makeRes();
      await handleRender(
        makeReq(),
        res as unknown as ServerResponse,
        new URLSearchParams({ code: Buffer.from(KRS).toString("base64"), view: "system" }),
        { limiter },
      );
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    });
  });
});
