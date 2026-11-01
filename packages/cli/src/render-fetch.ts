import * as dns from "node:dns";
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import * as os from "node:os";
import * as zlib from "node:zlib";
import type { Readable } from "node:stream";

// ---------------------------------------------------------------------------
// The outgoing half of `/render?src=` (#3426). Every hop checks the address
// it connects to, inside the connection's own `lookup`, so the address that
// was checked is the one that is used. Redirects are followed by hand so each
// one goes through the same checks.
// ---------------------------------------------------------------------------

/** Redirects followed before giving up (ADR-123 §3): 6 requests in all. */
export const MAX_REDIRECTS = 5;
/** Body limit, measured after decompression. */
export const MAX_BODY_BYTES = 256 * 1024;
/** Sent on every outgoing request; `serve` refuses any request carrying it. */
export const RENDER_MARKER_HEADER = "x-karasu-render";

// ---------------------------------------------------------------------------
// Blocked addresses
// ---------------------------------------------------------------------------

type Family = "ipv4" | "ipv6";

const BLOCKED_RANGES: ReadonlyArray<readonly [string, number, Family]> = [
  ["0.0.0.0", 8, "ipv4"], // unspecified; often reaches loopback
  ["::", 128, "ipv6"],
  ["127.0.0.0", 8, "ipv4"], // loopback
  ["::1", 128, "ipv6"],
  ["10.0.0.0", 8, "ipv4"], // private (RFC 1918)
  ["172.16.0.0", 12, "ipv4"],
  ["192.168.0.0", 16, "ipv4"],
  ["100.64.0.0", 10, "ipv4"], // CGNAT (RFC 6598), also Tailscale
  ["169.254.0.0", 16, "ipv4"], // link-local, cloud metadata
  ["fe80::", 10, "ipv6"],
  ["fc00::", 7, "ipv6"], // unique local
  ["192.0.0.0", 24, "ipv4"], // IETF protocol assignments
  ["198.18.0.0", 15, "ipv4"], // benchmarking
  ["224.0.0.0", 4, "ipv4"], // multicast
  ["240.0.0.0", 4, "ipv4"], // reserved, broadcast
  ["ff00::", 8, "ipv6"],
];

const blockedRanges = new net.BlockList();
for (const [address, prefix, family] of BLOCKED_RANGES) {
  blockedRanges.addSubnet(address, prefix, family);
}

function familyOf(address: string): Family | null {
  const version = net.isIP(address);
  if (version === 4) return "ipv4";
  if (version === 6) return "ipv6";
  return null;
}

/**
 * Strips the brackets `url.hostname` keeps around IPv6 and any zone id, and
 * turns an IPv4-mapped IPv6 address (`::ffff:7f00:1`, `::ffff:127.0.0.1`, or
 * spelled out in full) into the IPv4 address it carries. Anything else comes
 * back as given, so a value that is not an IP stays one that `net.isIP`
 * rejects.
 */
export function normalizeAddress(address: string): string {
  let value = address;
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  if (net.isIP(value) !== 6) return value;
  value = value.split("%")[0];
  let canonical: string;
  try {
    // The WHATWG serializer compresses and lowercases IPv6, and writes the
    // mapped form as `::ffff:hhhh:hhhh` whichever way it was spelled.
    canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  } catch {
    return value;
  }
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical);
  if (mapped === null) return canonical;
  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

/**
 * Every address on this machine's interfaces, read now. A global IPv6 address
 * comes as its on-link prefix (`2001:db8:1::5/64`): LAN devices hold global
 * IPv6 addresses in the same prefix, outside every blocked range.
 */
export function interfaceAddresses(
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): string[] {
  return Object.values(interfaces).flatMap((list) =>
    (list ?? []).map((info) =>
      info.family === "IPv6" && info.cidr !== null ? info.cidr : info.address,
    ),
  );
}

/**
 * True when `/render` must not connect to `address`: a value that is not an
 * IP, an address in a blocked range, or one of this machine's own addresses
 * (an IPv6 entry may be a prefix, `address/length`).
 * The family is passed explicitly because `BlockList.check` assumes IPv4 and
 * answers false for an IPv6 address otherwise.
 */
export function isBlockedAddress(
  address: string,
  ownAddresses: readonly string[] = interfaceAddresses(),
): boolean {
  const normalized = normalizeAddress(address);
  const family = familyOf(normalized);
  if (family === null) return true;
  if (blockedRanges.check(normalized, family)) return true;
  const own = new net.BlockList();
  for (const raw of ownAddresses) {
    const [addressPart, prefixPart] = raw.split("/");
    const ownAddress = normalizeAddress(addressPart);
    const ownFamily = familyOf(ownAddress);
    if (ownFamily === null) continue;
    const prefix = Number(prefixPart);
    if (ownFamily === "ipv6" && prefixPart !== undefined && Number.isInteger(prefix)) {
      own.addSubnet(ownAddress, prefix, ownFamily);
    } else {
      own.addAddress(ownAddress, ownFamily);
    }
  }
  return own.check(normalized, family);
}

/** True for a URL hostname that names an IP rather than a host. */
export function isIpLiteral(hostname: string): boolean {
  // A bracketed hostname always goes down this path: on the name path,
  // `http.request` strips the brackets itself and connects without lookup.
  return hostname.startsWith("[") || net.isIP(hostname) !== 0;
}

// ---------------------------------------------------------------------------
// Guarded lookup
// ---------------------------------------------------------------------------

export type Resolver = (
  hostname: string,
  options: dns.LookupAllOptions,
  callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void,
) => void;

const systemResolver: Resolver = (hostname, options, callback) => {
  dns.lookup(hostname, options, callback);
};

class BlockedAddressError extends Error {
  readonly code = "EKARASU_BLOCKED";
  constructor(hostname: string) {
    // The message reaches the HTTP client, so it names the host but not the
    // address: otherwise /render resolves internal names for anyone who asks.
    super(`${hostname} resolves to a blocked address`);
  }
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

/**
 * A `lookup` for `http.request` that resolves every address, refuses the
 * connection if any of them is blocked, and otherwise answers in the shape
 * the caller asked for. `track` receives a promise that settles when the
 * resolver's callback returns: `dns.lookup` cannot be cancelled and holds a
 * threadpool thread until then.
 */
export function guardedLookup(
  resolver: Resolver,
  isBlocked: (address: string) => boolean,
  track: (settled: Promise<void>) => void,
) {
  return (hostname: string, options: dns.LookupOptions, callback: LookupCallback): void => {
    track(
      new Promise<void>((settle) => {
        resolver(hostname, { ...options, all: true }, (err, addresses) => {
          settle();
          if (err) {
            callback(err, []);
            return;
          }
          if (addresses.length === 0) {
            callback(
              Object.assign(new Error(`${hostname} has no address`), { code: "ENOTFOUND" }),
              [],
            );
            return;
          }
          const blocked = addresses.find((entry) => isBlocked(entry.address));
          if (blocked !== undefined) {
            callback(new BlockedAddressError(hostname), []);
            return;
          }
          if (options.all) callback(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        });
      }),
    );
  };
}

// ---------------------------------------------------------------------------
// fetchSrc
// ---------------------------------------------------------------------------

export type FetchFailureReason =
  | "invalid-url"
  | "unsupported-scheme"
  | "userinfo"
  | "blocked-address"
  | "too-many-redirects"
  | "redirect-without-location"
  | "http-status"
  | "too-large"
  | "unsupported-encoding"
  | "timeout"
  | "network";

export type FetchResult =
  | { ok: true; text: string }
  | { ok: false; status: 400 | 502; reason: FetchFailureReason; message: string };

export interface FetchSrcOptions {
  signal: AbortSignal;
  /** Stands in for `dns.lookup` in tests. */
  resolver?: Resolver;
  /** Stands in for `isBlockedAddress` in tests. */
  isBlocked?: (address: string) => boolean;
}

export interface FetchHandle {
  result: Promise<FetchResult>;
  /** Settles once every lookup this fetch started has returned. */
  lookupsSettled: Promise<void>;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Reasons that mean the `src` the caller passed is itself unacceptable. On the
 * first hop they answer 400; after a redirect, the same reasons are upstream
 * behaviour and answer 502.
 */
const CALLER_REASONS = new Set<FetchFailureReason>([
  "invalid-url",
  "unsupported-scheme",
  "userinfo",
  "blocked-address",
]);

class HopFailure extends Error {
  constructor(
    readonly reason: FetchFailureReason,
    message: string,
  ) {
    super(message);
  }
}

export function fetchSrc(src: string, options: FetchSrcOptions): FetchHandle {
  const resolver = options.resolver ?? systemResolver;
  const isBlocked = options.isBlocked ?? ((address: string) => isBlockedAddress(address));
  const lookups: Promise<void>[] = [];
  const lookup = guardedLookup(resolver, isBlocked, (settled) => lookups.push(settled));

  const result = (async (): Promise<FetchResult> => {
    let hop = 0;
    let target: URL | string = src;
    let base: URL | undefined;
    for (;;) {
      try {
        const url = checkHop(target, base, isBlocked);
        const response = await send(url, lookup, options.signal);
        if (REDIRECT_STATUSES.has(response.statusCode ?? 0)) {
          // Drop the socket: with `agent: false` there is nothing to keep, and
          // resume() would read the body until the timeout after the slot is free.
          response.destroy();
          const location = response.headers.location;
          if (location === undefined) {
            throw new HopFailure(
              "redirect-without-location",
              `HTTP ${response.statusCode} without Location`,
            );
          }
          if (hop === MAX_REDIRECTS) {
            throw new HopFailure("too-many-redirects", `more than ${MAX_REDIRECTS} redirects`);
          }
          hop += 1;
          target = location;
          base = url;
          continue;
        }
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          response.destroy();
          throw new HopFailure("http-status", `HTTP ${status}`);
        }
        return { ok: true, text: await readBody(response) };
      } catch (err) {
        const failure = toHopFailure(err, options.signal);
        const status = hop === 0 && CALLER_REASONS.has(failure.reason) ? 400 : 502;
        return { ok: false, status, reason: failure.reason, message: failure.message };
      }
    }
  })();

  const lookupsSettled = result.then(() => Promise.allSettled(lookups)).then(() => undefined);
  return { result, lookupsSettled };
}

function checkHop(
  target: URL | string,
  base: URL | undefined,
  isBlocked: (address: string) => boolean,
): URL {
  let url: URL;
  try {
    url = new URL(target, base);
  } catch {
    throw new HopFailure("invalid-url", `not a URL: ${String(target)}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HopFailure("unsupported-scheme", `scheme ${url.protocol} is not allowed`);
  }
  // `http.request` turns userinfo into `Authorization: Basic`.
  if (url.username !== "" || url.password !== "") {
    throw new HopFailure("userinfo", "URLs with credentials are not allowed");
  }
  // `lookup` is not called for an IP literal, so check it here.
  if (isIpLiteral(url.hostname) && isBlocked(url.hostname)) {
    throw new HopFailure("blocked-address", `${url.hostname} is a blocked address`);
  }
  return url;
}

function send(
  url: URL,
  lookup: ReturnType<typeof guardedLookup>,
  signal: AbortSignal,
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    // `agent: false` opens a fresh socket per hop: the shared agent reuses
    // keep-alive sockets without calling `lookup`, and under
    // NODE_USE_ENV_PROXY it sends the request to the proxy without one.
    const req = transport.request(
      url,
      {
        method: "GET",
        agent: false,
        lookup,
        signal,
        headers: {
          "User-Agent": "karasu-render/1.0",
          "Accept-Encoding": "gzip, deflate, br",
          [RENDER_MARKER_HEADER]: "1",
        },
      },
      resolve,
    );
    req.on("error", reject);
    req.end();
  });
}

function decoderFor(
  encoding: string | undefined,
): zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null | "unsupported" {
  const value = (encoding ?? "").trim().toLowerCase();
  if (value === "" || value === "identity") return null;
  if (value === "gzip" || value === "x-gzip") return zlib.createGunzip();
  if (value === "deflate") return zlib.createInflate();
  if (value === "br") return zlib.createBrotliDecompress();
  return "unsupported";
}

/**
 * Reads the body, decompressing it. The limit applies both before and after
 * decompression: after, against zip bombs; before, against a stream that
 * decompresses to nothing (empty gzip members) and would otherwise be read
 * until the timeout.
 */
function readBody(response: http.IncomingMessage): Promise<string> {
  const decoder = decoderFor(response.headers["content-encoding"]);
  if (decoder === "unsupported") {
    response.destroy();
    return Promise.reject(
      new HopFailure(
        "unsupported-encoding",
        `Content-Encoding ${response.headers["content-encoding"]} is not supported`,
      ),
    );
  }
  const body: Readable = decoder === null ? response : response.pipe(decoder);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const fail = (err: unknown): void => {
      response.destroy();
      if (decoder !== null) decoder.destroy();
      reject(err);
    };
    body.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        fail(new HopFailure("too-large", `body is larger than ${MAX_BODY_BYTES} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    body.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    body.on("error", fail);
    if (decoder !== null) {
      let received = 0;
      response.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > MAX_BODY_BYTES) {
          fail(new HopFailure("too-large", `body is larger than ${MAX_BODY_BYTES} bytes`));
        }
      });
      response.on("error", fail);
    }
  });
}

function toHopFailure(err: unknown, signal: AbortSignal): HopFailure {
  if (err instanceof HopFailure) return err;
  if (err instanceof BlockedAddressError) return new HopFailure("blocked-address", err.message);
  if (signal.aborted) return new HopFailure("timeout", "timed out");
  return new HopFailure("network", err instanceof Error ? err.message : String(err));
}
