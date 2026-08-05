/**
 * The instance id has to satisfy a rule only the platform enforces.
 *
 * Cloudflare rejects an id outside `[A-Za-z0-9_-]` with
 * `(instance.invalid_id)`. Nothing else notices: the id is a plain string to
 * the type system, and a test double accepts whatever it is given. Owner and
 * repo names arrive from a URL, and a long repo name walks straight past the
 * length ceiling.
 */
import { describe, expect, it } from "vitest";
import { generationInstanceId, MAX_INSTANCE_ID_LENGTH } from "./dispatch.js";

const SHA = "a1b2c3d4e5f6".padEnd(40, "0");
const params = { installationId: "12345678", owner: "kompiro", repo: "ddd-library" };

describe("generationInstanceId", () => {
  it("contains only characters the platform accepts", () => {
    expect(generationInstanceId(params, SHA)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("sanitises a name that would be rejected", () => {
    // `.` is legal in a GitHub repository name and illegal in an instance id.
    const id = generationInstanceId({ ...params, repo: "docs.karasu.dev" }, SHA);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(id).toContain("docs-karasu-dev");
  });

  it("is the same for two callers racing the same commit", () => {
    // What makes the route's read-then-write race harmless: the loser's
    // create is rejected rather than starting a second billed run.
    expect(generationInstanceId(params, SHA)).toBe(generationInstanceId(params, SHA));
  });

  it("differs per repository and per commit", () => {
    expect(generationInstanceId(params, SHA)).not.toBe(
      generationInstanceId({ ...params, repo: "other" }, SHA),
    );
    expect(generationInstanceId(params, SHA)).not.toBe(
      generationInstanceId(params, "f".repeat(40)),
    );
  });

  it("stays inside the length ceiling for a realistic name", () => {
    expect(generationInstanceId(params, SHA).length).toBeLessThanOrEqual(MAX_INSTANCE_ID_LENGTH);
  });

  it("refuses rather than truncating when a name outgrows the ceiling", () => {
    // Truncating would let two repositories share an id, and the second one
    // would silently never run.
    expect(() => generationInstanceId({ ...params, repo: "x".repeat(80) }, SHA)).toThrowError(
      /too long/,
    );
  });
});
