/**
 * `X-Hub-Signature-256` verification.
 *
 * This is the only thing standing between the public internet and a purge, so
 * it is written to make the two classic mistakes impossible rather than
 * merely avoided:
 *
 * - **Comparison is `crypto.subtle.verify`, not string equality.** A `===` on
 *   hex digests leaks the position of the first differing byte, and a forger
 *   who can measure that can walk a valid signature out of the service one
 *   byte at a time. `verify` compares in constant time by construction, so
 *   there is no timing-safe helper to remember to use.
 * - **The signature is checked against the exact bytes received**, never
 *   against a re-serialised parse. `JSON.parse` followed by `JSON.stringify`
 *   changes key order and number formatting, and a body that verifies after a
 *   round-trip is not the body GitHub signed.
 */

const PREFIX = "sha256=";

const keyCache = new Map<string, Promise<CryptoKey>>();

function importKey(secret: string): Promise<CryptoKey> {
  const cached = keyCache.get(secret);
  if (cached) return cached;
  const imported = crypto.subtle
    .importKey(
      "raw",
      new TextEncoder().encode(secret) as unknown as ArrayBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    )
    .catch((cause: unknown) => {
      keyCache.delete(secret);
      throw cause;
    });
  keyCache.set(secret, imported);
  return imported;
}

/** Decode `sha256=<hex>`, or `undefined` if it is not that shape. */
function decodeHeader(header: string | null): Uint8Array | undefined {
  if (header === null || !header.startsWith(PREFIX)) return undefined;
  const hex = header.slice(PREFIX.length);
  // 32 bytes of SHA-256. Length is checked before decoding so a short or
  // over-long value is rejected as malformed rather than compared.
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return undefined;
  const bytes = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Whether `body` was signed with `secret`.
 *
 * `body` must be the raw request text. A missing, malformed or wrong
 * signature all return `false`: the caller has no legitimate use for the
 * distinction, and reporting it would tell a prober which half of the
 * handshake it got wrong.
 */
export async function verifyWebhookSignature(
  secret: string,
  header: string | null,
  body: string,
): Promise<boolean> {
  const signature = decodeHeader(header);
  if (signature === undefined) return false;
  return await crypto.subtle.verify(
    "HMAC",
    await importKey(secret),
    signature as unknown as ArrayBuffer,
    new TextEncoder().encode(body) as unknown as ArrayBuffer,
  );
}
