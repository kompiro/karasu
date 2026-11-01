import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import * as zlib from "node:zlib";
import {
  MAX_BODY_BYTES,
  fetchSrc,
  guardedLookup,
  interfaceAddresses,
  isBlockedAddress,
  normalizeAddress,
  type FetchResult,
  type Resolver,
} from "./render-fetch.js";

// An address outside every blocked range (TEST-NET-2), standing in for one of
// this machine's own interface addresses.
const OWN = "198.51.100.7";

/**
 * The real check, except that 127.0.0.1 counts as public so a local server can
 * play the public host, and the interface list is replaced (the real `lo`
 * carries 127.0.0.1 and `::1`).
 */
function testIsBlocked(ownAddresses: readonly string[] = [OWN]) {
  return (address: string): boolean =>
    normalizeAddress(address) !== "127.0.0.1" && isBlockedAddress(address, ownAddresses);
}

/** Resolves the names in `table`, and records every call. */
function tableResolver(table: Record<string, string[]>): Resolver & { calls: string[] } {
  const calls: string[] = [];
  const resolver: Resolver = (hostname, _options, callback) => {
    calls.push(hostname);
    const addresses = table[hostname];
    if (addresses === undefined) {
      callback(Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: "ENOTFOUND" }), []);
      return;
    }
    callback(
      null,
      addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })),
    );
  };
  return Object.assign(resolver, { calls });
}

interface TestServer {
  port: number;
  requests: http.IncomingMessage[];
  close(): Promise<void>;
}

async function startServer(
  host: string,
  handler: http.RequestListener = (_req, res) => res.end("ok"),
): Promise<TestServer> {
  const requests: http.IncomingMessage[] = [];
  const server = http.createServer((req, res) => {
    requests.push(req);
    handler(req, res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  return {
    port: (server.address() as AddressInfo).port,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const KRS = `system App { service Web { label "Web" } }`;

let publicServer: TestServer;
// Counts requests that reach 127.0.0.2, a blocked address. Null where the
// platform cannot listen there (macOS); those tests then check the reason only.
let internalServer: TestServer | null;
let resolver: ReturnType<typeof tableResolver>;
let streamingClosed = false;

function publicUrl(path: string): string {
  return `http://public.test:${publicServer.port}${path}`;
}

function internalPort(): number {
  return internalServer?.port ?? 9;
}

beforeAll(async () => {
  publicServer = await startServer("127.0.0.1", (req, res) => {
    const url = new URL(req.url ?? "/", "http://public.test");
    const chain = /^\/chain\/(\d+)$/.exec(url.pathname);
    if (chain) {
      const left = Number(chain[1]);
      if (left === 0) res.end(KRS);
      else res.writeHead(302, { Location: `/chain/${left - 1}` }).end();
      return;
    }
    switch (url.pathname) {
      case "/ok":
        res.end(KRS);
        return;
      case "/redirect":
        res.writeHead(302, { Location: url.searchParams.get("to") ?? "" }).end();
        return;
      case "/no-location":
        res.writeHead(302).end();
        return;
      case "/missing":
        res.writeHead(404).end("not here");
        return;
      case "/big":
        res.end("x".repeat(MAX_BODY_BYTES + 1));
        return;
      case "/gzip":
        res.writeHead(200, { "Content-Encoding": "gzip" }).end(zlib.gzipSync(KRS));
        return;
      case "/br":
        res.writeHead(200, { "Content-Encoding": "br" }).end(zlib.brotliCompressSync(KRS));
        return;
      case "/deflate":
        res.writeHead(200, { "Content-Encoding": "deflate" }).end(zlib.deflateSync(KRS));
        return;
      case "/bomb":
        // About 4 KiB on the wire, 4 MiB once decompressed.
        res
          .writeHead(200, { "Content-Encoding": "gzip" })
          .end(zlib.gzipSync(Buffer.alloc(4 * 1024 * 1024)));
        return;
      case "/empty-gzip-members": {
        // Decompresses to nothing, so only a cap on the raw bytes stops it.
        const member = zlib.gzipSync("");
        res.writeHead(200, { "Content-Encoding": "gzip" });
        res.end(
          Buffer.concat(
            Array.from({ length: Math.ceil((MAX_BODY_BYTES * 2) / member.length) }, () => member),
          ),
        );
        return;
      }
      case "/redirect-streaming": {
        // A redirect whose body never ends, to a target that fails at once.
        res.writeHead(302, { Location: "file:///etc/passwd" });
        const timer = setInterval(() => res.write(Buffer.alloc(64 * 1024)), 5);
        res.on("close", () => {
          clearInterval(timer);
          streamingClosed = true;
        });
        return;
      }
      case "/compress":
        res.writeHead(200, { "Content-Encoding": "compress" }).end(KRS);
        return;
      default:
        res.writeHead(404).end();
    }
  });
  try {
    internalServer = await startServer("127.0.0.2");
  } catch {
    internalServer = null;
  }
});

afterAll(async () => {
  await publicServer.close();
  await internalServer?.close();
});

function fetchWith(
  url: string,
  options: { isBlocked?: (address: string) => boolean; timeoutMs?: number } = {},
): Promise<FetchResult> {
  resolver = tableResolver({
    "public.test": ["127.0.0.1"],
    "internal.test": ["127.0.0.2"],
    "mixed.test": ["127.0.0.1", "10.0.0.1"],
  });
  return fetchSrc(url, {
    signal: AbortSignal.timeout(options.timeoutMs ?? 2_000),
    resolver,
    isBlocked: options.isBlocked ?? testIsBlocked(),
  }).result;
}

async function until(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function expectNoInternalRequest(): void {
  expect(internalServer?.requests ?? []).toHaveLength(0);
}

// ---------------------------------------------------------------------------
// normalizeAddress / isBlockedAddress
// ---------------------------------------------------------------------------

describe("normalizeAddress", () => {
  // Node 24's BlockList matches IPv4-mapped addresses by itself, so the
  // isBlockedAddress table alone cannot notice a missing normalizer on CI.
  it.each([
    ["[::1]", "::1"],
    ["::ffff:7f00:1", "127.0.0.1"],
    ["::ffff:127.0.0.1", "127.0.0.1"],
    ["[::ffff:7f00:1]", "127.0.0.1"],
    ["0:0:0:0:0:ffff:7f00:1", "127.0.0.1"],
    ["0:0:0:0:0:0:0:1", "::1"],
    ["FE80::1%eth0", "fe80::1"],
    ["8.8.8.8", "8.8.8.8"],
    ["not-an-ip", "not-an-ip"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeAddress(input)).toBe(expected);
  });
});

describe("isBlockedAddress", () => {
  const blocked = (address: string): boolean => isBlockedAddress(address, [OWN]);

  it.each([
    "0.0.0.0",
    "0.255.255.255",
    "::",
    "127.0.0.1",
    "127.255.255.255",
    "::1",
    "10.0.0.0",
    "10.255.255.255",
    "172.16.0.0",
    "172.31.255.255",
    "192.168.0.1",
    "100.64.0.0",
    "100.127.255.255",
    "169.254.169.254",
    "fe80::1",
    "febf::1",
    "fc00::1",
    "fd00::1",
    "fd00:ec2::254",
    "192.0.0.1",
    "198.18.0.1",
    "198.19.255.255",
    "224.0.0.1",
    "239.255.255.255",
    "240.0.0.1",
    "255.255.255.255",
    "ff02::1",
    // bracketed, as url.hostname spells IPv6
    "[::1]",
    "[::ffff:7f00:1]",
    // IPv4-mapped
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:a00:1",
    // spelled out in full
    "0:0:0:0:0:0:0:1",
    "0000:0000:0000:0000:0000:ffff:7f00:0001",
    // this machine's own address, in every spelling
    OWN,
    `::ffff:${OWN}`,
    "::ffff:c633:6407",
    // not an IP: fail closed
    "not-an-ip",
    "127.0.0.1.",
    "",
  ])("blocks %s", (address) => {
    expect(blocked(address)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "9.255.255.255",
    "11.0.0.0",
    "172.15.255.255",
    "172.32.0.0",
    "100.63.255.255",
    "100.128.0.0",
    "198.17.255.255",
    "198.20.0.0",
    "223.255.255.255",
    "198.51.100.8",
    "2001:4860:4860::8888",
    "fec0::1",
    "::ffff:8.8.8.8",
  ])("allows %s", (address) => {
    expect(blocked(address)).toBe(false);
  });

  it("lists IPv4 interfaces by address and IPv6 ones by their on-link prefix", () => {
    const info = { netmask: "", mac: "00:00:00:00:00:00", internal: false };
    expect(
      interfaceAddresses({
        eth0: [
          { ...info, address: OWN, family: "IPv4", cidr: `${OWN}/24` },
          {
            ...info,
            address: "2001:db8:1::5",
            family: "IPv6",
            cidr: "2001:db8:1::5/64",
            scopeid: 0,
          },
        ],
      }),
    ).toEqual([OWN, "2001:db8:1::5/64"]);
  });

  it("blocks the on-link prefix of a global IPv6 interface address", () => {
    const own = ["2001:db8:1::5/64"];
    expect(isBlockedAddress("2001:db8:1::1", own)).toBe(true);
    expect(isBlockedAddress("2001:db8:1:0:ffff::1", own)).toBe(true);
    expect(isBlockedAddress("2001:db8:2::1", own)).toBe(false);
  });

  it("reads this machine's interfaces when none are given", () => {
    // `lo` is always there, and 127.0.0.1 is blocked by range anyway; this
    // only shows the default path runs without being handed a list.
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
    expect(isBlockedAddress("127.0.0.1")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fetchSrc
// ---------------------------------------------------------------------------

describe("fetchSrc", () => {
  it("fetches a public URL and sends the marker header", async () => {
    const before = publicServer.requests.length;
    expect(await fetchWith(publicUrl("/ok"))).toEqual({ ok: true, text: KRS });
    const sent = publicServer.requests[before];
    expect(sent.headers["x-karasu-render"]).toBe("1");
    expect(sent.headers["user-agent"]).toBe("karasu-render/1.0");
    expect(sent.headers.authorization).toBeUndefined();
  });

  it("refuses a name that resolves to loopback before connecting (400)", async () => {
    const before = publicServer.requests.length;
    // The real check: 127.0.0.1 is blocked.
    const result = await fetchWith(publicUrl("/ok"), {
      isBlocked: (address) => isBlockedAddress(address, []),
    });
    expect(result).toMatchObject({ ok: false, status: 400, reason: "blocked-address" });
    expect(publicServer.requests).toHaveLength(before);
  });

  it("refuses a name when any of its addresses is blocked", async () => {
    const before = publicServer.requests.length;
    const result = await fetchWith(`http://mixed.test:${publicServer.port}/ok`);
    expect(result).toMatchObject({ ok: false, status: 400, reason: "blocked-address" });
    expect(publicServer.requests).toHaveLength(before);
  });

  it("does not tell the client which address a name resolved to", async () => {
    // The message reaches the /render client; naming the address would turn
    // /render into a resolver for the server's internal DNS.
    const result = await fetchWith(`http://mixed.test:${publicServer.port}/ok`);
    expect(result).toMatchObject({ reason: "blocked-address", message: expect.any(String) });
    expect(JSON.stringify(result)).not.toContain("10.0.0.1");
  });

  it("refuses this machine's own address as src (400)", async () => {
    const result = await fetchWith(`http://${OWN}/ok`);
    expect(result).toMatchObject({ ok: false, status: 400, reason: "blocked-address" });
  });

  it("does not refuse that address once it is off the interface list (control)", async () => {
    const result = await fetchWith(`http://${OWN}:9/ok`, {
      isBlocked: testIsBlocked([]),
      timeoutMs: 300,
    });
    expect(result).toMatchObject({ ok: false });
    expect(result).not.toMatchObject({ reason: "blocked-address" });
  });

  it.each([
    ["userinfo", "http://user:pass@public.test/ok"],
    ["unsupported-scheme", "file:///etc/passwd"],
    ["invalid-url", "not a url"],
    ["blocked-address", "http://[::ffff:127.0.0.2]/"],
  ])("refuses a src with %s (400)", async (reason, url) => {
    expect(await fetchWith(url)).toMatchObject({ ok: false, status: 400, reason });
  });

  describe("redirects", () => {
    it.each([
      [
        "a name that resolves to a blocked address",
        () => `http://internal.test:${internalPort()}/`,
      ],
      ["an IPv4-mapped literal", () => `http://[::ffff:127.0.0.2]:${internalPort()}/`],
      ["this machine's own address", () => `http://${OWN}/`],
    ])("refuses a redirect to %s (502)", async (_label, target) => {
      const result = await fetchWith(publicUrl(`/redirect?to=${encodeURIComponent(target())}`));
      expect(result).toMatchObject({ ok: false, status: 502, reason: "blocked-address" });
      expectNoInternalRequest();
    });

    it("follows 5 redirects", async () => {
      expect(await fetchWith(publicUrl("/chain/5"))).toEqual({ ok: true, text: KRS });
    });

    it("gives up on the 6th redirect (502)", async () => {
      expect(await fetchWith(publicUrl("/chain/6"))).toMatchObject({
        ok: false,
        status: 502,
        reason: "too-many-redirects",
      });
    });

    it.each([
      ["redirect-without-location", "/no-location"],
      ["unsupported-scheme", "/redirect?to=file%3A%2F%2F%2Fetc%2Fpasswd"],
      ["userinfo", `/redirect?to=${encodeURIComponent("http://user:pass@public.test/ok")}`],
    ])("answers %s after a redirect with 502", async (reason, path) => {
      expect(await fetchWith(publicUrl(path))).toMatchObject({ ok: false, status: 502, reason });
    });
  });

  it("drops the connection of a redirect instead of reading its body", async () => {
    streamingClosed = false;
    const result = await fetchWith(publicUrl("/redirect-streaming"), { timeoutMs: 5_000 });
    expect(result).toMatchObject({ ok: false, status: 502, reason: "unsupported-scheme" });
    // Reading the body (resume) would keep the socket until the 5 s timeout.
    await until(() => streamingClosed, 500);
    expect(streamingClosed).toBe(true);
  });

  it("answers a non-2xx response with 502", async () => {
    expect(await fetchWith(publicUrl("/missing"))).toMatchObject({
      ok: false,
      status: 502,
      reason: "http-status",
    });
  });

  it("refuses a body over the limit (502)", async () => {
    expect(await fetchWith(publicUrl("/big"))).toMatchObject({
      ok: false,
      status: 502,
      reason: "too-large",
    });
  });

  it.each(["/gzip", "/br", "/deflate"])("decompresses %s", async (path) => {
    expect(await fetchWith(publicUrl(path))).toEqual({ ok: true, text: KRS });
  });

  it("stops decompressing at the limit (zip bomb)", async () => {
    expect(await fetchWith(publicUrl("/bomb"))).toMatchObject({
      ok: false,
      status: 502,
      reason: "too-large",
    });
  });

  it("caps the compressed bytes too (empty gzip members)", async () => {
    expect(await fetchWith(publicUrl("/empty-gzip-members"))).toMatchObject({
      ok: false,
      status: 502,
      reason: "too-large",
    });
  });

  it("refuses an encoding it cannot decompress (502)", async () => {
    expect(await fetchWith(publicUrl("/compress"))).toMatchObject({
      ok: false,
      status: 502,
      reason: "unsupported-encoding",
    });
  });

  it("calls lookup again for a second request to the same name (no keep-alive reuse)", async () => {
    const calls = tableResolver({ "public.test": ["127.0.0.1"] });
    for (let i = 0; i < 2; i++) {
      const { result } = fetchSrc(publicUrl("/ok"), {
        signal: AbortSignal.timeout(2_000),
        resolver: calls,
        isBlocked: testIsBlocked(),
      });
      expect(await result).toEqual({ ok: true, text: KRS });
    }
    expect(calls.calls).toEqual(["public.test", "public.test"]);
  });

  it("times out (502)", async () => {
    const stalled: Resolver = () => {};
    const handle = fetchSrc(publicUrl("/ok"), {
      signal: AbortSignal.timeout(50),
      resolver: stalled,
      isBlocked: testIsBlocked(),
    });
    expect(await handle.result).toMatchObject({ ok: false, status: 502, reason: "timeout" });
  });

  it("settles lookupsSettled only after the resolver returns", async () => {
    let finish: (() => void) | undefined;
    const stalled: Resolver = (_hostname, _options, callback) => {
      finish = () => callback(null, [{ address: "127.0.0.1", family: 4 }]);
    };
    const handle = fetchSrc(publicUrl("/ok"), {
      signal: AbortSignal.timeout(50),
      resolver: stalled,
      isBlocked: testIsBlocked(),
    });
    await handle.result;
    let settled = false;
    void handle.lookupsSettled.then(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    finish?.();
    await handle.lookupsSettled;
    expect(settled).toBe(true);
  });
});

describe("guardedLookup", () => {
  function lookupWith(all: boolean): Promise<unknown[]> {
    const lookup = guardedLookup(
      tableResolver({ "public.test": ["8.8.8.8", "8.8.4.4"] }),
      testIsBlocked(),
      () => {},
    );
    return new Promise((resolve) => {
      lookup("public.test", { all }, (err, address, family) => resolve([err, address, family]));
    });
  }

  it("answers with every address when the caller asks for all", async () => {
    expect(await lookupWith(true)).toEqual([
      null,
      [
        { address: "8.8.8.8", family: 4 },
        { address: "8.8.4.4", family: 4 },
      ],
      undefined,
    ]);
  });

  it("answers with the first address and its family otherwise", async () => {
    expect(await lookupWith(false)).toEqual([null, "8.8.8.8", 4]);
  });
});

// ---------------------------------------------------------------------------
// NODE_USE_ENV_PROXY
// ---------------------------------------------------------------------------

const hasEnvProxy = process.allowedNodeEnvironmentFlags.has("--use-env-proxy");

describe.skipIf(!hasEnvProxy)("under NODE_USE_ENV_PROXY", () => {
  let dir: string;
  let proxy: TestServer;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "karasu-render-proxy-"));
    proxy = await startServer("127.0.0.1", (_req, res) => res.end("proxied"));
  });

  afterAll(async () => {
    await proxy.close();
    await rm(dir, { recursive: true });
  });

  it("does not hand the request to the proxy, which would resolve the name itself", async () => {
    const module = fileURLToPath(new URL("./render-fetch.ts", import.meta.url));
    const fixture = join(dir, "fetch.mts");
    await writeFile(
      fixture,
      `import * as http from "node:http";
import { fetchSrc } from ${JSON.stringify(module)};
const handle = fetchSrc("http://internal.test/via-fetch-src", {
  signal: AbortSignal.timeout(2000),
  resolver: (_h, _o, cb) => cb(null, [{ address: "10.0.0.1", family: 4 }]),
});
const result = await handle.result;
// Control: the global agent does go to the proxy, so the harness works.
const status = await new Promise((resolve, reject) => {
  http.get("http://internal.test/via-global", (res) => { res.resume(); resolve(res.statusCode); }).on("error", reject);
});
process.stdout.write(JSON.stringify({ result, status }));
`,
    );
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_USE_ENV_PROXY: "1",
      HTTP_PROXY: `http://127.0.0.1:${proxy.port}`,
      http_proxy: `http://127.0.0.1:${proxy.port}`,
    };
    delete env.NO_PROXY;
    delete env.no_proxy;
    const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", fixture], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env,
    });
    const { result, status } = JSON.parse(stdout) as { result: FetchResult; status: number };
    expect(result).toMatchObject({ ok: false, reason: "blocked-address" });
    expect(status).toBe(200);
    expect(proxy.requests.map((req) => req.url)).toEqual(["http://internal.test/via-global"]);
  });
});
