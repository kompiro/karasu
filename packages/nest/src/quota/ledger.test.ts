import { describe, expect, it } from "vitest";
import { MemoryKV } from "../testing/memory-kv.js";
import { QuotaLedger } from "./ledger.js";

const AT = new Date("2026-08-02T12:00:00Z");
const NOW = AT.getTime();

describe("QuotaLedger", () => {
  describe("the monthly counter", () => {
    it("counts charges within a month and separates months", async () => {
      const ledger = new QuotaLedger(new MemoryKV());
      await ledger.charge("42", AT);
      await ledger.charge("42", new Date("2026-08-28T00:00:00Z"));
      await ledger.charge("42", new Date("2026-09-01T00:00:00Z"));

      expect([
        await ledger.used("42", AT),
        await ledger.used("42", new Date("2026-09-15T00:00:00Z")),
      ]).toEqual([2, 1]);
    });

    it("folds a zero-padded installation id onto the same counter", async () => {
      // TPL-2284: two spellings of one id must not buy two quotas.
      const ledger = new QuotaLedger(new MemoryKV());
      await ledger.charge("042", AT);
      expect(await ledger.used(42, AT)).toBe(1);
    });

    it("refunds a dispatch that never happened", async () => {
      const ledger = new QuotaLedger(new MemoryKV());
      await ledger.charge("42", AT);
      await ledger.refund("42", AT);
      expect(await ledger.used("42", AT)).toBe(0);
    });

    it("does not refund below zero", async () => {
      const ledger = new QuotaLedger(new MemoryKV());
      await ledger.refund("42", AT);
      expect(await ledger.used("42", AT)).toBe(0);
    });

    it("recovers from a counter that is not a number", async () => {
      const kv = new MemoryKV();
      await kv.put("quota/krs/v1/42/2026-08", "not a number");
      const ledger = new QuotaLedger(kv);
      expect(await ledger.used("42", AT)).toBe(0);
      expect(await ledger.charge("42", AT)).toBe(1);
    });
  });

  describe("the in-flight counter", () => {
    it("counts a taken slot and stops counting a released one", async () => {
      const ledger = new QuotaLedger(new MemoryKV());
      await ledger.takeSlot("42", "run-a", NOW);
      expect(await ledger.inFlight(NOW)).toBe(1);
      await ledger.releaseSlot("42", "run-a");
      expect(await ledger.inFlight(NOW)).toBe(0);
    });

    it("is idempotent for the same instance, so a retry takes no second slot", async () => {
      const ledger = new QuotaLedger(new MemoryKV());
      await ledger.takeSlot("42", "run-a", NOW);
      await ledger.takeSlot("42", "run-a", NOW);
      expect(await ledger.inFlight(NOW)).toBe(1);
    });

    it("ignores a slot whose holder is presumed dead", async () => {
      // A run killed by the platform never reaches its `finally`. Without an
      // expiry, one such death wedges the whole deployment.
      const ledger = new QuotaLedger(new MemoryKV());
      await ledger.takeSlot("42", "abandoned", NOW);
      const muchLater = NOW + 2 * 60 * 60 * 1000;
      expect(await ledger.inFlight(muchLater)).toBe(0);
    });

    it("survives releasing a slot that is already gone", async () => {
      const ledger = new QuotaLedger(new MemoryKV());
      await expect(ledger.releaseSlot("42", "never-taken")).resolves.toBeUndefined();
    });

    it("reads slots from list metadata, not one fetch per slot", async () => {
      // This runs on the accept path of every generation request; a
      // subrequest per slot would put a ceiling on the accept path itself.
      const kv = new MemoryKV();
      const ledger = new QuotaLedger(kv);
      await ledger.takeSlot("42", "run-a", NOW);
      const before = kv.puts.length;
      await ledger.inFlight(NOW);
      expect(kv.puts.length).toBe(before);
      expect((await kv.list({ prefix: "busy/" })).keys[0]?.metadata).toEqual({
        expiresAt: NOW + 90 * 60 * 1000,
      });
    });
  });

  describe("purge", () => {
    it("takes an installation's counters and its slots with the rest of it", async () => {
      // A slot expires within 90 minutes on its own, but "it goes away
      // eventually" is not what ADR-1990 decision 6 promises, and the key
      // carries the owner and repo names (TPL-2226).
      const ledger = new QuotaLedger(new MemoryKV());
      await ledger.charge("42", AT);
      await ledger.charge("42", new Date("2026-09-01T00:00:00Z"));
      await ledger.takeSlot("42", "42-kompiro-shop-abc", NOW);
      await ledger.charge("99", AT);

      expect(await ledger.purgeInstallation("42")).toBe(3);
      expect([await ledger.used("42", AT), await ledger.used("99", AT)]).toEqual([0, 1]);
      expect(await ledger.inFlight(NOW)).toBe(0);
    });

    it("does not let installation 4 sweep installation 42", async () => {
      const ledger = new QuotaLedger(new MemoryKV());
      await ledger.charge("4", AT);
      await ledger.charge("42", AT);
      expect(await ledger.purgeInstallation("4")).toBe(1);
      expect(await ledger.used("42", AT)).toBe(1);
    });
  });
});
