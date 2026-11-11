import { describe, expect, it } from "vitest";
import * as keys from "./gallery-keys.js";
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
  sessionRevocationKey,
  submissionKey,
  submissionPrefix,
  type GalleryKey,
  type GalleryPrefix,
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

  it("keeps revocation state under the session prefix", () => {
    const sessionId = newSessionId();
    expect(sessionRevocationKey(42, sessionId)).toBe(`${sessionKey(42, sessionId)}/revoked`);
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

/**
 * Every builder, held to the same two promises (TPL-2284).
 *
 * The cases above pin the builders that exist. This table is what holds the
 * next one: `KeyBuilder` is every export whose return type is a key or a
 * prefix, and `BUILDERS` has to name each of them with the kind of each
 * parameter, or this file does not compile. Every other export has to be
 * named in `NOT_BUILDERS` with a reason, so nothing is skipped by omission.
 *
 * A kind is a contract, not a label: `KINDS` says which spellings of it must
 * land on one key and which values must be refused. A builder whose parameter
 * does not honour its kind's contract fails below, and a new kind of
 * identifier cannot be declared without writing its contract, which is where
 * "which spellings are the same account?" gets answered, in review.
 */
/** The module's exports as a plain object, so they can be walked by name. */
const EXPORTS = { ...keys };

type Export = keyof typeof EXPORTS;

/** The exports that produce a key or a prefix. Derived, so it cannot lag. */
type KeyBuilder = {
  [K in Export]: (typeof EXPORTS)[K] extends (...args: never[]) => GalleryKey | GalleryPrefix
    ? K
    : never;
}[Export];

type ParamKind = "account" | "slug" | "session";

interface KindContract {
  /** A value the builder must accept. */
  valid: () => string | number;
  /** Spellings of `valid` that must produce the same key as it. */
  sameAs: (valid: string | number) => (string | number)[];
  /**
   * Values that must be refused. Each carries `/` or `-` (the key and public-id
   * separators) or is a spelling the kind does not have, so accepting it would
   * either cross into another key or give one identifier two keys.
   */
  refused: (valid: string | number) => string[];
}

/** Insert `char` in the middle of a token, keeping its length. */
const withChar = (token: string | number, char: string): string => {
  const value = String(token);
  return `${value.slice(0, 5)}${char}${value.slice(6)}`;
};

const token = (make: () => string): KindContract => ({
  valid: make,
  // Ours, so there is one spelling: the one we generated.
  sameAs: (valid) => [valid],
  refused: (valid) => [
    withChar(valid, "/"),
    withChar(valid, "-"),
    String(valid).toUpperCase(),
    `${String(valid)}/`,
  ],
});

const KINDS: Record<ParamKind, KindContract> = {
  account: {
    valid: () => 42,
    sameAs: () => ["42", "042", " 42 ", "0042"],
    refused: () => ["4/2", "4-2", "42/", "-42", "42-", "kompiro"],
  },
  slug: token(newSubmissionSlug),
  session: token(newSessionId),
};

const BUILDERS = {
  accountKey: ["account"],
  submissionPrefix: ["account"],
  submissionKey: ["account", "slug"],
  sessionPrefix: ["account"],
  sessionKey: ["account", "session"],
  sessionRevocationKey: ["account", "session"],
  // Not a key, but it carries the same identifiers into a URL and back.
  formatSubmissionId: ["account", "slug"],
} as const satisfies { [K in KeyBuilder]: readonly ParamKind[] } & Partial<
  Record<Export, readonly ParamKind[]>
>;

const NOT_BUILDERS: Record<Exclude<Export, keyof typeof BUILDERS>, string> = {
  GALLERY_KEY_SPACES: "the registry the builders read their prefixes from",
  InvalidGalleryRefError: "what every builder throws on a refused value",
  normaliseAccountId: "the canonicaliser itself; checked through every builder above",
  newSubmissionSlug: "takes nothing, so it has no identifier to spell two ways",
  newSessionId: "takes nothing, so it has no identifier to spell two ways",
  parseSubmissionId: "reads an id rather than building a key; round-tripped above",
};

describe("every key builder", () => {
  const call = (name: keyof typeof BUILDERS, args: readonly (string | number)[]): string =>
    (EXPORTS[name] as (...values: readonly (string | number)[]) => string)(...args);

  it("is classified, so a new export cannot go unchecked by omission", () => {
    expect(Object.keys(EXPORTS).sort()).toEqual(
      [...Object.keys(BUILDERS), ...Object.keys(NOT_BUILDERS)].sort(),
    );
  });

  for (const [name, kinds] of Object.entries(BUILDERS) as [
    keyof typeof BUILDERS,
    readonly ParamKind[],
  ][]) {
    const valid = (): (string | number)[] => kinds.map((kind) => KINDS[kind].valid());
    const replace = (args: readonly (string | number)[], index: number, value: string | number) =>
      args.map((arg, at) => (at === index ? value : arg));

    it(`${name} declares every parameter it takes`, () => {
      expect(EXPORTS[name].length).toBe(kinds.length);
    });

    it(`${name} gives one identifier one key, however it is spelled`, () => {
      const args = valid();
      const expected = call(name, args);
      kinds.forEach((kind, index) => {
        for (const spelling of KINDS[kind].sameAs(args[index] as string | number)) {
          const respelled = replace(args, index, spelling);
          expect(call(name, respelled), `${name} with ${JSON.stringify(spelling)}`).toBe(expected);
        }
      });
    });

    it(`${name} refuses a separator in any identifier`, () => {
      const args = valid();
      kinds.forEach((kind, index) => {
        for (const bad of KINDS[kind].refused(args[index] as string | number)) {
          expect(() => call(name, replace(args, index, bad)), `${name} with ${bad}`).toThrow(
            InvalidGalleryRefError,
          );
        }
      });
    });
  }
});
