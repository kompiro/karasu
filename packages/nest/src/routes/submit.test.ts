import { describe, expect, it } from "vitest";
import { handleRequest } from "../app.js";
import type { NestEnv, NestExecutionContext } from "../env.js";
import { GalleryStore } from "../store/gallery-store.js";
import { MAX_SUBMISSION_BYTES } from "../store/submissions.js";
import { MemoryKV } from "../testing/memory-kv.js";
import { SESSION_COOKIE } from "../auth/session.js";

const ctx: NestExecutionContext = { waitUntil: () => {} };
const ORIGIN = "https://nest.example";
const KRS = "system Shop {\n  service api\n}\n";

function env(kv: MemoryKV): NestEnv {
  return {
    NEST_STORE: kv,
    GITHUB_OAUTH_CLIENT_ID: "Iv1.client",
    GITHUB_OAUTH_CLIENT_SECRET: "shhh",
    NEST_PUBLIC_ORIGIN: ORIGIN,
  };
}

/** A signed-in submitter, and the cookie that says so. */
async function signedIn(kv: MemoryKV, accountId = 42): Promise<string> {
  const store = new GalleryStore(kv);
  await store.accounts.signIn(accountId, "kompiro", new Date("2026-08-02T00:00:00Z"));
  const { sessionId } = await store.sessions.issue(
    accountId,
    "kompiro",
    new Date("2026-08-02T00:00:00Z"),
  );
  return `${SESSION_COOKIE}=${accountId}:${sessionId}`;
}

function post(
  kv: MemoryKV,
  body: unknown,
  options: { cookie?: string; origin?: string | null } = {},
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.cookie !== undefined) headers.Cookie = options.cookie;
  if (options.origin !== null) headers.Origin = options.origin ?? ORIGIN;
  return handleRequest(
    new Request(`${ORIGIN}/api/submissions`, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    env(kv),
    ctx,
  );
}

describe("POST /api/submissions", () => {
  it("stores a submission and answers with the address to share", async () => {
    const kv = new MemoryKV();
    const response = await post(kv, { title: "Shop", krs: KRS }, { cookie: await signedIn(kv) });
    expect(response.status).toBe(201);
    const created = (await response.json()) as Record<string, string>;
    expect(created.id).toMatch(/^42-[0-9abcdefghjkmnpqrstvwxyz]{12}$/);
    expect(created.url).toBe(`${ORIGIN}/g/${created.id}`);
    expect(created.visibility).toBe("public");

    const stored = await new GalleryStore(kv).submissions.list(42);
    expect(stored.map((submission) => submission.krs)).toEqual([KRS]);
  });

  it("gives the submission its own id space rather than reusing owner/repo", async () => {
    // A submission is not repository-bound, so there is no repository for a
    // key to name -- and `owner/repo` goes on meaning "the .krs committed to
    // that repository" on the app's permalink face (TPL-2249).
    const kv = new MemoryKV();
    const response = await post(kv, { title: "Shop", krs: KRS }, { cookie: await signedIn(kv) });
    const created = (await response.json()) as Record<string, string>;
    expect(created.id).not.toContain("/");
    expect((await kv.list({ prefix: "sub/" })).keys[0]?.name).toMatch(/^sub\/v1\/42\//);
  });

  it("refuses an anonymous submission", async () => {
    // With no account there is nobody to answer a withdrawal request and no
    // way to stop abuse.
    const response = await post(new MemoryKV(), { title: "Shop", krs: KRS });
    expect(response.status).toBe(401);
  });

  it("refuses a submission carried by a forged cookie", async () => {
    const kv = new MemoryKV();
    const response = await post(
      kv,
      { title: "Shop", krs: KRS },
      { cookie: `${SESSION_COOKIE}=42:${"x".repeat(32)}` },
    );
    expect(response.status).toBe(401);
    expect((await kv.list({ prefix: "sub/" })).keys).toEqual([]);
  });

  it("refuses a request from another origin", async () => {
    const kv = new MemoryKV();
    const response = await post(
      kv,
      { title: "Shop", krs: KRS },
      { cookie: await signedIn(kv), origin: "https://evil.example" },
    );
    expect(response.status).toBe(403);
    expect((await kv.list({ prefix: "sub/" })).keys).toEqual([]);
  });

  it("refuses a document that does not parse, and stores nothing", async () => {
    const kv = new MemoryKV();
    const response = await post(
      kv,
      { title: "Shop", krs: "system Shop {\n  service\n" },
      { cookie: await signedIn(kv) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "does_not_parse" } });
    expect((await kv.list({ prefix: "sub/" })).keys).toEqual([]);
  });

  it("refuses a document carrying something credential-shaped", async () => {
    const kv = new MemoryKV();
    const secret = `ghp_${"a".repeat(36)}`;
    const response = await post(
      kv,
      {
        title: "Shop",
        krs: `system Shop {\n  service api {\n    description "${secret}"\n  }\n}\n`,
      },
      { cookie: await signedIn(kv) },
    );
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(secret);
    expect((await kv.list({ prefix: "sub/" })).keys).toEqual([]);
  });

  it("refuses a body larger than the cap before reading it", async () => {
    const kv = new MemoryKV();
    const cookie = await signedIn(kv);
    const response = await handleRequest(
      new Request(`${ORIGIN}/api/submissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          Origin: ORIGIN,
          "Content-Length": String(MAX_SUBMISSION_BYTES * 4),
        },
        body: JSON.stringify({ title: "Shop", krs: KRS }),
      }),
      env(kv),
      ctx,
    );
    expect(response.status).toBe(413);
  });

  it("refuses an oversized body even when Content-Length is absent", async () => {
    // `Headers.get` returns null and `Number(null)` is 0, so a header check
    // alone let a chunked or header-less request through to the parser.
    const kv = new MemoryKV();
    const cookie = await signedIn(kv);
    const response = await handleRequest(
      new Request(`${ORIGIN}/api/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie, Origin: ORIGIN },
        body: JSON.stringify({ title: "Shop", krs: "x".repeat(MAX_SUBMISSION_BYTES * 3) }),
      }),
      env(kv),
      ctx,
    );
    expect(response.status).toBe(413);
    expect((await kv.list({ prefix: "sub/" })).keys).toEqual([]);
  });

  it("cancels an endless body at the cap instead of buffering it", async () => {
    // The Content-Length check is advisory and `request.text()` would have
    // buffered everything before the size was known -- so the cap has to hold
    // against a body that never declares a length and never ends. Without the
    // bounded reader this test does not fail, it hangs.
    const kv = new MemoryKV();
    const cookie = await signedIn(kv);
    const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
    let pulled = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    // `duplex` is required to send a stream and is missing from the DOM
    // `RequestInit`, which is what this package compiles against.
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: ORIGIN },
      body,
      duplex: "half",
    } as RequestInit;

    const response = await handleRequest(
      new Request(`${ORIGIN}/api/submissions`, init),
      env(kv),
      ctx,
    );
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    // Enough chunks to cross the cap, and then a small allowance for the
    // runtime reading ahead -- not the unbounded number an endless body offers.
    expect(pulled).toBeLessThanOrEqual((MAX_SUBMISSION_BYTES * 2) / chunk.byteLength + 4);
    expect((await kv.list({ prefix: "sub/" })).keys).toEqual([]);
  });

  it("separates the transport refusal from the document refusal", async () => {
    // One code must not mean two statuses: `http.ts` says the code is what
    // callers branch on.
    const kv = new MemoryKV();
    const cookie = await signedIn(kv);
    const transport = await post(
      kv,
      { title: "Shop", krs: "x".repeat(MAX_SUBMISSION_BYTES * 3) },
      { cookie },
    );
    expect(transport.status).toBe(413);
    expect(await transport.json()).toMatchObject({ error: { code: "payload_too_large" } });

    // Inside the envelope cap but past the document cap.
    const document = await post(
      kv,
      { title: "Shop", krs: "x".repeat(MAX_SUBMISSION_BYTES + 1024) },
      { cookie },
    );
    expect(document.status).toBe(400);
    expect(await document.json()).toMatchObject({ error: { code: "too_large" } });
  });

  it("refuses a body that is not JSON", async () => {
    const kv = new MemoryKV();
    const response = await post(kv, "not json at all", { cookie: await signedIn(kv) });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_body" } });
  });

  it("accepts an unlisted submission, and refuses any other visibility", async () => {
    const kv = new MemoryKV();
    const cookie = await signedIn(kv);
    const unlisted = await post(
      kv,
      { title: "Shop", krs: KRS, visibility: "unlisted" },
      { cookie },
    );
    expect(((await unlisted.json()) as Record<string, string>).visibility).toBe("unlisted");

    const bogus = await post(kv, { title: "Shop", krs: KRS, visibility: "secret" }, { cookie });
    expect(bogus.status).toBe(400);
  });

  it("files the submission under the signed-in account, not one named in the body", async () => {
    const kv = new MemoryKV();
    const response = await post(
      kv,
      { title: "Shop", krs: KRS, accountId: "999" },
      { cookie: await signedIn(kv, 42) },
    );
    expect(((await response.json()) as Record<string, string>).id.startsWith("42-")).toBe(true);
  });
});
