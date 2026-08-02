import { beforeAll, describe, expect, it } from "vitest";
import { generateTestKeyPair, type TestKeyPair } from "../testing/rsa-keys.js";
import { createAppJwt } from "./app-jwt.js";
import { InvalidPrivateKeyError } from "./pem.js";

const NOW = Date.parse("2026-08-02T12:00:00Z");

let keys: TestKeyPair;
beforeAll(async () => {
  keys = await generateTestKeyPair();
});

function decodeSegment(segment: string): Record<string, unknown> {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)));
}

async function verify(jwt: string, publicKey: CryptoKey): Promise<boolean> {
  const [header, payload, signature] = jwt.split(".") as [string, string, string];
  const base64 = signature.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    bytes,
    new TextEncoder().encode(`${header}.${payload}`),
  );
}

describe("createAppJwt", () => {
  it("produces a signature the App's public key verifies", async () => {
    const jwt = await createAppJwt({ appId: "1234", privateKeyPem: keys.pkcs8Pem, now: NOW });
    expect(await verify(jwt, keys.publicKey)).toBe(true);
  });

  it("accepts the PKCS#1 key GitHub actually hands out", async () => {
    // GitHub's App key download is `BEGIN RSA PRIVATE KEY`, which Web Crypto
    // will not import. If this regressed, the failure would be an opaque
    // DataError on the first API call in production.
    const jwt = await createAppJwt({ appId: "1234", privateKeyPem: keys.pkcs1Pem, now: NOW });
    expect(await verify(jwt, keys.publicKey)).toBe(true);
  });

  it("produces the same signature from either encoding of one key", async () => {
    const [fromPkcs8, fromPkcs1] = await Promise.all([
      createAppJwt({ appId: "1234", privateKeyPem: keys.pkcs8Pem, now: NOW }),
      createAppJwt({ appId: "1234", privateKeyPem: keys.pkcs1Pem, now: NOW }),
    ]);
    expect(fromPkcs1).toBe(fromPkcs8);
  });

  it("declares RS256 and carries the App id as the issuer", async () => {
    const jwt = await createAppJwt({ appId: "1234", privateKeyPem: keys.pkcs8Pem, now: NOW });
    const [header, payload] = jwt.split(".") as [string, string];
    expect(decodeSegment(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decodeSegment(payload).iss).toBe("1234");
  });

  it("backdates iat, because GitHub rejects a JWT issued in its future", async () => {
    const jwt = await createAppJwt({ appId: "1234", privateKeyPem: keys.pkcs8Pem, now: NOW });
    const payload = decodeSegment(jwt.split(".")[1] as string);
    expect(payload.iat).toBe(Math.floor(NOW / 1000) - 60);
  });

  it("stays inside GitHub's ten-minute ceiling", async () => {
    const jwt = await createAppJwt({ appId: "1234", privateKeyPem: keys.pkcs8Pem, now: NOW });
    const payload = decodeSegment(jwt.split(".")[1] as string);
    expect((payload.exp as number) - (payload.iat as number)).toBeLessThanOrEqual(600);
    expect((payload.exp as number) - Math.floor(NOW / 1000)).toBeGreaterThan(0);
  });

  it("emits base64url with no padding", async () => {
    const jwt = await createAppJwt({ appId: "1234", privateKeyPem: keys.pkcs8Pem, now: NOW });
    expect(jwt).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it("rejects something that is not a PEM private key", async () => {
    await expect(
      createAppJwt({ appId: "1234", privateKeyPem: "not a key", now: NOW }),
    ).rejects.toThrowError(InvalidPrivateKeyError);
  });

  it("does not cache a failed key import", async () => {
    // A rejected promise left in the cache would poison the isolate for every
    // later request, turning one transient failure into a permanent outage.
    const label = "PRIVATE KEY";
    const bad = `-----BEGIN ${label}-----\nZm9v\n-----END ${label}-----`;
    const attempt = (): Promise<string> =>
      createAppJwt({ appId: "1", privateKeyPem: bad, now: NOW });
    const first = await attempt().catch((cause: unknown) => cause);
    const second = await attempt().catch((cause: unknown) => cause);
    expect(first).toBeInstanceOf(Error);
    // The same failure, not a cached rejection replayed forever.
    expect(second).toBeInstanceOf(Error);
    expect(second).not.toBe(first);
  });
});
