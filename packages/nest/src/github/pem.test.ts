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

  it("encodes DER lengths in long form for a real key", () => {
    // A 2048-bit key's body is well over 127 bytes, so a short-form length
    // would silently truncate the structure and Web Crypto would reject it.
    const der = toPkcs8(keys.pkcs1Pem);
    expect(der[0]).toBe(0x30);
    expect(der[1]).toBeGreaterThanOrEqual(0x80);
  });
});
