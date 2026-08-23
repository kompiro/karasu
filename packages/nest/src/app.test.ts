import { afterEach, describe, expect, it, vi } from "vitest";
import { createRouter, handleRequest } from "./app.js";
import { MissingBindingError, type NestEnv, type NestExecutionContext } from "./env.js";
import { Router } from "./router.js";
import { MemoryKV } from "./testing/memory-kv.js";

const ctx: NestExecutionContext = { waitUntil: () => {} };

const get = (path: string, env: NestEnv = {}, routes?: Router): Promise<Response> =>
  handleRequest(new Request(`https://nest.example${path}`), env, ctx, routes);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleRequest", () => {
  it("serves /healthz", async () => {
    const response = await get("/healthz", { ENVIRONMENT: "preview" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      service: "karasu-nest",
      status: "ok",
      environment: "preview",
      bindings: {
        NEST_STORE: false,
        GITHUB_OAUTH_CLIENT_ID: false,
        GITHUB_OAUTH_CLIENT_SECRET: false,
        NEST_PUBLIC_ORIGIN: false,
      },
    });
  });

  it("reports a binding as present without disclosing its value", async () => {
    const response = await get("/healthz", {
      GITHUB_OAUTH_CLIENT_SECRET: "a-real-looking-client-secret",
    });
    const body = await response.text();
    expect(JSON.parse(body).bindings.GITHUB_OAUTH_CLIENT_SECRET).toBe(true);
    expect(body).not.toContain("a-real-looking-client-secret");
  });

  it("reports an unset ENVIRONMENT as unknown rather than omitting it", async () => {
    expect((await (await get("/healthz")).json()).environment).toBe("unknown");
  });

  it("404s an unknown path", async () => {
    const response = await get("/nope");
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
  });

  it("turns a missing binding into a 503 that names the binding", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const routes = new Router().get("/boom", () => {
      throw new MissingBindingError("NEST_STORE");
    });
    const response = await get("/boom", {}, routes);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "not_configured", message: "This deploy is missing the NEST_STORE binding." },
    });
  });

  it("contains an unexpected throw without leaking its detail", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const routes = new Router().get("/boom", () => {
      throw new Error("ghp_secretlookingtoken in a stack trace");
    });
    const response = await get("/boom", {}, routes);
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toContain("ghp_secretlookingtoken");
    expect(JSON.parse(body).error.code).toBe("internal_error");
    // The detail is not lost, only kept off the wire.
    expect(logged).toHaveBeenCalled();
  });

  it("contains a rejected promise the same way as a synchronous throw", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const routes = new Router().get("/boom", () => Promise.reject(new Error("async boom")));
    expect((await get("/boom", {}, routes)).status).toBe(500);
  });

  it("exposes only the routes this slice ships", async () => {
    // A reminder to update this list deliberately: every route added here is a
    // surface reachable from the public internet.
    const routes = createRouter();
    expect((await routes.handle(new Request("https://nest.example/healthz"), {}, ctx)).status).toBe(
      200,
    );
    // A bare root is still unclaimed. `/:owner/:repo` went with server-side
    // generation (#2590), so nothing here is a two-segment catch-all any more
    // and an unknown path is a plain 404.
    const configured = { NEST_STORE: new MemoryKV() };
    const statusOf = async (path: string): Promise<number> =>
      (await routes.handle(new Request(`https://nest.example${path}`), configured, ctx)).status;
    expect(await statusOf("/")).toBe(404);
    expect(await statusOf("/kompiro/karasu")).toBe(404);
    // The console's literal paths win over `/console/s/:id`, and a POST-only
    // path answers 405 rather than 404 so the method is the visible fault.
    expect(await statusOf("/console/submit")).toBe(405);
    expect(await statusOf("/api/submissions")).toBe(405);
  });
});
