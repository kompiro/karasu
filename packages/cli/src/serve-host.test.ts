import { describe, expect, it } from "vitest";
import {
  isAllowedHost,
  isLoopbackAddress,
  listenBanner,
  normalizeAllowedHost,
} from "./serve-host.js";

/**
 * The `Host` check that keeps DNS rebinding off `/api/*` (#3418, TPL-168).
 * A rebinding page sends its own domain as `Host`; everything that reads as
 * localhost or an IP literal passes, and nothing else may be made to read
 * that way.
 */
describe("isAllowedHost", () => {
  it.each([
    "localhost:3000",
    "LOCALHOST:3000",
    "localhost.:3000",
    "localhost",
    "127.0.0.1:3000",
    "[::1]:3000",
    "[::1]",
    "[::ffff:127.0.0.1]:3000",
    "app.localhost:3000",
    "app.localhost.:3000",
    "192.168.1.5:3000",
  ])("passes %j", (host) => {
    expect(isAllowedHost(host, [])).toBe(true);
  });

  it.each([
    ["no Host", undefined],
    ["an empty Host", ""],
    ["another domain", "evil.example"],
    ["another domain with a port", "evil.example:3000"],
    ["a domain that starts with localhost", "localhost.evil.example"],
    ["a name that ends in localhost without a dot", "evil-localhost"],
    ["a path", "localhost/evil"],
    ["a fragment", "localhost#x"],
    ["a query", "localhost?x"],
    ["userinfo", "evil@localhost"],
    ["a percent escape", "l%6fcalhost"],
    ["a backslash", "localhost\\evil"],
    ["a TAB", "local\thost"],
    ["a space", "localhost 3000"],
    ["a non-numeric port", "localhost:abc"],
    ["an unclosed IPv6 bracket", "[::1"],
    ["something bracketed that is not IPv6", "[localhost]"],
    ["a bare IPv6 address", "::1"],
  ])("refuses %s", (_label, host) => {
    expect(isAllowedHost(host, [])).toBe(false);
  });

  it("passes an --allowed-host name exactly, with or without a port", () => {
    const allowed = ["foo.app.github.dev"];
    expect(isAllowedHost("foo.app.github.dev", allowed)).toBe(true);
    expect(isAllowedHost("FOO.app.github.dev.:443", allowed)).toBe(true);
    expect(isAllowedHost("bar.app.github.dev", allowed)).toBe(false);
    expect(isAllowedHost("x.foo.app.github.dev", allowed)).toBe(false);
  });

  it("passes a .name entry's own name and its subdomains, but not a lookalike", () => {
    const allowed = [".example.com"];
    expect(isAllowedHost("example.com", allowed)).toBe(true);
    expect(isAllowedHost("a.example.com:8080", allowed)).toBe(true);
    expect(isAllowedHost("a.b.example.com", allowed)).toBe(true);
    expect(isAllowedHost("badexample.com", allowed)).toBe(false);
    expect(isAllowedHost("example.com.evil", allowed)).toBe(false);
  });
});

describe("normalizeAllowedHost", () => {
  it.each([
    ["Foo.App.GitHub.Dev", "foo.app.github.dev"],
    ["foo.app.github.dev.", "foo.app.github.dev"],
    [".Example.com", ".example.com"],
    ["karasu", "karasu"],
  ])("normalizes %j to %j", (value, expected) => {
    expect(normalizeAllowedHost(value)).toBe(expected);
  });

  // These would silently never match a Host, so they are refused up front.
  it.each(["foo.app.github.dev:443", "https://foo.app.github.dev", "foo/bar", "", ".", "a..b"])(
    "rejects %j",
    (value) => {
      expect(() => normalizeAllowedHost(value)).toThrow(/without port, scheme or path/);
    },
  );
});

describe("isLoopbackAddress", () => {
  it.each(["127.0.0.1", "127.1.2.3", "::1", "::ffff:127.0.0.1", "::FFFF:127.0.0.2"])(
    "%s is loopback",
    (address) => {
      expect(isLoopbackAddress(address)).toBe(true);
    },
  );

  it.each(["0.0.0.0", "::", "192.168.1.5", "::ffff:192.168.1.5", "fe80::1", "128.0.0.1"])(
    "%s is not loopback",
    (address) => {
      expect(isLoopbackAddress(address)).toBe(false);
    },
  );
});

describe("listenBanner", () => {
  it("keeps http://localhost for the default 127.0.0.1, so the app's origin does not change", () => {
    expect(listenBanner({ address: "127.0.0.1", family: "IPv4", port: 3000 })).toEqual({
      preview: "http://localhost:3000",
      listening: null,
      probeIpv6: true,
    });
  });

  it("adds a Listening line for the wildcard addresses", () => {
    expect(listenBanner({ address: "0.0.0.0", family: "IPv4", port: 3000 })).toEqual({
      preview: "http://localhost:3000",
      listening: "0.0.0.0:3000",
      probeIpv6: true,
    });
    // `::` holds [::1] itself, so nothing else can shadow it there.
    expect(listenBanner({ address: "::", family: "IPv6", port: 3000 })).toEqual({
      preview: "http://localhost:3000",
      listening: "[::]:3000",
      probeIpv6: false,
    });
  });

  it("prints any other address as listened on, bracketing IPv6", () => {
    expect(listenBanner({ address: "::1", family: "IPv6", port: 4000 }).preview).toBe(
      "http://[::1]:4000",
    );
    expect(listenBanner({ address: "192.168.1.5", family: "IPv4", port: 4000 }).preview).toBe(
      "http://192.168.1.5:4000",
    );
  });
});
