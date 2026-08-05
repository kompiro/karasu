/**
 * The instance id has to satisfy a rule only the platform enforces.
 *
 * Cloudflare rejects an id outside `[A-Za-z0-9_-]` with
 * `(instance.invalid_id)`. Nothing else notices: the id is a plain string to
 * the type system, and a test double accepts whatever it is given. This is
 * not hypothetical -- the attempt discriminator below is built from a
 * calendar period and a count, and the first version joined them with a `.`,
 * which passed every test here and failed on the first real dispatch.
 */
import { describe, expect, it } from "vitest";
import { generationInstanceId, MAX_INSTANCE_ID_LENGTH } from "./dispatch.js";

const SHA = "a1b2c3d4e5f6".padEnd(40, "0");
const params = { installationId: "12345678", owner: "kompiro", repo: "ddd-library" };

describe("generationInstanceId", () => {
  it("contains only characters the platform accepts", () => {
    // `2026-08.1` is the discriminator shape that actually shipped and broke.
    expect(generationInstanceId(params, SHA, "2026-08.1")).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("still tells attempts apart after sanitising", () => {
    // Sanitising must not collapse two attempts onto one id -- that would
    // reintroduce the un-retryable failure the discriminator exists to fix.
    expect(generationInstanceId(params, SHA, "2026-08.1")).not.toBe(
      generationInstanceId(params, SHA, "2026-08.2"),
    );
  });

  it("is the same for two callers racing the same charge", () => {
    // The other half of the contract: same charge, same id, so the platform
    // rejects the loser rather than starting a second billed run.
    expect(generationInstanceId(params, SHA, "2026-08.1")).toBe(
      generationInstanceId(params, SHA, "2026-08.1"),
    );
  });

  it("differs per installation and per commit", () => {
    const base = generationInstanceId(params, SHA, "2026-08.1");
    expect(base).not.toBe(
      generationInstanceId({ ...params, installationId: "99" }, SHA, "2026-08.1"),
    );
    expect(base).not.toBe(generationInstanceId(params, "f".repeat(40), "2026-08.1"));
  });

  it("stays inside the length ceiling", () => {
    expect(generationInstanceId(params, SHA, "2026-08.1").length).toBeLessThanOrEqual(
      MAX_INSTANCE_ID_LENGTH,
    );
  });

  it("refuses rather than truncating when the shape outgrows the ceiling", () => {
    // Truncating would let two attempts share an id, and the second would
    // silently never run.
    expect(() => generationInstanceId(params, SHA, "x".repeat(80))).toThrowError(/too long/);
  });
});
