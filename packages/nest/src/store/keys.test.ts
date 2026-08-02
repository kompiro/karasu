import { describe, expect, it } from "vitest";
import { cacheKey, installationPrefix, InvalidRefError, repoPrefix } from "./keys.js";

const SHA = "a".repeat(40);
const ref = { installationId: 42, owner: "kompiro", repo: "karasu", sha: SHA };

describe("cache keys", () => {
  it("puts the installation outermost so a purge can reach everything it owns", () => {
    expect(cacheKey(ref)).toBe(`krs/v1/42/kompiro/karasu/${SHA}`);
    expect(cacheKey(ref).startsWith(installationPrefix(42))).toBe(true);
    expect(cacheKey(ref).startsWith(repoPrefix(ref))).toBe(true);
  });

  it("lower-cases owner and repo so one purge covers every casing", () => {
    // GitHub names are case-insensitive. Two entries for one repo would mean a
    // repo purge deletes only the casing it was handed.
    expect(cacheKey({ ...ref, owner: "Kompiro", repo: "Karasu" })).toBe(cacheKey(ref));
  });

  it("accepts a SHA in either case", () => {
    expect(cacheKey({ ...ref, sha: SHA.toUpperCase() })).toBe(cacheKey(ref));
  });

  it("does not let one installation's prefix cover another's", () => {
    // `4` must not be a prefix of `42`, or purging installation 4 would delete
    // installation 42's entries. The trailing slash is what prevents it.
    expect(cacheKey({ ...ref, installationId: 42 }).startsWith(installationPrefix(4))).toBe(false);
  });

  it("does not let one repo's prefix cover a longer-named sibling", () => {
    const short = repoPrefix({ installationId: 42, owner: "kompiro", repo: "kara" });
    expect(cacheKey(ref).startsWith(short)).toBe(false);
  });

  it("rejects a segment that could forge a key boundary", () => {
    expect(() => repoPrefix({ installationId: 42, owner: "a/b", repo: "c" })).toThrowError(
      InvalidRefError,
    );
    expect(() => repoPrefix({ installationId: 42, owner: "a", repo: "../../other" })).toThrowError(
      InvalidRefError,
    );
  });

  it("rejects an empty or blank segment", () => {
    expect(() => repoPrefix({ installationId: 42, owner: "", repo: "c" })).toThrowError(
      InvalidRefError,
    );
    expect(() => repoPrefix({ installationId: 42, owner: "  ", repo: "c" })).toThrowError(
      InvalidRefError,
    );
  });

  it("rejects a non-numeric installation id", () => {
    const rejected = ["", "abc", "-1", "1.5", "1/2"].filter((bad) => {
      try {
        installationPrefix(bad);
        return false;
      } catch (cause) {
        return cause instanceof InvalidRefError;
      }
    });
    expect(rejected).toEqual(["", "abc", "-1", "1.5", "1/2"]);
  });

  it("accepts a numeric installation id given as a string", () => {
    expect(installationPrefix("42")).toBe(installationPrefix(42));
  });

  it("rejects anything but a full 40-hex SHA", () => {
    // Short SHAs, branches and `HEAD` are mutable, and a mutable cache key is
    // how a stale diagram outlives the commit it described.
    const mutable = ["", "HEAD", "main", "abc123", SHA.slice(0, 39), `${SHA}a`, "g".repeat(40)];
    const rejected = mutable.filter((bad) => {
      try {
        cacheKey({ ...ref, sha: bad });
        return false;
      } catch (cause) {
        return cause instanceof InvalidRefError;
      }
    });
    expect(rejected).toEqual(mutable);
  });

  it("tolerates surrounding whitespace rather than keying on it", () => {
    expect(cacheKey({ ...ref, owner: " kompiro ", sha: ` ${SHA} ` })).toBe(cacheKey(ref));
  });
});
