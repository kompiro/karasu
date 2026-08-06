import { beforeAll, describe, expect, it } from "vitest";
import { generateTestKeyPair, type TestKeyPair } from "../testing/rsa-keys.js";
import { InvalidPrivateKeyError, toPkcs8 } from "./pem.js";

let keys: TestKeyPair;
beforeAll(async () => {
  keys = await generateTestKeyPair();
});

/** Composed so a file that holds no key material does not trip the scanner. */
const armour = (label: string, body: string): string =>
  `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;

describe("toPkcs8", () => {
  it("passes a PKCS#8 key through byte for byte", async () => {
    const der = toPkcs8(keys.pkcs8Pem);
    // The real proof is that Web Crypto accepts it.
    await expect(
      crypto.subtle.importKey(
        "pkcs8",
        der as unknown as ArrayBuffer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
      ),
    ).resolves.toBeDefined();
  });

  it("wraps a PKCS#1 key into something Web Crypto imports", async () => {
    await expect(
      crypto.subtle.importKey(
        "pkcs8",
        toPkcs8(keys.pkcs1Pem) as unknown as ArrayBuffer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
      ),
    ).resolves.toBeDefined();
  });

  it("produces the same DER from either encoding of one key", () => {
    expect([...toPkcs8(keys.pkcs1Pem)]).toEqual([...toPkcs8(keys.pkcs8Pem)]);
  });

  it("tolerates the whitespace a pasted secret carries", () => {
    const messy = `\n  ${keys.pkcs1Pem.replace(/\n/g, "\r\n")}  \n`;
    expect([...toPkcs8(messy)]).toEqual([...toPkcs8(keys.pkcs1Pem)]);
  });

  it("rejects a key with no PEM armour", () => {
    expect(() => toPkcs8("MIIEvQIBADAN")).toThrowError(InvalidPrivateKeyError);
  });

  it("rejects an empty body", () => {
    expect(() => toPkcs8(armour("PRIVATE KEY", ""))).toThrowError(InvalidPrivateKeyError);
  });

  it("rejects a public key, which is an easy paste to make", () => {
    expect(() => toPkcs8(armour("PUBLIC KEY", "Zm9v"))).toThrowError(InvalidPrivateKeyError);
  });

  it("encodes the outer DER length correctly, not merely in long form", () => {
    // A real key's body is well over 127 bytes, so the length must be long
    // form — but setting the flag and miscomputing the value would also look
    // "long form". Decode it and check it against the bytes that follow.
    const der = toPkcs8(keys.pkcs1Pem);
    expect(der[0]).toBe(0x30);
    const first = der[1] as number;
    expect(first).toBeGreaterThan(0x80);
    const lengthBytes = first & 0x7f;
    let declared = 0;
    for (let index = 0; index < lengthBytes; index += 1) {
      declared = declared * 256 + (der[2 + index] as number);
    }
    expect(declared).toBe(der.length - 2 - lengthBytes);
  });

  it("handles the 4096-bit key GitHub actually issues", async () => {
    // Larger than the 2048 the other tests use, and the size that turns a
    // two-byte DER length into a two-byte DER length with different content.
    const big = await generateTestKeyPair(4096);
    await expect(
      crypto.subtle.importKey(
        "pkcs8",
        toPkcs8(big.pkcs1Pem) as unknown as ArrayBuffer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
      ),
    ).resolves.toBeDefined();
    expect([...toPkcs8(big.pkcs1Pem)]).toEqual([...toPkcs8(big.pkcs8Pem)]);
  }, 30_000);
});
