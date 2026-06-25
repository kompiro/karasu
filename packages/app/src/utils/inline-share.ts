import { deflateSync, inflateSync, strToU8, strFromU8 } from "fflate";

/**
 * Inline share encoding for karasu-nest (design: docs/design/karasu-nest-hosted-preview.md).
 *
 * A `.krs` source is deflate-compressed and base64url-encoded into the URL
 * *fragment* under the `s=` key (e.g. `https://host/#s=<encoded>`). The fragment
 * is never sent to the server, so sharing stays stateless and private.
 *
 * The key is `s` (not `krs`) to avoid colliding with the drill-down navigation
 * hash, which uses the `#krs-<view>-<node>` form (see useHistoryNavigation).
 */
export const SHARE_FRAGMENT_KEY = "s";

const SHARE_FRAGMENT_PREFIX = `${SHARE_FRAGMENT_KEY}=`;

// Encode bytes in chunks so a large `.krs` does not blow the argument limit of
// String.fromCharCode(...spread).
const BTOA_CHUNK = 0x8000;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BTOA_CHUNK) {
    const chunk = bytes.subarray(i, i + BTOA_CHUNK);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(encoded: string): Uint8Array {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Compress a `.krs` source string into a URL-safe encoded payload. */
export function encodeKrsSource(source: string): string {
  return bytesToBase64Url(deflateSync(strToU8(source)));
}

/**
 * Decode a payload produced by {@link encodeKrsSource}. Returns `null` when the
 * payload is corrupt, truncated, or not a valid deflate stream — callers warn
 * the user and fall back rather than crash.
 */
export function decodeKrsSource(encoded: string): string | null {
  if (encoded === "") return null;
  try {
    return strFromU8(inflateSync(base64UrlToBytes(encoded)));
  } catch {
    return null;
  }
}

/** Build a full shareable URL embedding `source` in the fragment. */
export function buildShareUrl(
  source: string,
  locationLike: { origin: string; pathname: string },
): string {
  return `${locationLike.origin}${locationLike.pathname}#${SHARE_FRAGMENT_PREFIX}${encodeKrsSource(source)}`;
}

/**
 * Read a shared `.krs` source from a location hash (e.g. `#s=<encoded>`).
 *
 * Returns:
 * - `{ source }` when a `#s=` fragment is present and decodes cleanly.
 * - `{ error: true }` when a `#s=` fragment is present but cannot be restored.
 * - `null` when there is no share fragment at all (normal navigation).
 */
export function readSharedKrsFromHash(hash: string): { source: string } | { error: true } | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw.startsWith(SHARE_FRAGMENT_PREFIX)) return null;
  const payload = raw.slice(SHARE_FRAGMENT_PREFIX.length);
  if (payload === "") return { error: true };
  const source = decodeKrsSource(payload);
  return source === null ? { error: true } : { source };
}
