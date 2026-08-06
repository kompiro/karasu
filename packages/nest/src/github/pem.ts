/**
 * Reading a GitHub App private key in the Workers runtime.
 *
 * The awkward part is not the base64. **GitHub hands out App private keys in
 * PKCS#1**, whose PEM label is `RSA PRIVATE KEY`, and Web Crypto's `importKey`
 * only accepts PKCS#8, labelled `PRIVATE KEY`. There is no `openssl` in a
 * Worker, so the choice is
 * between telling every operator to convert the key by hand before pasting it
 * into `wrangler secret put` — a step that is easy to skip and whose failure
 * mode is an opaque `DataError` at the first API call — and doing the
 * conversion here.
 *
 * The conversion is purely structural: a PKCS#8 `PrivateKeyInfo` is a version
 * integer, an algorithm identifier naming RSA, and the untouched PKCS#1 body
 * in an OCTET STRING. No parsing of the key material is involved.
 */

/** Composed rather than written out, so the secret scanner has nothing to
 * match on in a file that never contains key material. */
const beginLine = (label: string): string => `-----BEGIN ${label}-----`;
const PKCS1_HEADER = beginLine("RSA PRIVATE KEY");
const PKCS8_HEADER = beginLine("PRIVATE KEY");

export class InvalidPrivateKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPrivateKeyError";
  }
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Strip the PEM armour and whitespace, leaving the DER bytes. */
function pemBody(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/, "")
    .replace(/-----END [A-Z ]+-----/, "")
    .replace(/\s+/g, "");
  if (body.length === 0) throw new InvalidPrivateKeyError("the private key is empty");
  try {
    return decodeBase64(body);
  } catch {
    throw new InvalidPrivateKeyError("the private key is not valid base64");
  }
}

/** DER definite-length encoding: short form below 128, long form above. */
function derLength(length: number): number[] {
  if (length < 0x80) return [length];
  const bytes: number[] = [];
  for (let remaining = length; remaining > 0; remaining = Math.floor(remaining / 256)) {
    bytes.unshift(remaining % 256);
  }
  return [0x80 | bytes.length, ...bytes];
}

function derSequence(contents: number[]): number[] {
  return [0x30, ...derLength(contents.length), ...contents];
}

/** `SEQUENCE { OID 1.2.840.113549.1.1.1 (rsaEncryption), NULL }` */
const RSA_ALGORITHM_IDENTIFIER = [
  0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
];

function wrapPkcs1AsPkcs8(pkcs1: Uint8Array): Uint8Array {
  const octetString = [0x04, ...derLength(pkcs1.length), ...pkcs1];
  return new Uint8Array(
    derSequence([
      0x02,
      0x01,
      0x00, // version 0
      ...RSA_ALGORITHM_IDENTIFIER,
      ...octetString,
    ]),
  );
}

/**
 * Turn a PEM private key into the PKCS#8 DER that Web Crypto wants, accepting
 * either format so an operator can paste the key GitHub gave them.
 */
export function toPkcs8(pem: string): Uint8Array {
  const trimmed = pem.trim();
  if (trimmed.includes(PKCS8_HEADER)) return pemBody(trimmed);
  if (trimmed.includes(PKCS1_HEADER)) return wrapPkcs1AsPkcs8(pemBody(trimmed));
  throw new InvalidPrivateKeyError(
    `expected a PEM private key labelled ${PKCS1_HEADER} or ${PKCS8_HEADER}`,
  );
}
