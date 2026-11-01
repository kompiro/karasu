import { connect, isIP, type AddressInfo } from "node:net";

/** Where `serve` listens without `--host`: IPv4 loopback only (#3418). */
export const DEFAULT_HOST = "127.0.0.1";

/**
 * The `Host` header shape `serve` reads at all: a name or IPv4 address
 * (letters, digits, `-`, `.`) or a bracketed IPv6 address, then an optional
 * `:<port>`. Anything else (a path, query, fragment, userinfo, percent
 * escape, `\`, whitespace) is refused before a hostname is taken from it, so
 * `localhost/evil` or `evil@localhost` never reads as `localhost` (#3418).
 */
const HOST_SHAPE = /^(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::\d+)?$/;

/** A host name lowercased, with one trailing `.` dropped (`localhost.` is `localhost`). */
function canonicalName(name: string): string {
  const lower = name.toLowerCase();
  return lower.endsWith(".") ? lower.slice(0, -1) : lower;
}

/**
 * Whether `serve` answers `/api/*` for a request carrying this `Host` (#3418).
 * This stops DNS rebinding, where the browser sends the attacker's domain as
 * `Host`: it is not access control, since anything but a browser sends the
 * `Host` it likes. Passes an IP literal, `localhost` and `*.localhost`, and
 * the `--allowed-host` names (as normalized by `normalizeAllowedHost`; one
 * starting with `.` also matches its subdomains). The port is not compared.
 * A missing or empty `Host` is refused.
 */
export function isAllowedHost(host: string | undefined, allowedHosts: readonly string[]): boolean {
  if (host === undefined || !HOST_SHAPE.test(host)) return false;
  if (host.startsWith("[")) return isIP(host.slice(1, host.indexOf("]"))) === 6;
  const name = canonicalName(host.replace(/:\d+$/, ""));
  if (isIP(name) === 4 || name === "localhost" || name.endsWith(".localhost")) return true;
  return allowedHosts.some((allowed) =>
    allowed.startsWith(".")
      ? name === allowed.slice(1) || name.endsWith(allowed)
      : name === allowed,
  );
}

/** An `--allowed-host` value: a host name, or `.name` for the name and its subdomains. */
const ALLOWED_HOST_SHAPE = /^\.?[a-z0-9-]+(?:\.[a-z0-9-]+)*$/;

/**
 * Normalize an `--allowed-host` value the way `isAllowedHost` reads `Host`:
 * lowercased, one trailing `.` dropped. A value carrying a port, scheme or
 * path would silently never match, so it throws instead.
 */
export function normalizeAllowedHost(value: string): string {
  const name = canonicalName(value);
  if (!ALLOWED_HOST_SHAPE.test(name)) {
    throw new Error(
      `expected a host name without port, scheme or path (e.g. foo.app.github.dev or .example.com): ${value}`,
    );
  }
  return name;
}

/** `127.0.0.0/8`, `::1` and the IPv4-mapped `::ffff:127.0.0.0/104`. */
export function isLoopbackAddress(address: string): boolean {
  const lower = address.toLowerCase();
  if (isIP(lower) === 4) return lower.startsWith("127.");
  return lower === "::1" || (lower.startsWith("::ffff:") && lower.slice(7).startsWith("127."));
}

export interface ListenBanner {
  /** The URL printed as `Preview`. */
  preview: string;
  /** The wildcard address printed as `Listening`, when `serve` listens on every interface. */
  listening: string | null;
  /**
   * Whether `[::1]:<port>` should be probed: the preview says `localhost`
   * but the server holds only an IPv4 socket, so another process on `[::1]`
   * with the same port would be what `localhost` opens.
   */
  probeIpv6: boolean;
}

/**
 * What the startup banner shows for the address `serve` listened on. The
 * default `127.0.0.1` keeps `http://localhost:<port>`, so the app's
 * `localStorage` origin stays the one users already have.
 */
export function listenBanner({ address, family, port }: AddressInfo): ListenBanner {
  const localhost = `http://localhost:${port}`;
  if (address === "127.0.0.1") return { preview: localhost, listening: null, probeIpv6: true };
  if (address === "0.0.0.0") {
    return { preview: localhost, listening: `0.0.0.0:${port}`, probeIpv6: true };
  }
  if (address === "::") return { preview: localhost, listening: `[::]:${port}`, probeIpv6: false };
  const host = family === "IPv6" ? `[${address}]` : address;
  return { preview: `http://${host}:${port}`, listening: null, probeIpv6: false };
}

/** Whether something accepts a TCP connection on `[::1]:<port>`. */
export function ipv6LoopbackAnswers(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolveAnswer) => {
    const socket = connect({ host: "::1", port });
    const done = (answered: boolean): void => {
      socket.destroy();
      resolveAnswer(answered);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}
