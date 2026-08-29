import { describe, expect, it } from "vitest";
import { AccountStore } from "./accounts.js";
import { MemoryKV } from "../testing/memory-kv.js";

const first = new Date("2026-08-01T00:00:00Z");
const later = new Date("2026-09-01T00:00:00Z");

describe("AccountStore", () => {
  it("creates the record on first sign-in", async () => {
    const store = new AccountStore(new MemoryKV());
    await store.signIn(42, "kompiro", first);
    expect(await store.get(42)).toEqual({
      accountId: "42",
      login: "kompiro",
      firstSeenAt: first.toISOString(),
      lastSeenAt: first.toISOString(),
    });
  });

  it("keeps firstSeenAt across sign-ins", async () => {
    // It is the only field here that cannot be recovered from GitHub later,
    // so overwriting it would destroy the record's one piece of history.
    const store = new AccountStore(new MemoryKV());
    await store.signIn(42, "kompiro", first);
    const account = await store.signIn(42, "kompiro", later);
    expect(account.firstSeenAt).toBe(first.toISOString());
    expect(account.lastSeenAt).toBe(later.toISOString());
  });

  it("refreshes the login, because GitHub lets its owner rename it", async () => {
    const store = new AccountStore(new MemoryKV());
    await store.signIn(42, "old-name", first);
    await store.signIn(42, "new-name", later);
    expect((await store.get(42))?.login).toBe("new-name");
  });

  it("stores no expiry, so an account cannot outlive itself", async () => {
    // An account that aged out would take its submissions' owner with it and
    // leave content nobody could withdraw.
    const kv = new MemoryKV();
    await new AccountStore(kv).signIn(42, "kompiro", first);
    expect(kv.puts.every((put) => put.options?.expirationTtl === undefined)).toBe(true);
  });

  it("reads a corrupt record as absent rather than throwing", async () => {
    const kv = new MemoryKV();
    await kv.put("acct/v1/42", "not json");
    expect(await new AccountStore(kv).get(42)).toBeUndefined();
  });

  it("deletes only the account asked for, not the one whose id extends it", async () => {
    // `acct/v1/42` is a textual prefix of `acct/v1/420`. A sweep here would
    // delete a stranger's account along with the one that asked to go.
    const kv = new MemoryKV();
    const store = new AccountStore(kv);
    await store.signIn(42, "kompiro", first);
    await store.signIn(420, "someone-else", first);
    expect(await store.purgeAccount(42)).toBe(1);
    expect(await store.get(42)).toBeUndefined();
    expect((await store.get(420))?.login).toBe("someone-else");
  });

  it("reports zero when there was nothing to delete", async () => {
    expect(await new AccountStore(new MemoryKV()).purgeAccount(42)).toBe(0);
  });
});
