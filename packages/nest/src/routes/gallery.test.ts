import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../app.js";
import { rasterizeOgPng } from "../gallery/og-rasterize.js";
import { OG_EDGE_CACHE_SECONDS, ogImageUrl, type EdgeCacheLike } from "../gallery/og-image.js";
import { renderSubmission } from "../gallery/render.js";
import { VIEWER_TEMPLATE_PATH } from "../gallery/viewer-assets.js";
import type { NestEnv, NestExecutionContext } from "../env.js";
import { GalleryStore } from "../store/gallery-store.js";
import { formatSubmissionId, parseSubmissionId } from "../store/gallery-keys.js";
import { MemoryKV } from "../testing/memory-kv.js";
import { SESSION_COOKIE } from "../auth/session.js";

// Wrapped so a test can tell whether the Worker drew SVG at all.
vi.mock("../gallery/render.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../gallery/render.js")>();
  return {
    ...actual,
    renderSubmission: vi.fn<typeof actual.renderSubmission>(actual.renderSubmission),
  };
});

// vitest cannot load resvg's `.wasm`, so the rasterizer is the one piece of the
// image route replaced here. `wrangler dev` is where the real one is checked
// (`docs/acceptance/2995-nest-gallery-ogp.md`).
const PNG = vi.hoisted(() => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
vi.mock("../gallery/og-rasterize.js", () => ({
  rasterizeOgPng: vi.fn<typeof import("../gallery/og-rasterize.js").rasterizeOgPng>(
    async () => PNG,
  ),
}));

// The shape of `packages/app/viewer.html` as built: a title, the two
// placeholders the route fills, and the bundle. `viewer-html.test.ts` in the
// app pins the real template to the same placeholders.
const TEMPLATE = [
  "<!doctype html><html><head><title>karasu</title></head><body>",
  '<!--GALLERY_HEADER--><div id="root"></div><!--KRS_SOURCE-->',
  '<script type="module" crossorigin src="/assets/viewer.js"></script>',
  "</body></html>",
].join("");

/** A stand-in for the static-assets binding that serves the template only. */
const assets = (template: string | null = TEMPLATE) => ({
  requested: [] as string[],
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    this.requested.push(path);
    return path === VIEWER_TEMPLATE_PATH && template !== null
      ? new Response(template, { headers: { "Content-Type": "text/html" } })
      : new Response("Not found", { status: 404 });
  },
});

const ctx: NestExecutionContext = { waitUntil: () => {} };
const ORIGIN = "https://nest.example";
const KRS = "system Shop {\n  service api\n}\n";
const at = new Date("2026-08-02T00:00:00Z");

const env = (kv: MemoryKV, binding = assets()): NestEnv => ({
  ASSETS: binding,
  NEST_STORE: kv,
  NEST_PUBLIC_ORIGIN: ORIGIN,
  NEST_SIGN_IN_ALLOWLIST: "42 420",
});

async function seed(
  kv: MemoryKV,
  visibility: "public" | "unlisted" = "public",
  accountId = 42,
  krs = KRS,
): Promise<{ id: string; cookie: string }> {
  const store = new GalleryStore(kv);
  await store.accounts.signIn(accountId, "kompiro", at);
  // `new Date()` rather than the fixture date: the absolute cap is measured
  // against the real clock, so a session frozen at `at` would age past it as
  // real time passed and fail this suite later for no reason (#2655).
  const { sessionId } = await store.sessions.issue(accountId, "kompiro", new Date());
  const submission = await store.submissions.create(
    accountId,
    { title: "Shop <script>", krs, visibility },
    at,
  );
  return {
    id: formatSubmissionId(accountId, submission.slug),
    cookie: `${SESSION_COOKIE}=${accountId}:${sessionId}`,
  };
}

const get = (kv: MemoryKV, path: string, cookie?: string, binding = assets()): Promise<Response> =>
  handleRequest(
    new Request(`${ORIGIN}${path}`, { headers: cookie === undefined ? {} : { Cookie: cookie } }),
    env(kv, binding),
    ctx,
  );

/** The source the page embeds, read back the way the viewer reads it. */
function embeddedSource(body: string): unknown {
  const match = /<script type="application\/json" id="krs-source">([^<]*)<\/script>/.exec(body);
  if (!match) throw new Error("no embedded source");
  return JSON.parse(match[1]);
}

describe("GET /g/<id>", () => {
  it("serves the viewer with the submission embedded, not a server-drawn diagram", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const binding = assets();
    vi.mocked(renderSubmission).mockClear();
    const response = await get(kv, `/g/${id}`, undefined, binding);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    const body = await response.text();
    expect(embeddedSource(body)).toBe(KRS);
    expect(body).toContain('src="/assets/viewer.js"');
    expect(body).toContain("kompiro");
    expect(body).not.toContain("<svg");
    expect(renderSubmission).not.toHaveBeenCalled();
    expect(binding.requested).toEqual([VIEWER_TEMPLATE_PATH]);
  });

  it("serves the viewer as a sandbox without an origin (TPL-2993)", async () => {
    const kv = new MemoryKV();
    const { id, cookie } = await seed(kv);
    for (const response of [await get(kv, `/g/${id}`), await get(kv, `/g/${id}`, cookie)]) {
      const csp = response.headers.get("Content-Security-Policy") ?? "";
      expect(csp.split(/\s+/)).toEqual(expect.arrayContaining(["sandbox", "allow-scripts"]));
      expect(csp).not.toContain("allow-same-origin");
    }
  });

  it("puts no form on the page, not even for the owner", async () => {
    // A form sent from an opaque origin carries `Origin: null` and fails
    // `sameOrigin`; the console is reached by a link instead.
    const kv = new MemoryKV();
    const { id, cookie } = await seed(kv);
    const body = await (await get(kv, `/g/${id}`, cookie)).text();
    expect(body).not.toMatch(/<form/i);
    expect(body).not.toContain('target="_blank"');
    expect(body).toContain(`<a href="/console/s/${id}">Manage</a>`);
  });

  it("embeds a source containing </script> without breaking out of the data block", async () => {
    const kv = new MemoryKV();
    const hostile =
      'system S {\n  service a { label "</script><script>alert(1)</script> $& <!--" }\n}\n';
    const { id } = await seed(kv, "public", 42, hostile);
    const body = await (await get(kv, `/g/${id}`)).text();
    expect(body).not.toContain("<script>alert(1)");
    expect(body.match(/<\/script>/g)).toHaveLength(2); // the data block and the bundle
    expect(embeddedSource(body)).toBe(hostile);
  });

  it("gives a public submission an OGP card from its stored record (#2995)", async () => {
    const kv = new MemoryKV();
    const store = new GalleryStore(kv);
    await store.accounts.signIn(42, "kompiro", at);
    const created = await store.submissions.create(
      42,
      { title: "Shop", krs: KRS, description: "The storefront & checkout.", visibility: "public" },
      at,
    );
    const id = formatSubmissionId(42, created.slug);
    const body = await (await get(kv, `/g/${id}`)).text();
    const head = body.slice(0, body.indexOf("</head>"));
    expect(head).toContain('<meta property="og:title" content="Shop">');
    expect(head).toContain(
      '<meta property="og:description" content="The storefront &amp; checkout.">',
    );
    expect(head).toContain(`<meta property="og:url" content="${ORIGIN}/g/${id}">`);
    // The image URL carries the version, so a replaced model is fetched anew.
    const image = ogImageUrl(ORIGIN, id, created.updatedAt);
    expect(image).toBe(`${ORIGIN}/g/${id}/og.png?v=${Date.parse(created.updatedAt)}`);
    expect(head).toContain(`<meta property="og:image" content="${image}">`);
    expect(head).toContain('<meta property="og:image:width" content="1200">');
    expect(head).toContain('<meta property="og:image:height" content="630">');
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  it("keeps the small card when the deploy does not know its own origin", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const response = await handleRequest(
      new Request(`${ORIGIN}/g/${id}`),
      { ...env(kv), NEST_PUBLIC_ORIGIN: undefined },
      ctx,
    );
    const body = await response.text();
    expect(body).not.toContain("og:image");
    expect(body).toContain('<meta name="twitter:card" content="summary">');
  });

  it("falls back to whose model it is when the record has no description", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const body = await (await get(kv, `/g/${id}`)).text();
    expect(body).toContain(
      '<meta property="og:description" content="Architecture model by kompiro on karasu gallery">',
    );
  });

  it("gives an unlisted submission no card, even on its owner's own view", async () => {
    const kv = new MemoryKV();
    const { id, cookie } = await seed(kv, "unlisted");
    const response = await get(kv, `/g/${id}`, cookie);
    expect(response.status).toBe(200);
    expect(await response.text()).not.toMatch(/og:|twitter:/);
  });

  it("answers 503 when the viewer is not deployed, and does not cache it", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const response = await get(kv, `/g/${id}`, undefined, assets(null));
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("escapes a title chosen by a stranger", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const body = await (await get(kv, `/g/${id}`)).text();
    expect(body).toContain("Shop &lt;script&gt;");
    expect(body).not.toContain("Shop <script>");
  });

  it("serves the raw SVG and the .krs on request, without the sandbox", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const svg = await get(kv, `/g/${id}?format=svg`);
    expect(svg.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
    expect(await svg.text()).toContain("<svg");
    const krs = await get(kv, `/g/${id}?format=krs`);
    expect(await krs.text()).toBe(KRS);
  });

  it("lets a published submission be cached, briefly", async () => {
    // `http.ts` answers `no-store` unless a caller says otherwise. A public
    // submission is the one thing here its author chose to make public.
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    expect((await get(kv, `/g/${id}`)).headers.get("Cache-Control")).toBe("public, max-age=600");
  });

  it("keeps an owner's own view out of a shared cache", async () => {
    const kv = new MemoryKV();
    const { id, cookie } = await seed(kv);
    expect((await get(kv, `/g/${id}`, cookie)).headers.get("Cache-Control")).toBe("no-store");
  });

  it("keys the shared cache on the session, so an owner is not served the anonymous page", async () => {
    // The page changes for its owner — the `Manage` link — while the
    // anonymous one is `public, max-age=600`. Without `Vary`, a shared cache
    // holds one entry for `/g/<id>` and answers the owner with the anonymous
    // body for ten minutes, the link simply missing.
    const kv = new MemoryKV();
    const { id, cookie } = await seed(kv);
    const anonymous = await get(kv, `/g/${id}`);
    expect(anonymous.headers.get("Vary")).toBe("Cookie");
    expect(await anonymous.text()).not.toContain("/console/s/");
    expect(await (await get(kv, `/g/${id}`, cookie)).text()).toContain(`/console/s/${id}`);
  });

  it("does not let a render error inherit the submission's cacheability", async () => {
    // A ten-minute `public` on `?view=nonsense` would pin a 400 nobody asked
    // to keep. The error is not the submission.
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const bad = await get(kv, `/g/${id}?format=svg&view=nonsense`);
    expect(bad.status).toBe(400);
    expect(bad.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 404 for an unlisted submission, exactly as for one that is not there", async () => {
    // Distinguishing them makes this route an oracle for "did this person
    // submit something and take it down".
    const kv = new MemoryKV();
    const { id } = await seed(kv, "unlisted");
    const unlisted = await get(kv, `/g/${id}`);
    const missing = await get(kv, "/g/42-abcdefghjkmn");
    expect(unlisted.status).toBe(404);
    expect(await unlisted.text()).toBe(await missing.text());
  });

  it("shows an unlisted submission to its own author", async () => {
    const kv = new MemoryKV();
    const { id, cookie } = await seed(kv, "unlisted");
    const response = await get(kv, `/g/${id}`, cookie);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("unlisted");
  });

  it("does not show an unlisted submission to a different signed-in account", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv, "unlisted", 42);
    const other = await seed(kv, "public", 420);
    expect((await get(kv, `/g/${id}`, other.cookie)).status).toBe(404);
  });

  it("serves a public page to a cookie-carrying visitor even when the allowlist is missing (#2969)", async () => {
    // A misconfigured list must not turn public pages into 503s. The session
    // is read as signed out, so an unlisted submission stays hidden.
    const kv = new MemoryKV();
    const { NEST_SIGN_IN_ALLOWLIST: _, ...withoutList } = env(kv);
    const open = await seed(kv);
    const hidden = await seed(kv, "unlisted");
    const request = (id: string): Promise<Response> =>
      handleRequest(
        new Request(`${ORIGIN}/g/${id}`, { headers: { Cookie: open.cookie } }),
        withoutList,
        ctx,
      );
    expect((await request(open.id)).status).toBe(200);
    expect((await request(hidden.id)).status).toBe(404);
  });

  it("answers 404 for a malformed id rather than an error", async () => {
    const kv = new MemoryKV();
    for (const id of ["nonsense", "42-short", "kompiro-abcdefghjkmn"]) {
      expect((await get(kv, `/g/${id}`)).status).toBe(404);
    }
  });

  it("does not shadow, and is not shadowed by, the repository route", async () => {
    // `/g/:id` captures one segment and `/:owner/:repo` captures two;
    // `Router.candidates` selects the fewest-capture group exclusively.
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    expect((await get(kv, `/g/${id}`)).status).toBe(200);
    expect((await get(kv, "/kompiro/karasu")).status).toBe(404);
    expect((await get(kv, `/kompiro/${id}`)).status).toBe(404);
  });
});

/** The Cache API, in memory: what was put, keyed by URL, and how often it was asked. */
class MemoryCache implements EdgeCacheLike {
  readonly entries = new Map<string, Response>();
  matches = 0;
  failPut = false;
  failMatch = false;

  async match(request: Request): Promise<Response | undefined> {
    this.matches += 1;
    if (this.failMatch) throw new Error("cache match failed");
    return this.entries.get(request.url)?.clone();
  }

  async put(request: Request, response: Response): Promise<void> {
    if (this.failPut) throw new Error("cache put failed");
    this.entries.set(request.url, response.clone());
  }
}

describe("GET /g/<id>/og.png (#2995)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(rasterizeOgPng).mockClear();
    vi.restoreAllMocks();
  });

  /**
   * Request the image with `caches.default` stubbed, then wait for whatever
   * the route parked on `waitUntil`, so the cache's contents are settled.
   */
  async function image(
    kv: MemoryKV,
    path: string,
    { cookie, cache }: { cookie?: string; cache?: MemoryCache | null } = {},
  ): Promise<Response> {
    if (cache !== null) vi.stubGlobal("caches", { default: cache ?? new MemoryCache() });
    const pending: Promise<unknown>[] = [];
    const response = await handleRequest(
      new Request(`${ORIGIN}${path}`, { headers: cookie === undefined ? {} : { Cookie: cookie } }),
      env(kv),
      { waitUntil: (promise) => pending.push(promise) },
    );
    await Promise.all(pending);
    return response;
  }

  it("draws a public submission as a framed PNG, cacheable as briefly as its page", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const cache = new MemoryCache();
    const response = await image(kv, `/g/${id}/og.png`, { cache });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=600");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
    // The system view, letterboxed into the 1200×630 card frame.
    const [svg] = vi.mocked(rasterizeOgPng).mock.calls[0];
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="1200" height="630"/);
  });

  it("keeps the drawn image in the edge cache for a day, without cookies or Vary", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const cache = new MemoryCache();
    await image(kv, `/g/${id}/og.png`, { cache });
    expect(cache.entries.size).toBe(1);
    const [entry] = cache.entries.values();
    expect(entry.headers.get("Cache-Control")).toBe(`public, max-age=${OG_EDGE_CACHE_SECONDS}`);
    expect(entry.headers.get("Set-Cookie")).toBeNull();
    expect(entry.headers.get("Vary")).toBeNull();
  });

  it("serves the second request from the cache without drawing again", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const cache = new MemoryCache();
    await image(kv, `/g/${id}/og.png`, { cache });
    const second = await image(kv, `/g/${id}/og.png`, { cache });
    expect(second.status).toBe(200);
    // Readers get the page's ten minutes, not the cache's day.
    expect(second.headers.get("Cache-Control")).toBe("public, max-age=600");
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(PNG);
    expect(rasterizeOgPng).toHaveBeenCalledTimes(1);
  });

  it("keys the cache on the stored record, so the request's query cannot force a redraw", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const cache = new MemoryCache();
    await image(kv, `/g/${id}/og.png?v=1`, { cache });
    await image(kv, `/g/${id}/og.png?v=2&bust=${Math.random()}`, { cache });
    await image(kv, `/g/${id}/og.png`, { cache });
    expect(rasterizeOgPng).toHaveBeenCalledTimes(1);
    expect(cache.entries.size).toBe(1);
  });

  it("draws again once the submission is replaced", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const { accountId, slug } = parseSubmissionId(id);
    const cache = new MemoryCache();
    await image(kv, `/g/${id}/og.png`, { cache });
    await new GalleryStore(kv).submissions.update(
      accountId,
      slug,
      { krs: "system Shop {\n  service web\n}\n" },
      new Date("2026-08-03T00:00:00Z"),
    );
    await image(kv, `/g/${id}/og.png`, { cache });
    expect(rasterizeOgPng).toHaveBeenCalledTimes(2);
    expect(cache.entries.size).toBe(2);
  });

  it("answers an unlisted, a missing and a malformed id with the same 404, even for the owner", async () => {
    const kv = new MemoryKV();
    const { id: unlisted, cookie } = await seed(kv, "unlisted");
    const missing = formatSubmissionId(42, "0123456789ab");
    const responses = [
      await image(kv, `/g/${unlisted}/og.png`),
      await image(kv, `/g/${unlisted}/og.png`, { cookie }),
      await image(kv, `/g/${missing}/og.png`),
      await image(kv, "/g/not-an-id/og.png"),
    ];
    const bodies = await Promise.all(responses.map((response) => response.text()));
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(new Set(bodies).size).toBe(1);
    expect(rasterizeOgPng).not.toHaveBeenCalled();
  });

  it.each([
    [
      "the submission is deleted",
      async (store: GalleryStore, ref: { accountId: string; slug: string }) => {
        await store.submissions.delete(ref.accountId, ref.slug);
      },
    ],
    [
      "the submission is unlisted",
      async (store: GalleryStore, ref: { accountId: string; slug: string }) => {
        await store.submissions.update(ref.accountId, ref.slug, { visibility: "unlisted" }, at);
      },
    ],
    [
      "the account is deleted",
      async (store: GalleryStore, ref: { accountId: string; slug: string }) => {
        await store.purgeAccount(ref.accountId);
      },
    ],
  ])("does not serve a cached image once %s", async (_, change) => {
    // The deletion promise rests on this: the edge cache still holds the
    // image, and the record read in front of it is what refuses to serve it.
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const cache = new MemoryCache();
    expect((await image(kv, `/g/${id}/og.png`, { cache })).status).toBe(200);
    expect(cache.entries.size).toBe(1);
    await change(new GalleryStore(kv), parseSubmissionId(id));
    const after = await image(kv, `/g/${id}/og.png`, { cache });
    expect(after.status).toBe(404);
    expect(cache.matches).toBe(1);
  });

  it("never reads the session, so a signed-in browser's thumbnail costs no session write", async () => {
    const kv = new MemoryKV();
    const { id, cookie } = await seed(kv);
    const authenticate = vi.spyOn(GalleryStore.prototype, "authenticate");
    expect((await image(kv, `/g/${id}/og.png`, { cookie })).status).toBe(200);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("writes nothing to KV", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const before = kv.puts.length;
    await image(kv, `/g/${id}/og.png`);
    expect(kv.puts.length).toBe(before);
  });

  it("answers 422 for a document that cannot be drawn, and caches nothing", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv, "public", 42, "system Shop {\n  service\n");
    const cache = new MemoryCache();
    const response = await image(kv, `/g/${id}/og.png`, { cache });
    expect(response.status).toBe(422);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(cache.entries.size).toBe(0);
    expect(rasterizeOgPng).not.toHaveBeenCalled();
  });

  it("answers 500 when the rasterizer fails, caches nothing, and tries again next time", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const cache = new MemoryCache();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(rasterizeOgPng).mockRejectedValueOnce(new Error("font fetch failed"));
    const failed = await image(kv, `/g/${id}/og.png`, { cache });
    expect(failed.status).toBe(500);
    expect(failed.headers.get("Cache-Control")).toBe("no-store");
    expect(await failed.text()).not.toContain("font fetch failed");
    expect(cache.entries.size).toBe(0);
    expect((await image(kv, `/g/${id}/og.png`, { cache })).status).toBe(200);
    expect(rasterizeOgPng).toHaveBeenCalledTimes(2);
  });

  it("names a missing ASSETS binding as a configuration error, not a failed drawing", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("caches", { default: new MemoryCache() });
    const response = await handleRequest(
      new Request(`${ORIGIN}/g/${id}/og.png`),
      { ...env(kv), ASSETS: undefined },
      ctx,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "not_configured" } });
    expect(rasterizeOgPng).not.toHaveBeenCalled();
  });

  it("draws the image when the cache cannot be read, instead of failing the request", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const cache = new MemoryCache();
    cache.failMatch = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await image(kv, `/g/${id}/og.png`, { cache });
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
    expect(rasterizeOgPng).toHaveBeenCalledTimes(1);
  });

  it("still answers when the cache refuses the image", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const cache = new MemoryCache();
    cache.failPut = true;
    expect((await image(kv, `/g/${id}/og.png`, { cache })).status).toBe(200);
  });

  it("draws every time where the runtime has no Cache API", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    expect((await image(kv, `/g/${id}/og.png`, { cache: null })).status).toBe(200);
    expect((await image(kv, `/g/${id}/og.png`, { cache: null })).status).toBe(200);
    expect(rasterizeOgPng).toHaveBeenCalledTimes(2);
  });
});
