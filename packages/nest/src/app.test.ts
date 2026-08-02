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
        KRS_CACHE: false,
        GITHUB_APP_ID: false,
        GITHUB_APP_PRIVATE_KEY: false,
        GITHUB_WEBHOOK_SECRET: false,
      },
    });
  });

  it("reports a binding as present without disclosing its value", async () => {
    const response = await get("/healthz", {
      GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----",
    });
    const body = await response.text();
    expect(JSON.parse(body).bindings.GITHUB_APP_PRIVATE_KEY).toBe(true);
    expect(body).not.toContain("BEGIN PRIVATE KEY");
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
      throw new MissingBindingError("KRS_CACHE");
    });
    const response = await get("/boom", {}, routes);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "not_configured", message: "This deploy is missing the KRS_CACHE binding." },
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
    // `/<owner>/<repo>` is served as of #2285, so it is absent here; a bare
    // root and the webhook endpoint are still unclaimed. `/webhooks/github`
    // has two segments and would be swallowed by the `/:owner/:repo` pattern
    // if it were ever registered after it — this pins that it is not yet
    // reachable at all, so #2286 has to register it deliberately and above.
    const notYetServed = ["/", "/webhooks/github"];
    const statuses = await Promise.all(
      notYetServed.map(async (path) => [
        path,
        (
          await routes.handle(
            new Request(`https://nest.example${path}`),
            { KRS_CACHE: new MemoryKV() },
            ctx,
          )
        ).status,
      ]),
    );
    expect(statuses).toEqual([
      ["/", 404],
      // Currently matched by `/:owner/:repo` and answered as "nothing
      // generated for webhooks/github", which is a wrong answer that #2286
      // must replace with a real route rather than leave to the catch-all.
      ["/webhooks/github", 404],
    ]);
  });
});
