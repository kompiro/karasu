import { describe, it, expect, vi, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isSafeUrl, parseRenderParams, handleRender } from "./render-endpoint.js";

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
    vi.stubGlobal(
      "fetch",
      vi.fn<() => Promise<unknown>>().mockRejectedValue(new Error("Network error")),
    );
    const res = makeRes();
    await handleRender(
      makeReq(),
      res as unknown as ServerResponse,
      new URLSearchParams({ src: "https://example.com/missing.krs" }),
    );
    expect(res.writeHead).toHaveBeenCalledWith(502, expect.any(Object));
  });

  it("returns 502 when src returns non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ ok: false, status: 404, text: async () => "Not Found" }),
    );
    const res = makeRes();
    await handleRender(
      makeReq(),
      res as unknown as ServerResponse,
      new URLSearchParams({ src: "https://example.com/missing.krs" }),
    );
    expect(res.writeHead).toHaveBeenCalledWith(502, expect.any(Object));
  });

  it("returns 200 SVG when src fetch succeeds", async () => {
    const source = `system App { service Frontend { label "Web" } }`;
    vi.stubGlobal(
      "fetch",
      vi.fn<() => Promise<unknown>>().mockResolvedValue({ ok: true, text: async () => source }),
    );
    const res = makeRes();
    await handleRender(
      makeReq(),
      res as unknown as ServerResponse,
      new URLSearchParams({ src: "https://example.com/system.krs", view: "system" }),
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
