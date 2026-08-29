import { describe, expect, it } from "vitest";
import {
  accountKey,
  formatSubmissionId,
  InvalidGalleryRefError,
  newSessionId,
  newSubmissionSlug,
  normaliseAccountId,
  parseSubmissionId,
  sessionKey,
  sessionPrefix,
  submissionKey,
  submissionPrefix,
} from "./gallery-keys.js";

describe("account id normalisation", () => {
  it("accepts the numeric id GitHub gives, as a number or a string", () => {
    expect(normaliseAccountId(42)).toBe("42");
    expect(normaliseAccountId(" 42 ")).toBe("42");
  });

  it("collapses leading zeros, so one account cannot own two prefixes", () => {
    // Two spellings reaching the store from different code paths would put
    // half an account's keys beyond the reach of its own purge.
    expect(normaliseAccountId("042")).toBe(normaliseAccountId("42"));
  });

  it("refuses anything that is not a positive integer", () => {
    for (const bad of ["", "0", "-1", "4.2", "kompiro", "42/43"]) {
      expect(() => normaliseAccountId(bad)).toThrow(InvalidGalleryRefError);
    }
  });
});

describe("key layout", () => {
  it("puts the account outermost in every prefix, so one sweep reaches it all", () => {
    expect(accountKey(42)).toBe("acct/v1/42");
    expect(submissionPrefix(42)).toBe("sub/v1/42/");
    expect(sessionPrefix(42)).toBe("sess/v1/42/");
  });

  it("ends the sweepable prefixes with a slash, so 42 cannot reach 420", () => {
    // The account record is deleted by exact key for exactly this reason
    // (`AccountStore.purgeAccount`); the other two are safe to sweep only
    // because no account id can extend past the trailing slash.
    expect(submissionPrefix(420).startsWith(submissionPrefix(42))).toBe(false);
    expect(sessionPrefix(420).startsWith(sessionPrefix(42))).toBe(false);
    expect(accountKey(420).startsWith(accountKey(42))).toBe(true);
  });

  it("refuses a token that is not one this module could have produced", () => {
    expect(() => submissionKey(42, "short")).toThrow(InvalidGalleryRefError);
    expect(() => submissionKey(42, "ILLEGALCHARS")).toThrow(InvalidGalleryRefError);
    expect(() => sessionKey(42, newSubmissionSlug())).toThrow(InvalidGalleryRefError);
  });
});

describe("token generation", () => {
  it("produces ids of the declared length from the declared alphabet", () => {
    expect(newSubmissionSlug()).toMatch(/^[0-9abcdefghjkmnpqrstvwxyz]{12}$/);
    expect(newSessionId()).toMatch(/^[0-9abcdefghjkmnpqrstvwxyz]{32}$/);
  });

  it("excludes the letters Crockford drops, so a pasted id cannot be misread", () => {
    const sample = Array.from({ length: 200 }, () => newSubmissionSlug()).join("");
    expect(sample).not.toMatch(/[ilou]/);
  });

  it("does not repeat itself", () => {
    const ids = new Set(Array.from({ length: 500 }, () => newSubmissionSlug()));
    expect(ids.size).toBe(500);
  });
});

describe("the public submission id", () => {
  it("round-trips to the two halves the key needs", () => {
    const slug = newSubmissionSlug();
    const id = formatSubmissionId(42, slug);
    expect(id).toBe(`42-${slug}`);
    expect(parseSubmissionId(id)).toEqual({ accountId: "42", slug });
  });

  it("splits on the first hyphen, so the id reads the same from either end", () => {
    const slug = newSubmissionSlug();
    expect(parseSubmissionId(`42-${slug}`).accountId).toBe("42");
    expect(() => parseSubmissionId(`-${slug}`)).toThrow(InvalidGalleryRefError);
    expect(() => parseSubmissionId(`42-${slug}-extra`)).toThrow(InvalidGalleryRefError);
  });

  it("refuses an id that names no account", () => {
    expect(() => parseSubmissionId("kompiro-abcdefghjkmn")).toThrow(InvalidGalleryRefError);
    expect(() => parseSubmissionId("nohyphen")).toThrow(InvalidGalleryRefError);
  });
});
