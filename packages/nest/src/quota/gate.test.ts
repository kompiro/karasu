import { describe, expect, it } from "vitest";
import { MemoryKV } from "../testing/memory-kv.js";
import { checkQuota } from "./gate.js";
import { QuotaLedger } from "./ledger.js";
import { MONTHLY_REVERSES, nextPeriodStart, quotaPeriod } from "./policy.js";

const AT = new Date("2026-08-02T12:00:00Z");

describe("checkQuota", () => {
  it("allows an installation that has used nothing", async () => {
    const verdict = await checkQuota(new QuotaLedger(new MemoryKV()), "42", AT);
    expect(verdict).toEqual({ allowed: true, used: 0, limit: MONTHLY_REVERSES });
  });

  it("refuses once the month's allowance is gone, and says when it comes back", async () => {
    const ledger = new QuotaLedger(new MemoryKV());
    for (let index = 0; index < MONTHLY_REVERSES; index += 1) await ledger.charge("42", AT);

    const verdict = await checkQuota(ledger, "42", AT);
    expect(verdict).toEqual({
      allowed: false,
      reason: "exhausted",
      used: MONTHLY_REVERSES,
      limit: MONTHLY_REVERSES,
      resetsAt: "2026-09-01T00:00:00.000Z",
    });
  });

  it("checks quota before capacity, so a refusal is one a caller can act on", async () => {
    // "You have used your three" is stable; "come back in five minutes" is
    // not. Telling someone to wait and then refusing them on quota wastes
    // both their wait and our reads.
    const ledger = new QuotaLedger(new MemoryKV());
    for (let index = 0; index < MONTHLY_REVERSES; index += 1) await ledger.charge("42", AT);
    await ledger.takeSlot("someone-elses-run", AT.getTime());

    const verdict = await checkQuota(ledger, "42", AT);
    expect(verdict).toMatchObject({ reason: "exhausted" });
  });

  it("refuses while the deployment is already running one", async () => {
    const ledger = new QuotaLedger(new MemoryKV());
    await ledger.takeSlot("some-run", AT.getTime());

    expect(await checkQuota(ledger, "42", AT)).toEqual({
      allowed: false,
      reason: "busy",
      retryAfterSeconds: 5 * 60,
    });
  });

  it("does not let one installation's usage refuse another", async () => {
    const ledger = new QuotaLedger(new MemoryKV());
    for (let index = 0; index < MONTHLY_REVERSES; index += 1) await ledger.charge("42", AT);
    expect(await checkQuota(ledger, "99", AT)).toMatchObject({ allowed: true });
  });

  it("starts a fresh allowance in the next month", async () => {
    const ledger = new QuotaLedger(new MemoryKV());
    for (let index = 0; index < MONTHLY_REVERSES; index += 1) await ledger.charge("42", AT);
    const nextMonth = new Date("2026-09-01T00:00:01Z");
    expect(await checkQuota(ledger, "42", nextMonth)).toMatchObject({ allowed: true, used: 0 });
  });

  it("honours an overridden limit, so a paid tier needs no second gate", async () => {
    const ledger = new QuotaLedger(new MemoryKV());
    for (let index = 0; index < MONTHLY_REVERSES; index += 1) await ledger.charge("42", AT);
    expect(await checkQuota(ledger, "42", AT, { monthlyReverses: 10 })).toMatchObject({
      allowed: true,
      limit: 10,
    });
  });
});

describe("quotaPeriod / nextPeriodStart", () => {
  it("buckets on UTC calendar months", () => {
    expect([
      quotaPeriod(new Date("2026-08-31T23:59:59Z")),
      quotaPeriod(new Date("2026-09-01T00:00:00Z")),
    ]).toEqual(["2026-08", "2026-09"]);
  });

  it("rolls a December period into the next year", () => {
    expect(nextPeriodStart(new Date("2026-12-15T00:00:00Z"))).toBe("2027-01-01T00:00:00.000Z");
  });
});
