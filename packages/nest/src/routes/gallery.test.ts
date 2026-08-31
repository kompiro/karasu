import { describe, expect, it } from "vitest";
import { handleRequest } from "../app.js";
import type { NestEnv, NestExecutionContext } from "../env.js";
import { GalleryStore } from "../store/gallery-store.js";
import { formatSubmissionId } from "../store/gallery-keys.js";
import { MemoryKV } from "../testing/memory-kv.js";
import { SESSION_COOKIE } from "../auth/session.js";

const ctx: NestExecutionContext = { waitUntil: () => {} };
const ORIGIN = "https://nest.example";
const KRS = "system Shop {\n  service api\n}\n";
const at = new Date("2026-08-02T00:00:00Z");

const env = (kv: MemoryKV): NestEnv => ({ NEST_STORE: kv, NEST_PUBLIC_ORIGIN: ORIGIN });

async function seed(
  kv: MemoryKV,
  visibility: "public" | "unlisted" = "public",
  accountId = 42,
): Promise<{ id: string; cookie: string }> {
  const store = new GalleryStore(kv);
  await store.accounts.signIn(accountId, "kompiro", at);
  // `new Date()` rather than the fixture date: the absolute cap is measured
  // against the real clock, so a session frozen at `at` would age past it as
  // real time passed and fail this suite later for no reason (#2655).
  const { sessionId } = await store.sessions.issue(accountId, "kompiro", new Date());
  const submission = await store.submissions.create(
    accountId,
    { title: "Shop <script>", krs: KRS, visibility },
    at,
  );
  return {
    id: formatSubmissionId(accountId, submission.slug),
    cookie: `${SESSION_COOKIE}=${accountId}:${sessionId}`,
  };
}

const get = (kv: MemoryKV, path: string, cookie?: string): Promise<Response> =>
  handleRequest(
    new Request(`${ORIGIN}${path}`, { headers: cookie === undefined ? {} : { Cookie: cookie } }),
    env(kv),
    ctx,
  );

describe("GET /g/<id>", () => {
  it("serves an HTML page with the diagram inline", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const response = await get(kv, `/g/${id}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    const body = await response.text();
    expect(body).toContain("<svg");
    expect(body).toContain("kompiro");
  });

  it("escapes a title chosen by a stranger", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const body = await (await get(kv, `/g/${id}`)).text();
    expect(body).toContain("Shop &lt;script&gt;");
    expect(body).not.toContain("Shop <script>");
  });

  it("serves the raw SVG and the .krs on request", async () => {
    const kv = new MemoryKV();
    const { id } = await seed(kv);
    const svg = await get(kv, `/g/${id}?format=svg`);
    expect(svg.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
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
