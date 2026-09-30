import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../app.js";
import { renderSubmission } from "../gallery/render.js";
import { VIEWER_TEMPLATE_PATH } from "../gallery/viewer-assets.js";
import type { NestEnv, NestExecutionContext } from "../env.js";
import { GalleryStore } from "../store/gallery-store.js";
import { formatSubmissionId } from "../store/gallery-keys.js";
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

// The shape of `packages/app/viewer.html` as built: a title, the two
// placeholders the route fills, and the bundle. `viewer-html.test.ts` in the
// app pins the real template to the same placeholders.
const TEMPLATE = [
  "<!doctype html><html><head><title>karasu</title></head><body>",
  '<!--GALLERY_HEADER--><div id="root"></div><!--KRS_SOURCE-->',
  '<script type="module" crossorigin src="/assets/viewer-abc.js"></script>',
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
    expect(body).toContain('src="/assets/viewer-abc.js"');
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
