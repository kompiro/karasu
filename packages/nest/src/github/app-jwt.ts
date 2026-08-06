/**
 * The App-level JWT: proof that a request comes from the karasu-nest GitHub
 * App, signed with its private key.
 *
 * It authenticates the *App*, not an installation, and the only thing it is
 * used for is exchanging it for an installation token. It is deliberately
 * short-lived and never stored.
 *
 * `now` is injected rather than read from the clock so the expiry arithmetic
 * — the part GitHub actually rejects requests over — is testable.
 */
import { toPkcs8 } from "./pem.js";

/**
 * GitHub rejects a JWT whose `iat` is in its future, and clock skew between a
 * Cloudflare edge and GitHub is real. Backdating by a minute is the documented
 * workaround.
 */
const IAT_BACKDATE_SECONDS = 60;

/** GitHub caps App JWT lifetime at 10 minutes; stay comfortably inside it. */
const LIFETIME_SECONDS = 9 * 60;

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

/**
 * Importing the key is the expensive part, so it is cached per PEM for the
 * life of the isolate. Keyed by the PEM text rather than by a flag, so a
 * rotated secret produces a different entry instead of silently reusing the
 * old key.
 */
const keyCache = new Map<string, Promise<CryptoKey>>();

function importSigningKey(privateKeyPem: string): Promise<CryptoKey> {
  const cached = keyCache.get(privateKeyPem);
  if (cached) return cached;
  const imported = crypto.subtle
    .importKey(
      "pkcs8",
      toPkcs8(privateKeyPem) as unknown as ArrayBuffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    )
    .catch((cause: unknown) => {
      // Do not leave a rejected promise in the cache: one transient failure
      // would otherwise poison the isolate for every later request.
      keyCache.delete(privateKeyPem);
      throw cause;
    });
  keyCache.set(privateKeyPem, imported);
  return imported;
}

export interface AppJwtOptions {
  appId: string;
  privateKeyPem: string;
  /** Milliseconds since the epoch. */
  now: number;
}

export async function createAppJwt({ appId, privateKeyPem, now }: AppJwtOptions): Promise<string> {
  const issuedAt = Math.floor(now / 1000) - IAT_BACKDATE_SECONDS;
  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const payload = encodeJson({ iat: issuedAt, exp: issuedAt + LIFETIME_SECONDS, iss: appId });
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await importSigningKey(privateKeyPem),
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}
