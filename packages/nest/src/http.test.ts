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

  it("serialises JSON with a charset-qualified content type", async () => {
    const response = json({ a: 1 });
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(await response.json()).toEqual({ a: 1 });
  });

  it("shapes errors as a machine-readable code plus a human message", async () => {
    const response = error(503, "not_configured", "Missing KRS_CACHE.");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "not_configured", message: "Missing KRS_CACHE." },
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
});
