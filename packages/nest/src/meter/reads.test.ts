import { describe, expect, it } from "vitest";
import { MemoryKV } from "../testing/memory-kv.js";
import { ReadCounter, utcDay } from "./reads.js";

const ref = { installationId: "42", owner: "kompiro", repo: "shop" };
const DAY_ONE = new Date("2026-08-02T23:59:00Z");
const DAY_TWO = new Date("2026-08-03T00:01:00Z");

describe("ReadCounter", () => {
  it("counts reads into a per-day bucket", async () => {
    const counter = new ReadCounter(new MemoryKV());
    await counter.increment(ref, DAY_ONE);
    await counter.increment(ref, DAY_ONE);
    await counter.increment(ref, DAY_TWO);
    expect(await counter.forRepo(ref)).toBe(3);
  });

  it("buckets on UTC days, not on local ones", async () => {
    // Two minutes apart across midnight UTC must land in different buckets, or
    // the write-rate ceiling this bucketing exists to stay under moves with
    // whatever timezone the isolate happens to think it is in.
    const kv = new MemoryKV();
    await new ReadCounter(kv).increment(ref, DAY_ONE);
    await new ReadCounter(kv).increment(ref, DAY_TWO);
    expect((await kv.list({ prefix: "reads/" })).keys.map((key) => key.name)).toEqual([
      "reads/krs/v1/42/kompiro/shop/2026-08-02",
      "reads/krs/v1/42/kompiro/shop/2026-08-03",
    ]);
  });

  it("separates repos and installations", async () => {
    const counter = new ReadCounter(new MemoryKV());
    await counter.increment(ref, DAY_ONE);
    await counter.increment({ ...ref, repo: "other" }, DAY_ONE);
    await counter.increment({ ...ref, installationId: "99" }, DAY_ONE);
    expect([
      await counter.forRepo(ref),
      await counter.totalReads("42"),
      await counter.totalReads(),
    ]).toEqual([1, 2, 3]);
  });

  it("recovers from a bucket that is not a number", async () => {
    // KV holds strings and nothing stops another writer. Starting over at one
    // loses counts; treating "abc" as NaN and propagating it loses the report.
    const kv = new MemoryKV();
    await kv.put("reads/krs/v1/42/kompiro/shop/2026-08-02", "not a number");
    const counter = new ReadCounter(kv);
    await counter.increment(ref, DAY_ONE);
    expect(await counter.forRepo(ref)).toBe(1);
  });

  it("takes read buckets with the rest of an installation", async () => {
    const counter = new ReadCounter(new MemoryKV());
    await counter.increment(ref, DAY_ONE);
    await counter.increment({ ...ref, installationId: "99" }, DAY_ONE);
    expect(await counter.purgeInstallation("42")).toBe(1);
    expect(await counter.totalReads()).toBe(1);
  });

  it("removes one repo's buckets without touching a longer neighbour", async () => {
    const counter = new ReadCounter(new MemoryKV());
    await counter.increment(ref, DAY_ONE);
    await counter.increment({ ...ref, repo: "shopfront" }, DAY_ONE);
    expect(await counter.deleteRepo(ref)).toBe(1);
    expect(await counter.totalReads()).toBe(1);
  });
});

describe("utcDay", () => {
  it("is the ISO date, so buckets sort chronologically as strings", () => {
    expect([utcDay(DAY_ONE), utcDay(DAY_TWO)]).toEqual(["2026-08-02", "2026-08-03"]);
  });
});
