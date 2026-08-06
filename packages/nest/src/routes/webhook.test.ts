import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../app.js";
import type { NestEnv, NestExecutionContext } from "../env.js";
import { markGenerated } from "../store/krs-cache.js";
import { NestStore } from "../store/nest-store.js";
import { MemoryKV } from "../testing/memory-kv.js";

const ctx: NestExecutionContext = { waitUntil: () => {} };
const SECRET = "s3cret-webhook-secret";
const SHA = "a".repeat(40);
const entry = { krs: markGenerated("system Payments {}\n"), generatedAt: "2026-08-02T00:00:00Z" };

afterEach(() => {
  vi.restoreAllMocks();
});

async function sign(body: string, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret) as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body) as unknown as ArrayBuffer),
  );
  return `sha256=${[...mac].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** A KV pre-loaded with two repos under installation 42 and one under 43. */
async function seededKv(): Promise<MemoryKV> {
  const kv = new MemoryKV();
  const store = new NestStore(kv);
  await store.publish({ installationId: 42, owner: "kompiro", repo: "karasu", sha: SHA }, entry);
  await store.publish({ installationId: 42, owner: "kompiro", repo: "hane", sha: SHA }, entry);
  await store.publish({ installationId: 43, owner: "other", repo: "repo", sha: SHA }, entry);
  return kv;
}

async function deliver(
  event: string,
  payload: unknown,
  options: { env?: NestEnv; secret?: string; signature?: string | null } = {},
): Promise<Response> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "X-GitHub-Event": event };
  const signature =
    options.signature === undefined
      ? await sign(body, options.secret ?? SECRET)
      : options.signature;
  if (signature !== null) headers["X-Hub-Signature-256"] = signature;
  const env = options.env ?? {
    GITHUB_WEBHOOK_SECRET: SECRET,
    KRS_CACHE: await seededKv(),
  };
  return await handleRequest(
    new Request("https://nest.example/webhooks/github", { method: "POST", body, headers }),
    env,
    ctx,
  );
}

describe("POST /webhooks/github", () => {
  it("purges everything an installation produced when it is uninstalled", async () => {
    const kv = await seededKv();
    const response = await deliver(
      "installation",
      { action: "deleted", installation: { id: 42 } },
      { env: { GITHUB_WEBHOOK_SECRET: SECRET, KRS_CACHE: kv } },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).purged).toEqual({ documents: 2, pointers: 2 });
    // The other installation is untouched.
    expect(await new NestStore(kv).latest("other", "repo")).toBeDefined();
    expect(await new NestStore(kv).latest("kompiro", "karasu")).toBeUndefined();
  });

  it("purges on suspension too", async () => {
    // Reversible on GitHub's side, but the thing deleted is a derived artifact
    // that regenerates and the thing protected is someone revoking access.
    const kv = await seededKv();
    const response = await deliver(
      "installation",
      { action: "suspend", installation: { id: 42 } },
      { env: { GITHUB_WEBHOOK_SECRET: SECRET, KRS_CACHE: kv } },
    );
    expect((await response.json()).purged).toEqual({ documents: 2, pointers: 2 });
  });

  it("does not purge on an installation event that is not a revocation", async () => {
    const kv = await seededKv();
    const response = await deliver(
      "installation",
      { action: "created", installation: { id: 42 } },
      { env: { GITHUB_WEBHOOK_SECRET: SECRET, KRS_CACHE: kv } },
    );
    expect((await response.json()).purged).toBeNull();
    expect(await new NestStore(kv).latest("kompiro", "karasu")).toBeDefined();
  });

  it("purges only the repositories removed from an installation", async () => {
    const kv = await seededKv();
    const response = await deliver(
      "installation_repositories",
      {
        action: "removed",
        installation: { id: 42 },
        repositories_removed: [{ full_name: "kompiro/karasu" }],
      },
      { env: { GITHUB_WEBHOOK_SECRET: SECRET, KRS_CACHE: kv } },
    );
    expect((await response.json()).purged).toEqual({ documents: 1, pointers: 1 });
    expect(await new NestStore(kv).latest("kompiro", "karasu")).toBeUndefined();
    expect(await new NestStore(kv).latest("kompiro", "hane")).toBeDefined();
  });

  it("finishes the list when one removed name is unusable", async () => {
    // A name we cannot key on is a name we never stored anything under, so
    // skipping it is safe — abandoning the rest of the purge would not be.
    const kv = await seededKv();
    const response = await deliver(
      "installation_repositories",
      {
        action: "removed",
        installation: { id: 42 },
        repositories_removed: [
          { full_name: "not a repo name" },
          null,
          { name: "karasu" },
          { full_name: "kompiro/karasu" },
        ],
      },
      { env: { GITHUB_WEBHOOK_SECRET: SECRET, KRS_CACHE: kv } },
    );
    expect((await response.json()).purged).toEqual({ documents: 1, pointers: 1 });
  });

  it("does not purge on unsuspend", async () => {
    // The action closest to `suspend`, and the one where an accidental purge
    // would be both most likely and most obviously wrong.
    const kv = await seededKv();
    const response = await deliver(
      "installation",
      { action: "unsuspend", installation: { id: 42 } },
      { env: { GITHUB_WEBHOOK_SECRET: SECRET, KRS_CACHE: kv } },
    );
    expect((await response.json()).purged).toBeNull();
    expect(await new NestStore(kv).latest("kompiro", "karasu")).toBeDefined();
  });

  it("does not purge on new_permissions_accepted", async () => {
    const kv = await seededKv();
    const response = await deliver(
      "installation",
      { action: "new_permissions_accepted", installation: { id: 42 } },
      { env: { GITHUB_WEBHOOK_SECRET: SECRET, KRS_CACHE: kv } },
    );
    expect((await response.json()).purged).toBeNull();
    expect(await new NestStore(kv).latest("kompiro", "karasu")).toBeDefined();
  });

  it("purges a late removal even though the repo was republished", async () => {
    // GitHub delivers at least once and out of order, so this is reachable.
    // Resolved towards deletion on purpose: deleting a derived artifact too
    // eagerly costs one recompute, keeping one too long is the data-trust
    // failure ADR-1990 decision 6 exists to prevent.
    const kv = await seededKv();
    const response = await deliver(
      "installation_repositories",
      {
        action: "removed",
        installation: { id: 42 },
        repositories_removed: [{ full_name: "kompiro/karasu" }],
      },
      { env: { GITHUB_WEBHOOK_SECRET: SECRET, KRS_CACHE: kv } },
    );
    expect((await response.json()).purged).toEqual({ documents: 1, pointers: 1 });
    expect(await new NestStore(kv).latest("kompiro", "karasu")).toBeUndefined();
  });

  it("refuses a body larger than it will buffer, before verifying anything", async () => {
    // The signature cannot be checked until the whole body is in memory, so
    // this is the one resource an unsigned caller can otherwise consume.
    const response = await handleRequest(
      new Request("https://nest.example/webhooks/github", {
        method: "POST",
        body: "{}",
        headers: {
          "X-GitHub-Event": "installation",
          "Content-Length": String(2 * 1024 * 1024),
        },
      }),
      { GITHUB_WEBHOOK_SECRET: SECRET, KRS_CACHE: await seededKv() },
      ctx,
    );
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe("payload_too_large");
  });

  it("refuses an oversized body that declared no length", async () => {
    const body = JSON.stringify({ padding: "x".repeat(1024 * 1024 + 16) });
    const response = await handleRequest(
      new Request("https://nest.example/webhooks/github", {
        method: "POST",
        body,
        headers: { "X-GitHub-Event": "installation", "X-Hub-Signature-256": await sign(body) },
      }),
      { GITHUB_WEBHOOK_SECRET: SECRET, KRS_CACHE: await seededKv() },
      ctx,
    );
    expect(response.status).toBe(413);
  });

  it("is idempotent, so a redelivery is safe", async () => {
    const kv = await seededKv();
    const env = { GITHUB_WEBHOOK_SECRET: SECRET, KRS_CACHE: kv };
    const payload = { action: "deleted", installation: { id: 42 } };
    expect((await (await deliver("installation", payload, { env })).json()).purged).toEqual({
      documents: 2,
      pointers: 2,
    });
    expect((await (await deliver("installation", payload, { env })).json()).purged).toEqual({
      documents: 0,
      pointers: 0,
    });
  });

  it("rejects an unsigned delivery without touching the store", async () => {
    const kv = await seededKv();
    const response = await deliver(
      "installation",
      { action: "deleted", installation: { id: 42 } },
      { env: { GITHUB_WEBHOOK_SECRET: SECRET, KRS_CACHE: kv }, signature: null },
    );
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("bad_signature");
    expect(await new NestStore(kv).latest("kompiro", "karasu")).toBeDefined();
  });

  it("rejects a delivery signed with the wrong secret", async () => {
    const kv = await seededKv();
    const response = await deliver(
      "installation",
      { action: "deleted", installation: { id: 42 } },
      { env: { GITHUB_WEBHOOK_SECRET: SECRET, KRS_CACHE: kv }, secret: "attacker" },
    );
    expect(response.status).toBe(401);
    expect(await new NestStore(kv).latest("kompiro", "karasu")).toBeDefined();
  });

  it("says nothing about why a signature failed", async () => {
    // A prober has no legitimate use for knowing which half it got wrong.
    const missing = await deliver("installation", {}, { signature: null });
    const wrong = await deliver("installation", {}, { signature: `sha256=${"0".repeat(64)}` });
    expect(await missing.json()).toEqual(await wrong.json());
  });

  it("refuses rather than accepting anything when the secret is not configured", async () => {
    // Without this, an unconfigured deploy would treat every delivery as
    // unverifiable and the endpoint would look merely broken rather than
    // dangerous.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await deliver(
      "installation",
      { action: "deleted", installation: { id: 42 } },
      { env: { KRS_CACHE: new MemoryKV() } },
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("not_configured");
  });

  it("400s a signed body that is not a JSON object", async () => {
    const body = "[1,2,3]";
    const response = await handleRequest(
      new Request("https://nest.example/webhooks/github", {
        method: "POST",
        body,
        headers: { "X-GitHub-Event": "installation", "X-Hub-Signature-256": await sign(body) },
      }),
      { GITHUB_WEBHOOK_SECRET: SECRET, KRS_CACHE: await seededKv() },
      ctx,
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("bad_payload");
  });

  it("acknowledges an event it does not handle", async () => {
    // Retrying forever would eventually get the endpoint disabled, taking the
    // events we do handle down with it.
    const response = await deliver("push", { installation: { id: 42 } });
    expect(response.status).toBe(200);
    expect((await response.json()).purged).toBeNull();
  });

  it("acknowledges a payload with no installation", async () => {
    const response = await deliver("installation", { action: "deleted" });
    expect(response.status).toBe(200);
    expect((await response.json()).purged).toBeNull();
  });

  it("reports a failed purge as retryable rather than acknowledging it", async () => {
    // GitHub retries a 5xx and purge is idempotent, so a retry is the right
    // answer to a partial delete. Acknowledging would lose the deletion.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const kv = await seededKv();
    kv.list = () => Promise.reject(new Error("KV unavailable"));
    const response = await deliver(
      "installation",
      { action: "deleted", installation: { id: 42 } },
      { env: { GITHUB_WEBHOOK_SECRET: SECRET, KRS_CACHE: kv } },
    );
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("purge_failed");
  });

  it("fails towards invisibility when the purge dies part-way through", async () => {
    // The interesting failure is not the first call but a death *between* the
    // pointer removal and the document deletion. NestStore removes the pointer
    // first precisely so this leaves a repo invisible rather than a pointer
    // advertising a diagram that is gone.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const kv = await seededKv();
    const store = new NestStore(kv);
    const realDelete = kv.delete.bind(kv);
    kv.delete = (key: string) =>
      key.startsWith("krs/") ? Promise.reject(new Error("KV unavailable")) : realDelete(key);

    const response = await deliver(
      "installation",
      { action: "deleted", installation: { id: 42 } },
      { env: { GITHUB_WEBHOOK_SECRET: SECRET, KRS_CACHE: kv } },
    );
    expect(response.status).toBe(500);
    // Pointers gone, documents still there: nothing resolves, and a retry
    // finishes the job.
    expect(await store.latest("kompiro", "karasu")).toBeUndefined();
    expect(kv.keys().some((key) => key.startsWith("krs/v1/42/"))).toBe(true);
    expect(kv.keys()).not.toContain("idx/v1/kompiro/karasu");
    // Installation 43 is untouched throughout.
    expect(kv.keys()).toContain("idx/v1/other/repo");
  });

  it("is not shadowed by the /<owner>/<repo> route", async () => {
    const response = await handleRequest(
      new Request("https://nest.example/webhooks/github"),
      { GITHUB_WEBHOOK_SECRET: SECRET, KRS_CACHE: await seededKv() },
      ctx,
    );
    // A GET on the webhook path is a 405 from the webhook route, not a 404
    // from the repo route reporting "nothing generated for webhooks/github".
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });
});
