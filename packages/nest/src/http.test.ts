import { describe, expect, it } from "vitest";
import { error, json, methodNotAllowed, notFound, text } from "./http.js";

describe("http helpers", () => {
  it("defaults every response to no-store", async () => {
    // The default matters: this service's answers are derived from private
    // repositories, so a response that lands in a shared cache by omission is
    // a data-trust incident (ADR-1990 decision 6).
    for (const response of [json({}), text("x"), error(400, "bad", "Bad."), notFound()]) {
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  it("lets a caller opt into caching explicitly", () => {
    const response = json({}, { cacheControl: "public, max-age=60" });
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  it("varies a cacheable response by the session cookie", () => {
    // A cacheable response is the only kind a shared cache keeps, and every
    // surface this Worker serves is same-origin with the session cookie — so
    // "who is asking" belongs in the cache key. A caller's own `Vary` cannot
    // narrow it, for the same reason one cannot re-introduce caching.
    const response = json({}, { cacheControl: "public, max-age=60", headers: { Vary: "Accept" } });
    expect(response.headers.get("Vary")).toBe("Cookie");
  });

  it("sends no Vary on a no-store response, which is never kept", () => {
    expect(json({}).headers.get("Vary")).toBeNull();
  });

  it("serialises JSON with a charset-qualified content type", async () => {
    const response = json({ a: 1 });
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(await response.json()).toEqual({ a: 1 });
  });

  it("shapes errors as a machine-readable code plus a human message", async () => {
    const response = error(503, "not_configured", "Missing NEST_STORE.");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "not_configured", message: "Missing NEST_STORE." },
    });
  });

  it("sends Allow alongside a 405", async () => {
    const response = methodNotAllowed(["GET", "HEAD"]);
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, HEAD");
    expect(await response.json()).toEqual({
      error: { code: "method_not_allowed", message: "Allowed: GET, HEAD." },
    });
  });

  it("lets extra headers through without losing the defaults", () => {
    const response = text("x", { headers: { "X-Trace": "1" } });
    expect(response.headers.get("X-Trace")).toBe("1");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not let an extra header shadow Cache-Control or Content-Type", () => {
    // `cacheControl` is the only supported way out of `no-store`. If a stray
    // `headers` entry could re-introduce caching, the guarantee this module
    // exists for would be one typo away from gone.
    const response = json(
      {},
      { headers: { "Cache-Control": "public, max-age=31536000", "Content-Type": "text/html" } },
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
  });
});
