import { describe, expect, it } from "vitest";
import {
  clearCookie,
  oauthStateCookie,
  parseSessionCookie,
  readCookie,
  sameOrigin,
  sessionCookie,
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
} from "./session.js";

const withCookies = (header: string): Request =>
  new Request("https://nest.example/console", { headers: { Cookie: header } });

describe("cookie names", () => {
  it("carries the __Host- prefix, which browsers enforce", () => {
    // The prefix makes `Secure`, `Path=/` and the absence of `Domain` a
    // browser-enforced fact rather than an attribute we remembered to write.
    for (const name of [SESSION_COOKIE, OAUTH_STATE_COOKIE]) {
      expect(name.startsWith("__Host-")).toBe(true);
    }
  });
});

describe("cookie attributes", () => {
  const attributes = (cookie: string): string[] =>
    cookie
      .split(";")
      .slice(1)
      .map((part) => part.trim());

  it("sets everything __Host- requires, and nothing that would break it", () => {
    const cookie = sessionCookie("42", "a".repeat(32));
    expect(attributes(cookie)).toContain("Path=/");
    expect(attributes(cookie)).toContain("Secure");
    expect(attributes(cookie)).toContain("HttpOnly");
    // A `Domain` would make the browser reject a `__Host-` cookie outright.
    expect(cookie).not.toMatch(/Domain=/);
  });

  it("is SameSite=Lax, so a cross-site POST carries no session at all", () => {
    // This is the first of the console's two CSRF layers; `sameOrigin` is the
    // second.
    expect(attributes(sessionCookie("42", "a".repeat(32)))).toContain("SameSite=Lax");
    expect(attributes(oauthStateCookie("s"))).toContain("SameSite=Lax");
  });

  it("expires the OAuth state in minutes, not the session's month", () => {
    const maxAge = (cookie: string): number =>
      Number(/Max-Age=(\d+)/.exec(cookie)?.[1] ?? Number.NaN);
    expect(maxAge(oauthStateCookie("s"))).toBeLessThan(maxAge(sessionCookie("42", "a".repeat(32))));
  });

  it("clears by repeating the attributes, not just the name", () => {
    // A browser matches the cookie to clear by name and path. An expiry sent
    // with a different `Path` leaves the original in place.
    const cleared = clearCookie(SESSION_COOKIE);
    expect(cleared).toMatch(/^__Host-nest_session=;/);
    expect(attributes(cleared)).toContain("Path=/");
    expect(attributes(cleared)).toContain("Max-Age=0");
  });
});

describe("readCookie", () => {
  it("finds one cookie among several", () => {
    expect(
      readCookie(withCookies(`other=1; ${SESSION_COOKIE}=42:abc; last=2`), SESSION_COOKIE),
    ).toBe("42:abc");
  });

  it("does not match a cookie whose name merely ends with the one asked for", () => {
    expect(readCookie(withCookies(`not-${SESSION_COOKIE}=42:abc`), SESSION_COOKIE)).toBeUndefined();
  });

  it("reads an absent header, an absent cookie and an empty value as undefined", () => {
    expect(readCookie(new Request("https://nest.example/"), SESSION_COOKIE)).toBeUndefined();
    expect(readCookie(withCookies("other=1"), SESSION_COOKIE)).toBeUndefined();
    expect(readCookie(withCookies(`${SESSION_COOKIE}=`), SESSION_COOKIE)).toBeUndefined();
  });
});

describe("parseSessionCookie", () => {
  it("splits the account from the session", () => {
    expect(parseSessionCookie("42:abc")).toEqual({ accountId: "42", sessionId: "abc" });
  });

  it("refuses a value that names no account", () => {
    for (const bad of [undefined, "", "abc", ":abc", "42:", "kompiro:abc"]) {
      expect(parseSessionCookie(bad)).toBeUndefined();
    }
  });
});

describe("sameOrigin", () => {
  const post = (origin?: string): Request =>
    new Request("https://nest.example/console", {
      method: "POST",
      headers: origin === undefined ? {} : { Origin: origin },
    });

  it("accepts our own origin and refuses another", () => {
    expect(sameOrigin(post("https://nest.example"), "https://nest.example")).toBe(true);
    expect(sameOrigin(post("https://evil.example"), "https://nest.example")).toBe(false);
  });

  it("refuses a request with no Origin at all", () => {
    // Browsers send `Origin` on every POST, so absent is not a browser form.
    // Defaulting it to "trusted" is how this check ends up meaning nothing.
    expect(sameOrigin(post(), "https://nest.example")).toBe(false);
  });
});
