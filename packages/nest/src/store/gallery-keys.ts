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

const ACCOUNT_PREFIX = "acct/v1";
const SUBMISSION_PREFIX = "sub/v1";
const SESSION_PREFIX = "sess/v1";

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

export function accountKey(accountId: number | string): string {
  return `${ACCOUNT_PREFIX}/${normaliseAccountId(accountId)}`;
}

/** Every submission one account owns. */
export function submissionPrefix(accountId: number | string): string {
  return `${SUBMISSION_PREFIX}/${normaliseAccountId(accountId)}/`;
}

export function submissionKey(accountId: number | string, slug: string): string {
  return `${submissionPrefix(accountId)}${requireToken(slug, "submission id", SLUG_LENGTH)}`;
}

/** Every session one account holds, so signing out everywhere is a sweep. */
export function sessionPrefix(accountId: number | string): string {
  return `${SESSION_PREFIX}/${normaliseAccountId(accountId)}/`;
}

export function sessionKey(accountId: number | string, sessionId: string): string {
  return `${sessionPrefix(accountId)}${requireToken(sessionId, "session id", SESSION_LENGTH)}`;
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
