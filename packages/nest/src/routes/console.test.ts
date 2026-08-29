import { describe, expect, it } from "vitest";
import { handleRequest } from "../app.js";
import type { NestEnv, NestExecutionContext } from "../env.js";
import { GalleryStore } from "../store/gallery-store.js";
import { formatSubmissionId } from "../store/gallery-keys.js";
import { MemoryKV } from "../testing/memory-kv.js";
import { SESSION_COOKIE } from "../auth/session.js";
import { MAX_FORM_BODY_BYTES } from "../request-body.js";

const ctx: NestExecutionContext = { waitUntil: () => {} };
const ORIGIN = "https://nest.example";
const KRS = "system Shop {\n  service api\n}\n";
/** A document the parser reports on, used wherever a rejection is the point. */
const BROKEN = "system Shop {\n  service\n";
const at = new Date("2026-08-02T00:00:00Z");

const env = (kv: MemoryKV): NestEnv => ({ KRS_CACHE: kv, NEST_PUBLIC_ORIGIN: ORIGIN });

async function account(kv: MemoryKV, accountId: number, login = "kompiro"): Promise<string> {
  const store = new GalleryStore(kv);
  await store.accounts.signIn(accountId, login, at);
  const { sessionId } = await store.sessions.issue(accountId, login, at);
  return `${SESSION_COOKIE}=${accountId}:${sessionId}`;
}

async function submission(
  kv: MemoryKV,
  accountId: number,
  visibility: "public" | "unlisted" = "public",
  title = "Shop",
): Promise<string> {
  const created = await new GalleryStore(kv).submissions.create(
    accountId,
    { title, krs: KRS, visibility },
    at,
  );
  return formatSubmissionId(accountId, created.slug);
}

const get = (kv: MemoryKV, path: string, cookie?: string): Promise<Response> =>
  handleRequest(
    new Request(`${ORIGIN}${path}`, { headers: cookie === undefined ? {} : { Cookie: cookie } }),
    env(kv),
    ctx,
  );

function post(
  kv: MemoryKV,
  path: string,
  fields: Record<string, string>,
  options: { cookie?: string; origin?: string | null } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.cookie !== undefined) headers.Cookie = options.cookie;
  if (options.origin !== null) headers.Origin = options.origin ?? ORIGIN;
  const body = new URLSearchParams(fields);
  return handleRequest(
    new Request(`${ORIGIN}${path}`, { method: "POST", headers, body }),
    env(kv),
    ctx,
  );
}

describe("GET /console", () => {
  it("lists what the account owns", async () => {
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    await submission(kv, 42, "public", "Mine");
    const body = await (await get(kv, "/console", cookie)).text();
    expect(body).toContain("Mine");
  });

  it("lists nobody else's", async () => {
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    await account(kv, 420, "stranger");
    await submission(kv, 420, "public", "Theirs");
    expect(await (await get(kv, "/console", cookie)).text()).not.toContain("Theirs");
  });

  it("sends a signed-out visitor to sign in", async () => {
    const response = await get(new MemoryKV(), "/console");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/auth/login");
  });

  it("answers 401 rather than redirecting a form POST", async () => {
    // A redirect loses the body, so the submitter would come back signed in
    // and find their work gone.
    const response = await post(new MemoryKV(), "/console/submit", { title: "t", krs: KRS });
    expect(response.status).toBe(401);
  });
});

describe("POST /console/submit", () => {
  it("stores a submission from a plain form", async () => {
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const response = await post(kv, "/console/submit", { title: "Shop", krs: KRS }, { cookie });
    expect(response.status).toBe(303);
    expect((await new GalleryStore(kv).submissions.list(42)).length).toBe(1);
  });

  it("runs the same two checks ingest runs", async () => {
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const response = await post(
      kv,
      "/console/submit",
      { title: "Shop", krs: "system Shop {\n  service\n" },
      { cookie },
    );
    expect(response.status).toBe(400);
    expect((await new GalleryStore(kv).submissions.list(42)).length).toBe(0);
  });

  it("hands the rejected document back on the form, not a page of JSON", async () => {
    // These are plain forms with no client script, so a JSON body is literally
    // what the submitter reads — and a .krs with a syntax error is the routine
    // failure, not an exotic one. Answering it with braces and no textarea
    // manufactures the support request this console exists to remove.
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const response = await post(kv, "/console/submit", { title: "Shop", krs: BROKEN }, { cookie });
    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const body = await response.text();
    expect(body).toContain("syntax error");
    expect(body).toContain(BROKEN);
    expect(body).toContain('value="Shop"');
  });

  it("keeps the unlisted choice on the form it hands back", async () => {
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const response = await post(
      kv,
      "/console/submit",
      { title: "Shop", krs: BROKEN, unlisted: "on" },
      { cookie },
    );
    expect(await response.text()).toContain('value="on" checked');
  });

  it("refuses a cross-origin form and stores nothing", async () => {
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const response = await post(
      kv,
      "/console/submit",
      { title: "Shop", krs: KRS },
      { cookie, origin: "https://evil.example" },
    );
    expect(response.status).toBe(403);
    expect((await new GalleryStore(kv).submissions.list(42)).length).toBe(0);
  });

  it("refuses a body too large to read, rather than reading it first", async () => {
    // `validateSubmission` would say `too_large` — but only once the whole body
    // is in the isolate, which is the memory this cap exists to not spend. The
    // ingest door has counted as the bytes arrive since it was written; this
    // one now shares the counter.
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const response = await post(
      kv,
      "/console/submit",
      { title: "Shop", krs: "a".repeat(MAX_FORM_BODY_BYTES + 1) },
      { cookie },
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "payload_too_large" } });
    expect((await new GalleryStore(kv).submissions.list(42)).length).toBe(0);
  });
});

describe("GET /console/s/<id>", () => {
  it("offers unlisting before deletion", async () => {
    // Most withdrawal requests mean "not visible right now", not "gone". A
    // reversible control absorbs those and generates no "I deleted it by
    // mistake" follow-up.
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const id = await submission(kv, 42);
    const body = await (await get(kv, `/console/s/${id}`, cookie)).text();
    expect(body).toContain("Make it unlisted");
    expect(body.indexOf("Make it unlisted")).toBeLessThan(body.indexOf("Delete this model"));
  });

  it("refuses to manage a submission the account does not own", async () => {
    const kv = new MemoryKV();
    const mine = await account(kv, 42);
    await account(kv, 420, "stranger");
    const theirs = await submission(kv, 420);
    expect((await get(kv, `/console/s/${theirs}`, mine)).status).toBe(404);
  });

  it("keeps a leading blank line through the textarea", async () => {
    // An HTML parser drops one newline immediately after `<textarea>`, so the
    // page has to carry a spare or a .krs that starts with a blank line loses
    // it every time its author opens the form.
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const created = await new GalleryStore(kv).submissions.create(
      42,
      { title: "Shop", krs: `\n${KRS}` },
      at,
    );
    const id = formatSubmissionId(42, created.slug);
    const body = await (await get(kv, `/console/s/${id}`, cookie)).text();
    expect(body).toContain(`<textarea name="krs" required>\n\n${KRS}</textarea>`);
  });
});

describe("POST /console/s/<id>/visibility", () => {
  it("unpublishes without deleting", async () => {
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const id = await submission(kv, 42, "public");
    await post(kv, `/console/s/${id}/visibility`, { visibility: "unlisted" }, { cookie });
    const stored = await new GalleryStore(kv).submissions.list(42);
    expect(stored[0]?.visibility).toBe("unlisted");
    expect(stored.length).toBe(1);
  });

  it("publishes again, so the control is reversible", async () => {
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const id = await submission(kv, 42, "unlisted");
    await post(kv, `/console/s/${id}/visibility`, { visibility: "public" }, { cookie });
    expect((await new GalleryStore(kv).submissions.list(42))[0]?.visibility).toBe("public");
  });

  it("refuses a cross-origin form and changes nothing", async () => {
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const id = await submission(kv, 42, "public");
    const response = await post(
      kv,
      `/console/s/${id}/visibility`,
      { visibility: "unlisted" },
      { cookie, origin: "https://evil.example" },
    );
    expect(response.status).toBe(403);
    expect((await new GalleryStore(kv).submissions.list(42))[0]?.visibility).toBe("public");
  });

  it("will not let one account change another's submission", async () => {
    const kv = new MemoryKV();
    const mine = await account(kv, 42);
    await account(kv, 420, "stranger");
    const theirs = await submission(kv, 420, "public");
    const response = await post(
      kv,
      `/console/s/${theirs}/visibility`,
      { visibility: "unlisted" },
      { cookie: mine },
    );
    expect(response.status).toBe(404);
    expect((await new GalleryStore(kv).submissions.list(420))[0]?.visibility).toBe("public");
  });
});

describe("POST /console/s/<id>/replace", () => {
  it("replaces the document and keeps the id", async () => {
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const id = await submission(kv, 42);
    const replaced = "system Shop {\n  service api\n  service worker\n}\n";
    const response = await post(
      kv,
      `/console/s/${id}/replace`,
      { title: "Shop v2", krs: replaced },
      { cookie },
    );
    expect(response.headers.get("Location")).toBe(`/console/s/${id}`);
    const stored = (await new GalleryStore(kv).submissions.list(42))[0];
    expect(stored?.krs).toBe(replaced);
    expect(stored?.title).toBe("Shop v2");
  });

  it("refuses a replacement that does not parse, keeping the old one", async () => {
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const id = await submission(kv, 42);
    const response = await post(
      kv,
      `/console/s/${id}/replace`,
      { title: "Shop", krs: "system Shop {\n  service\n" },
      { cookie },
    );
    expect(response.status).toBe(400);
    expect((await new GalleryStore(kv).submissions.list(42))[0]?.krs).toBe(KRS);
  });

  it("hands the refused edit back, not the document it failed to replace", async () => {
    // Redrawing the textarea from storage would throw away the work being
    // rejected, which is the one thing the submitter still needs.
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const id = await submission(kv, 42);
    const response = await post(
      kv,
      `/console/s/${id}/replace`,
      { title: "Shop v2", krs: BROKEN },
      { cookie },
    );
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const body = await response.text();
    expect(body).toContain(BROKEN);
    expect(body).toContain('value="Shop v2"');
    expect(body).not.toContain("service api");
  });

  it("stores the line endings the submitter wrote, not the ones the form sent", async () => {
    // A browser serialising a <textarea> rewrites every line ending to CRLF,
    // so editing only the title would otherwise rewrite the whole document —
    // and `?format=krs` would hand back something that no longer matches the
    // file on their disk.
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const id = await submission(kv, 42);
    const edited = "system Shop {\n  service api\n  service worker\n}\n";
    await post(
      kv,
      `/console/s/${id}/replace`,
      { title: "Shop", krs: edited.replaceAll("\n", "\r\n") },
      { cookie },
    );
    expect((await new GalleryStore(kv).submissions.list(42))[0]?.krs).toBe(edited);
  });

  it("refuses a cross-origin form and keeps the document", async () => {
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const id = await submission(kv, 42);
    const response = await post(
      kv,
      `/console/s/${id}/replace`,
      { title: "Shop v2", krs: "system Shop {\n  service worker\n}\n" },
      { cookie, origin: "https://evil.example" },
    );
    expect(response.status).toBe(403);
    expect((await new GalleryStore(kv).submissions.list(42))[0]?.krs).toBe(KRS);
  });
});

describe("deleting one submission", () => {
  it("asks first, and points at unlisting as the reversible option", async () => {
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const id = await submission(kv, 42);
    const body = await (await get(kv, `/console/s/${id}/delete`, cookie)).text();
    expect(body).toContain("cannot be undone");
    expect(body).toContain("make it unlisted");
  });

  it("deletes on the POST and leaves the rest alone", async () => {
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const doomed = await submission(kv, 42, "public", "Doomed");
    await submission(kv, 42, "public", "Kept");
    await post(kv, `/console/s/${doomed}/delete`, {}, { cookie });
    const left = await new GalleryStore(kv).submissions.list(42);
    expect(left.map((entry) => entry.title)).toEqual(["Kept"]);
  });

  it("refuses a cross-origin request and deletes nothing", async () => {
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const id = await submission(kv, 42);
    const response = await post(
      kv,
      `/console/s/${id}/delete`,
      {},
      { cookie, origin: "https://evil.example" },
    );
    expect(response.status).toBe(403);
    expect((await new GalleryStore(kv).submissions.list(42)).length).toBe(1);
  });
});

describe("deleting the account", () => {
  it("says how much is about to go", async () => {
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    await submission(kv, 42);
    await submission(kv, 42);
    const body = await (await get(kv, "/console/account/delete", cookie)).text();
    expect(body).toContain("<strong>2</strong>");
  });

  it("is one operation over everything the account owns", async () => {
    // Otherwise the single most tedious request stays human-handled, which is
    // what the console exists to prevent.
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    await submission(kv, 42);
    await submission(kv, 42);
    const response = await post(kv, "/console/account/delete", {}, { cookie });
    expect(response.status).toBe(303);
    expect((await kv.list({ limit: 1000 })).keys).toEqual([]);
  });

  it("clears the cookie, so the browser stops sending a dead credential", async () => {
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    const response = await post(kv, "/console/account/delete", {}, { cookie });
    expect(response.headers.getSetCookie().join(" ")).toContain("Max-Age=0");
  });

  it("leaves another account untouched", async () => {
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    await submission(kv, 42);
    await account(kv, 420, "stranger");
    await submission(kv, 420);
    await post(kv, "/console/account/delete", {}, { cookie });
    expect((await new GalleryStore(kv).submissions.list(420)).length).toBe(1);
    expect(await new GalleryStore(kv).accounts.get(420)).toBeDefined();
  });

  it("refuses a cross-origin request and deletes nothing", async () => {
    const kv = new MemoryKV();
    const cookie = await account(kv, 42);
    await submission(kv, 42);
    const response = await post(
      kv,
      "/console/account/delete",
      {},
      { cookie, origin: "https://evil.example" },
    );
    expect(response.status).toBe(403);
    expect((await new GalleryStore(kv).submissions.list(42)).length).toBe(1);
  });
});
