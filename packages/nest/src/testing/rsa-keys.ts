/**
 * Real RSA keys for the App-JWT tests.
 *
 * Generated at test time rather than checked in: a private key in the
 * repository is a finding waiting to happen even when it is a toy, and
 * `gitleaks` runs on every push here. Generation costs a few milliseconds and
 * the tests need a key a real verifier will accept, so a fixture would not be
 * cheaper in any way that matters.
 */

export interface TestKeyPair {
  /** PKCS#8 PEM — what Web Crypto imports natively. */
  pkcs8Pem: string;
  /** PKCS#1 PEM — what GitHub actually hands out for an App. */
  pkcs1Pem: string;
  publicKey: CryptoKey;
}

function toPem(der: Uint8Array, label: string): string {
  let binary = "";
  for (const byte of der) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  const wrapped = base64.match(/.{1,64}/g)?.join("\n") ?? base64;
  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----\n`;
}

/**
 * Pull the PKCS#1 body back out of a PKCS#8 DER.
 *
 * The inverse of what `toPkcs8` does, and deliberately hand-rolled here so the
 * round-trip test is not just the production code agreeing with itself. The
 * layout is fixed for RSA: SEQUENCE, version (3 bytes), algorithm identifier
 * (15 bytes), then the OCTET STRING holding the PKCS#1 key.
 */
function extractPkcs1(pkcs8: Uint8Array): Uint8Array {
  let offset = 1; // SEQUENCE tag
  offset += lengthSize(pkcs8, offset);
  offset += 3; // INTEGER 0
  offset += 15; // AlgorithmIdentifier for rsaEncryption
  if (pkcs8[offset] !== 0x04) throw new Error("expected an OCTET STRING in the PKCS#8 body");
  offset += 1;
  const size = lengthSize(pkcs8, offset);
  const length = readLength(pkcs8, offset);
  return pkcs8.slice(offset + size, offset + size + length);
}

function lengthSize(der: Uint8Array, offset: number): number {
  const first = der[offset] as number;
  return first < 0x80 ? 1 : 1 + (first & 0x7f);
}

function readLength(der: Uint8Array, offset: number): number {
  const first = der[offset] as number;
  if (first < 0x80) return first;
  let value = 0;
  for (let index = 1; index <= (first & 0x7f); index += 1) {
    value = value * 256 + (der[offset + index] as number);
  }
  return value;
}

export async function generateTestKeyPair(): Promise<TestKeyPair> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      // 2048 rather than GitHub's 4096: the tests verify structure and
      // signatures, not key strength, and generation time is quadratic.
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  return {
    pkcs8Pem: toPem(pkcs8, "PRIVATE KEY"),
    pkcs1Pem: toPem(extractPkcs1(pkcs8), "RSA PRIVATE KEY"),
    publicKey: pair.publicKey,
  };
}
