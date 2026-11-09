/**
 * No page this origin serves runs script, except the one built to (TPL-2993).
 *
 * The console and every other page here are same-origin with the `__Host-`
 * session cookie, so any script they carried would act with the session's
 * authority (`gallery/html.ts` says the same thing where the pages are
 * written). The viewer is the single exception, and it is allowed only
 * because its CSP makes it an opaque origin.
 *
 * The other tests check the pages they are about. This one walks the route
 * table itself (`Router.table`), sends every route its method the way a
 * signed-in owner would, and holds each answer to that rule, so a page added
 * to `app.ts` is checked the day it is registered, by a test nobody had to
 * remember to extend. `POST` routes get an empty same-origin form, which is
 * what makes the console re-render a page with the problem on it, and a path
 * nothing is registered for stands in for the router's own 404. A route whose
 * path needs a parameter this file cannot fill fails until it can, rather than
 * being skipped.
 */
import { describe, expect, it, vi } from "vitest";
import { createRouter, handleRequest } from "../app.js";
import { SESSION_COOKIE } from "../auth/session.js";
import type { NestEnv, NestExecutionContext } from "../env.js";
import { VIEWER_TEMPLATE_PATH } from "../gallery/viewer-assets.js";
import { formatSubmissionId } from "../store/gallery-keys.js";
import { GalleryStore } from "../store/gallery-store.js";
import { MemoryKV } from "../testing/memory-kv.js";

// vitest cannot load resvg's `.wasm`; `gallery.test.ts` replaces it the same way.
vi.mock("../gallery/og-rasterize.js", () => ({
  rasterizeOgPng: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
}));

const ORIGIN = "https://nest.example";
const ctx: NestExecutionContext = { waitUntil: () => {} };

/**
 * The pages allowed to run script, and the CSP that makes each one safe to.
 * One entry, and it should stay that way: a second one is a design decision
 * (ADR-2592 §6), not something to add here to get a page through.
 */
const SCRIPTED: Readonly<Record<string, (csp: string) => void>> = {
  "GET /g/:id": (csp) => {
    expect(csp.split(/\s+/)).toEqual(expect.arrayContaining(["sandbox", "allow-scripts"]));
    expect(csp).not.toContain("allow-same-origin");
    expect(csp.split(/\s*;\s*/)).toContain("connect-src 'none'");
  },
};

/** Script in a document: an element, or a handler attribute on any element. */
const SCRIPT = /<script\b|\son[a-z]+\s*=/i;

async function signedInOwner(kv: MemoryKV): Promise<{ cookie: string; id: string }> {
  const store = new GalleryStore(kv);
  await store.accounts.signIn(42, "kompiro", new Date());
  const { sessionId } = await store.sessions.issue(42, "kompiro", new Date());
  const { slug } = await store.submissions.create(
    42,
    { title: "Shop", krs: "system Shop {\n  service api\n}\n" },
    new Date(),
  );
  return { cookie: `${SESSION_COOKIE}=42:${sessionId}`, id: formatSubmissionId(42, slug) };
}

/** The built `viewer.html`'s shape, as `gallery.test.ts` stubs it. */
const VIEWER_TEMPLATE = [
  "<!doctype html><html><head><title>karasu</title></head><body>",
  '<!--GALLERY_HEADER--><div id="root"></div><!--KRS_SOURCE-->',
  '<script type="module" crossorigin src="/assets/viewer.js"></script>',
  "</body></html>",
].join("");

function env(kv: MemoryKV): NestEnv {
  return {
    NEST_STORE: kv,
    NEST_PUBLIC_ORIGIN: ORIGIN,
    NEST_SIGN_IN_ALLOWLIST: "42",
    GITHUB_OAUTH_CLIENT_ID: "client",
    GITHUB_OAUTH_CLIENT_SECRET: "secret",
    ASSETS: {
      fetch: async (request) =>
        new URL(request.url).pathname === VIEWER_TEMPLATE_PATH
          ? new Response(VIEWER_TEMPLATE)
          : new Response("Not found", { status: 404 }),
    },
  };
}

/** No route answers this path: the router's 404 is a page too. */
const UNROUTED = { method: "GET", pattern: "/no/such/page" };

describe("pages served on the session's origin", () => {
  it("carry no script, on every route and the 404, except the sandboxed viewer", async () => {
    const routes = [...createRouter().table, UNROUTED];
    expect(routes.some(({ method }) => method === "POST")).toBe(true);

    for (const { method, pattern } of routes) {
      // A fresh store per route: `POST /console/account/delete` purges the
      // owner, and nothing after it should be checked as a stranger.
      const kv = new MemoryKV();
      const { cookie, id } = await signedInOwner(kv);
      const params: Readonly<Record<string, string>> = { id };
      const path = pattern.replaceAll(/:(\w+)/g, (_, name: string) => {
        const value = params[name];
        if (value === undefined) throw new Error(`${pattern}: no value for :${name} in this test`);
        return value;
      });
      const init: RequestInit =
        method === "POST"
          ? { method, headers: { Cookie: cookie, Origin: ORIGIN }, body: new URLSearchParams() }
          : { method, headers: { Cookie: cookie } };
      const response = await handleRequest(new Request(`${ORIGIN}${path}`, init), env(kv), ctx);
      const route = `${method} ${pattern}`;
      // A route that fell over answered nothing worth checking.
      if (response.status >= 500) throw new Error(`${route} answered ${response.status}`);
      const scripted = SCRIPTED[route];
      if (scripted !== undefined) {
        scripted(response.headers.get("Content-Security-Policy") ?? "");
        continue;
      }
      expect(await response.text(), `${route} serves script`).not.toMatch(SCRIPT);
    }
  });
});
