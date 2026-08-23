import { describe, expect, it } from "vitest";
import { MAX_SUBMISSION_BYTES, SubmissionStore } from "./submissions.js";
import { MemoryKV } from "../testing/memory-kv.js";

const at = new Date("2026-08-02T00:00:00Z");
const later = new Date("2026-09-02T00:00:00Z");
const KRS = "system Shop {\n  service api\n}\n";
const input = { title: "Shop", krs: KRS };

describe("SubmissionStore", () => {
  it("round-trips a submission under its author", async () => {
    const store = new SubmissionStore(new MemoryKV());
    const created = await store.create(42, input, at);
    expect(await store.get(42, created.slug)).toEqual({
      slug: created.slug,
      accountId: "42",
      title: "Shop",
      krs: KRS,
      submittedAt: at.toISOString(),
      updatedAt: at.toISOString(),
      visibility: "public",
    });
  });

  it("is public by default, because submitting to a gallery is wanting it seen", async () => {
    const store = new SubmissionStore(new MemoryKV());
    expect((await store.create(42, input, at)).visibility).toBe("public");
  });

  it("stores no expiry, so author-managed content cannot vanish on its own", async () => {
    // This is the decision, not an omission. Every other key this service
    // writes expires; a submission that aged out at 90 days would produce
    // "the diagram I posted is gone" -- the support request the console
    // exists to remove. See TPL-2587.
    const kv = new MemoryKV();
    const store = new SubmissionStore(kv);
    const created = await store.create(42, input, at);
    await store.update(42, created.slug, { title: "Renamed" }, later);
    expect(kv.puts.length).toBeGreaterThan(1);
    expect(kv.puts.every((put) => put.options?.expirationTtl === undefined)).toBe(true);
  });

  it("keeps submittedAt when the document is replaced", async () => {
    const store = new SubmissionStore(new MemoryKV());
    const created = await store.create(42, input, at);
    const updated = await store.update(42, created.slug, { krs: "system Other {}\n" }, later);
    expect(updated?.submittedAt).toBe(at.toISOString());
    expect(updated?.updatedAt).toBe(later.toISOString());
    expect(updated?.krs).toBe("system Other {}\n");
  });

  it("will not resurrect a deleted submission through an update", async () => {
    const store = new SubmissionStore(new MemoryKV());
    const created = await store.create(42, input, at);
    await store.delete(42, created.slug);
    expect(await store.update(42, created.slug, { title: "back" }, later)).toBeUndefined();
    expect(await store.get(42, created.slug)).toBeUndefined();
  });

  it("will not hand one account's submission to another", async () => {
    const store = new SubmissionStore(new MemoryKV());
    const created = await store.create(42, input, at);
    expect(await store.get(43, created.slug)).toBeUndefined();
  });

  it("lists an account's submissions newest first, and nobody else's", async () => {
    const store = new SubmissionStore(new MemoryKV());
    await store.create(42, { ...input, title: "older" }, at);
    await store.create(42, { ...input, title: "newer" }, later);
    await store.create(420, { ...input, title: "theirs" }, later);
    expect((await store.list(42)).map((submission) => submission.title)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("reads a record written before visibility existed as unlisted", async () => {
    // Being wrong in this direction withholds something its author meant to
    // publish until they say so again. The other direction publishes
    // something nobody chose to.
    const kv = new MemoryKV();
    const store = new SubmissionStore(kv);
    const created = await store.create(42, input, at);
    const key = `sub/v1/42/${created.slug}`;
    const stored = JSON.parse((await kv.get(key)) as string) as Record<string, unknown>;
    delete stored.visibility;
    await kv.put(key, JSON.stringify(stored));
    expect((await store.get(42, created.slug))?.visibility).toBe("unlisted");
  });

  it("reads a corrupt record as absent rather than throwing", async () => {
    const kv = new MemoryKV();
    const store = new SubmissionStore(kv);
    const created = await store.create(42, input, at);
    await kv.put(`sub/v1/42/${created.slug}`, "not json");
    expect(await store.get(42, created.slug)).toBeUndefined();
    expect(await store.list(42)).toEqual([]);
  });

  it("reports whether a delete removed anything", async () => {
    const store = new SubmissionStore(new MemoryKV());
    const created = await store.create(42, input, at);
    expect(await store.delete(42, created.slug)).toBe(true);
    expect(await store.delete(42, created.slug)).toBe(false);
  });

  it("deletes every submission an account owns, and only that account's", async () => {
    const store = new SubmissionStore(new MemoryKV());
    await store.create(42, input, at);
    await store.create(42, input, at);
    await store.create(420, input, at);
    expect(await store.purgeAccount(42)).toBe(2);
    expect(await store.list(42)).toEqual([]);
    expect((await store.list(420)).length).toBe(1);
  });

  it("declares a cap far inside what KV holds", async () => {
    expect(MAX_SUBMISSION_BYTES).toBe(256 * 1024);
  });
});
