/**
 * The key layout for the gallery, and the reason its shape is not negotiable.
 *
 * The generation service made the GitHub App installation the outermost key
 * component so that "uninstall = purge" could be one prefix sweep (`keys.ts`,
 * which this module sits beside until #2590 removes it). The gallery keeps the
 * technique and changes the unit: **an account is what gets purged**, because
 * account deletion is the one operation the console exists to make
 * self-service (#2589).
 *
 *     acct/v1/<account>                    the account record
 *     sub/v1/<account>/<slug>              one submission
 *     sess/v1/<account>/<session>          one session
 *     sess/v1/<account>/<session>/revoked  its revocation marker
 *
 * (The picture, not the authority: `GALLERY_KEY_SPACES` below is the set the
 * code is held to.)
 *
 * All three put the account first, so every key an account produces is
 * reachable from the account id alone. A key that does not start with the
 * account is beyond the reach of `purgeAccount` — which is a data-trust
 * failure, not a tidiness one (TPL-2226).
 *
 * **Reachable is not the same as swept**, and the difference is where the one
 * sharp edge lives. `sub/` and `sess/` end in a slash, so listing that prefix
 * cannot reach a neighbour; they are swept. `acct/v1/42` has no trailing
 * separator and is a textual prefix of `acct/v1/420`, so sweeping it would
 * delete a stranger's account along with the one that asked to go — it is
 * deleted by exact key instead (`accounts.ts` states the same thing at the
 * call site, because that is where someone would be tempted to "tidy" it into
 * a sweep).
 *
 * The **public submission id carries the account**: `<account>-<slug>`. A
 * reader hands us that id and the key follows from it directly, so there is no
 * id-to-account index to keep consistent — and therefore no fourth prefix for
 * the purge to have to know about.
 */

/**
 * How long a key space's records may live, which is a decision per space.
 *
 * `content` is what a submitter manages, and it has **no** TTL: content that
 * vanished on its own would become the support request the console exists to
 * remove (TPL-2587). `credential` is the opposite, and a TTL is **required**:
 * a session written without one is a stolen cookie that never stops working.
 * Neither is a default the other can fall back to, so there is no third value.
 */
export type Retention = "content" | "credential";

export interface KeySpaceDefinition {
  /**
   * Ends in a version, so a layout change can introduce `v2` beside `v1` and
   * sweep the old one by prefix (TPL-2284). The type refuses a prefix
   * without one.
   */
  readonly prefix: `${string}/v${number}`;
  readonly retention: Retention;
}

/**
 * Every key space the gallery writes, as a closed set this module owns.
 *
 * A ledger written as a comment is only as complete as the last person to
 * remember it. TPL-2226 is the record of what that costs: a prefix added in
 * the same PR as one that *was* swept, and left out. So the set is a value, and everything that has to know about a key space is
 * derived from it rather than kept beside it:
 *
 * - the key builders below take their prefix from this table and return a
 *   `GalleryKey` branded with the space, and `KVNamespaceLike` (`env.ts`)
 *   accepts nothing else. A store taking `KVNamespaceLike` that builds
 *   `acct/${id}` by hand, or a key in a space nobody registered, does not
 *   compile (`env.ts` says where that stops);
 * - `put` takes its options from the space's `retention`, so a content key
 *   with a TTL, or a credential key without one, does not compile either;
 * - `GalleryStore.purgeAccount` has to name a store for every space, and its
 *   result has a count for every space, because both are typed as a `Record`
 *   over `GalleryKeySpace`;
 * - `gallery-purge-coverage.test.ts` needs a seeder for every space for the
 *   same reason, the test `MemoryKV` refuses a key outside these prefixes or a
 *   TTL that contradicts the retention, and `nest-retention-policy-sync.test.ts`
 *   reads this literal and requires a row in the data-handling document for
 *   each entry.
 *
 * Adding a space is therefore one line here, and the compiler and those tests
 * then list everything else it needs. That is the point: the work a new prefix
 * creates is not something its author has to know about in advance.
 *
 * The prefixes are the deployed layout and must not change. A new layout is a
 * new version (`acct/v2`) registered beside the old one, never an edit.
 */
export const GALLERY_KEY_SPACES = {
  accounts: { prefix: "acct/v1", retention: "content" },
  submissions: { prefix: "sub/v1", retention: "content" },
  sessions: { prefix: "sess/v1", retention: "credential" },
} as const satisfies Record<string, KeySpaceDefinition>;

export type GalleryKeySpace = keyof typeof GALLERY_KEY_SPACES;

declare const keyBrand: unique symbol;
declare const prefixBrand: unique symbol;

/**
 * A key one of the builders below produced, in space `S`.
 *
 * The brand is the reason a key cannot be spelled anywhere else: a template
 * string is a `string`, and `KVNamespaceLike` does not take one. Every builder
 * goes through `normaliseAccountId`, so "built here" also means "canonical"
 * (TPL-2284). `as GalleryKey` would get past it, and is the thing to refuse in
 * review: it is the one spelling of "I built this key myself".
 */
export type GalleryKey<S extends GalleryKeySpace = GalleryKeySpace> = string & {
  readonly [keyBrand]: S;
};

/** A prefix that sweeps one account's keys in space `S`. Ends in `/`. */
export type GalleryPrefix<S extends GalleryKeySpace = GalleryKeySpace> = string & {
  readonly [prefixBrand]: S;
};

/**
 * The options `put` takes for a key in space `S`, from its retention.
 *
 * Content takes none, so there is nowhere to put an `expirationTtl`; a
 * credential cannot be written without one. Written as `[…] extends […]` so a
 * key whose space is not known exactly falls on the side that demands a TTL.
 */
export type GalleryPutArgs<S extends GalleryKeySpace> = [
  (typeof GALLERY_KEY_SPACES)[S]["retention"],
] extends ["content"]
  ? []
  : [options: { expirationTtl: number }];

/** The only place a string becomes a `GalleryKey`. */
function keyIn<S extends GalleryKeySpace>(space: S, ...segments: string[]): GalleryKey<S> {
  return [GALLERY_KEY_SPACES[space].prefix, ...segments].join("/") as GalleryKey<S>;
}

/** The only place a string becomes a `GalleryPrefix`. */
function prefixIn<S extends GalleryKeySpace>(space: S, accountId: string): GalleryPrefix<S> {
  return `${GALLERY_KEY_SPACES[space].prefix}/${accountId}/` as GalleryPrefix<S>;
}

/** Thrown when a value cannot be turned into a key that round-trips. */
export class InvalidGalleryRefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGalleryRefError";
  }
}

/**
 * The account id, canonicalised.
 *
 * This is GitHub's **numeric user id**, not the login. A login is renamed by
 * its owner at will; the id is not, and a purge scope that could be renamed
 * out from under itself would strand keys. Two spellings of the same id must
 * not produce two prefixes, so leading zeros go — the same argument
 * `normaliseInstallation` makes, for the same reason.
 */
export function normaliseAccountId(accountId: number | string): string {
  const value = String(accountId).trim();
  if (!/^[0-9]+$/.test(value)) {
    throw new InvalidGalleryRefError("account id must be a positive integer");
  }
  const canonical = value.replace(/^0+(?=[0-9])/, "");
  if (canonical === "0") throw new InvalidGalleryRefError("account id must be a positive integer");
  return canonical;
}

/**
 * Crockford's base32 alphabet, minus the letters it excludes for being
 * confusable when read aloud or copied by hand. Submission ids end up in URLs
 * people paste to each other, so that property is worth the four characters.
 *
 * 32 divides 256 exactly, so mapping a random byte with `% 32` is uniform.
 * Picking an alphabet whose length did not divide 256 would bias the low
 * characters, quietly, in a token whose whole job is to be unguessable.
 */
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const TOKEN_SHAPE = /^[0-9abcdefghjkmnpqrstvwxyz]+$/;

/** A random token of `length` characters, 5 bits each. */
function randomToken(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let token = "";
  for (const byte of bytes) token += ALPHABET[byte % 32];
  return token;
}

/**
 * 12 characters, 60 bits.
 *
 * A submission id is not a capability: an unlisted submission is withheld by
 * checking the session, not by being hard to guess. So this length is about
 * collisions rather than secrecy, and 60 bits is far past what a solo-operated
 * gallery will ever hold.
 */
const SLUG_LENGTH = 12;

/**
 * 32 characters, 160 bits.
 *
 * A session id **is** a capability — whoever holds it is the account until it
 * expires — so this one is sized for an attacker rather than for collisions.
 */
const SESSION_LENGTH = 32;

export const newSubmissionSlug = (): string => randomToken(SLUG_LENGTH);
export const newSessionId = (): string => randomToken(SESSION_LENGTH);

/** Reject anything that is not a token this module could have produced. */
function requireToken(value: string, field: string, length: number): string {
  if (value.length !== length || !TOKEN_SHAPE.test(value)) {
    throw new InvalidGalleryRefError(`${field} is not a valid identifier`);
  }
  return value;
}

export function accountKey(accountId: number | string): GalleryKey<"accounts"> {
  return keyIn("accounts", normaliseAccountId(accountId));
}

/** Every submission one account owns. */
export function submissionPrefix(accountId: number | string): GalleryPrefix<"submissions"> {
  return prefixIn("submissions", normaliseAccountId(accountId));
}

export function submissionKey(accountId: number | string, slug: string): GalleryKey<"submissions"> {
  return keyIn(
    "submissions",
    normaliseAccountId(accountId),
    requireToken(slug, "submission id", SLUG_LENGTH),
  );
}

/** Every session one account holds, so signing out everywhere is a sweep. */
export function sessionPrefix(accountId: number | string): GalleryPrefix<"sessions"> {
  return prefixIn("sessions", normaliseAccountId(accountId));
}

export function sessionKey(accountId: number | string, sessionId: string): GalleryKey<"sessions"> {
  return keyIn(
    "sessions",
    normaliseAccountId(accountId),
    requireToken(sessionId, "session id", SESSION_LENGTH),
  );
}

/** Kept through the session's absolute lifetime so a late refresh stays inert. */
export function sessionRevocationKey(
  accountId: number | string,
  sessionId: string,
): GalleryKey<"sessions"> {
  return keyIn(
    "sessions",
    normaliseAccountId(accountId),
    requireToken(sessionId, "session id", SESSION_LENGTH),
    "revoked",
  );
}

/** The public id for a submission: the account, then the slug. */
export function formatSubmissionId(accountId: number | string, slug: string): string {
  return `${normaliseAccountId(accountId)}-${requireToken(slug, "submission id", SLUG_LENGTH)}`;
}

/**
 * Split a public submission id back into the two halves the key needs.
 *
 * Splits on the **first** hyphen: the account half is digits only, so no
 * hyphen can appear in it, and the slug half is checked against the token
 * shape. Splitting on the last hyphen instead would let `1-2-abc…` parse two
 * different ways depending on which end you read from.
 */
export function parseSubmissionId(id: string): { accountId: string; slug: string } {
  const separator = id.indexOf("-");
  if (separator <= 0) throw new InvalidGalleryRefError("submission id is malformed");
  return {
    accountId: normaliseAccountId(id.slice(0, separator)),
    slug: requireToken(id.slice(separator + 1), "submission id", SLUG_LENGTH),
  };
}
