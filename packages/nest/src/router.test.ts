import { describe, expect, it } from "vitest";
import type { NestEnv, NestExecutionContext } from "./env.js";
import { Router } from "./router.js";

const env: NestEnv = {};
const ctx: NestExecutionContext = { waitUntil: () => {} };

const run = (router: Router, method: string, path: string): Promise<Response> =>
  router.handle(
    new Request(`https://nest.example/${path.replace(/^\//, "")}`, { method }),
    env,
    ctx,
  );

describe("Router", () => {
  it("matches a literal path and passes the parsed URL through", async () => {
    const router = new Router().get("/healthz", ({ url }) => new Response(url.pathname));
    const response = await run(router, "GET", "/healthz");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("/healthz");
  });

  it("captures `:name` segments", async () => {
    const router = new Router().get(
      "/:owner/:repo",
      ({ params }) => new Response(`${params.owner}/${params.repo}`),
    );
    expect(await (await run(router, "GET", "/kompiro/karasu")).text()).toBe("kompiro/karasu");
  });

  it("does not let a capture swallow extra segments", async () => {
    const router = new Router().get("/:owner/:repo", () => new Response("matched"));
    expect((await run(router, "GET", "/kompiro/karasu/extra")).status).toBe(404);
    expect((await run(router, "GET", "/kompiro")).status).toBe(404);
  });

  it("treats a trailing slash as the same path", async () => {
    const router = new Router().get("/healthz", () => new Response("ok"));
    expect((await run(router, "GET", "/healthz/")).status).toBe(200);
  });

  it("prefers an earlier registration when two patterns match", async () => {
    const router = new Router()
      .get("/healthz", () => new Response("literal"))
      .get("/:anything", () => new Response("capture"));
    expect(await (await run(router, "GET", "/healthz")).text()).toBe("literal");
    expect(await (await run(router, "GET", "/other")).text()).toBe("capture");
  });

  it("prefers the literal route even when it was registered last", async () => {
    const router = new Router()
      .get("/:anything", () => new Response("capture"))
      .get("/healthz", () => new Response("literal"));
    expect(await (await run(router, "GET", "/healthz")).text()).toBe("literal");
  });

  it("does not let a capture answer for a path a literal route owns", async () => {
    // A `GET` on a POST-only literal path is a 405, not a fall-through to the
    // pattern route, which would give a confident wrong answer about a
    // repository named `webhooks/github`.
    const router = new Router()
      .post("/webhooks/github", () => new Response("hook"))
      .get("/:owner/:repo", () => new Response("repo"));
    const response = await run(router, "GET", "/webhooks/github");
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("ranks by capture count, not by segment count", async () => {
    const router = new Router()
      .get("/:a/:b", () => new Response("two captures"))
      .get("/fixed/:b", () => new Response("one capture"));
    expect(await (await run(router, "GET", "/fixed/x")).text()).toBe("one capture");
    expect(await (await run(router, "GET", "/other/x")).text()).toBe("two captures");
  });

  it("serves HEAD from the GET handler", async () => {
    const router = new Router().get("/healthz", () => new Response("ok"));
    expect((await run(router, "HEAD", "/healthz")).status).toBe(200);
  });

  it("sends no body for a HEAD served from GET", async () => {
    // workerd does not strip the body for us, so returning the GET response
    // unchanged would answer a HEAD with a full payload.
    const router = new Router().get(
      "/healthz",
      () => new Response("a body", { headers: { "X-Kept": "1" } }),
    );
    const response = await run(router, "HEAD", "/healthz");
    expect(await response.text()).toBe("");
    expect(response.headers.get("X-Kept")).toBe("1");
  });

  it("prefers an explicitly registered HEAD route over the GET fallback", async () => {
    const router = new Router()
      .get("/thing", () => new Response("from GET"))
      .add("HEAD", "/thing", () => new Response(null, { headers: { "X-From": "HEAD" } }));
    const response = await run(router, "HEAD", "/thing");
    expect(response.headers.get("X-From")).toBe("HEAD");
  });

  it("answers 405 with Allow when the path matches but the method does not", async () => {
    const router = new Router()
      .get("/thing", () => new Response("ok"))
      .post("/thing", () => new Response("ok"));
    const response = await run(router, "DELETE", "/thing");
    expect(response.status).toBe(405);
    // HEAD is advertised because GET is registered and HEAD is served from it.
    expect(response.headers.get("Allow")).toBe("GET, HEAD, POST");
  });

  it("answers 404 with no Allow header when nothing matches the path", async () => {
    const router = new Router().get("/thing", () => new Response("ok"));
    const response = await run(router, "GET", "/nope");
    expect(response.status).toBe(404);
    expect(response.headers.get("Allow")).toBeNull();
  });

  it('normalises the registered method so `add("get", ...)` still matches', async () => {
    const router = new Router().add("get", "/thing", () => new Response("ok"));
    expect((await run(router, "GET", "/thing")).status).toBe(200);
  });

  it("collapses repeated slashes rather than matching an empty capture", async () => {
    const router = new Router().get("/:owner/:repo", ({ params }) => new Response(params.owner));
    // `//karasu` has one meaningful segment once empties are dropped, so the
    // two-segment pattern must not match it.
    expect((await run(router, "GET", "//karasu")).status).toBe(404);
  });

  it("awaits an async handler", async () => {
    const router = new Router().get("/thing", async () => {
      await Promise.resolve();
      return new Response("async");
    });
    expect(await (await run(router, "GET", "/thing")).text()).toBe("async");
  });
});
