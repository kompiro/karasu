import { deflateSync, inflateSync, strToU8, strFromU8 } from "fflate";

/**
 * Inline share encoding for karasu-nest (design: docs/design/karasu-nest-hosted-preview.md).
 *
 * A share payload — a flattened `.krs` plus its optional merged `.krs.style` —
 * is JSON-serialized, deflate-compressed, and base64url-encoded into the URL
 * *fragment* under the `s=` key (e.g. `https://host/#s=<encoded>`). The fragment
 * is never sent to the server, so sharing stays stateless and private.
 *
 * The key is `s` (not `krs`) to avoid colliding with the drill-down navigation
 * hash, which uses the `#krs-<view>-<node>` form (see useHistoryNavigation).
 */
export const SHARE_FRAGMENT_KEY = "s";

const SHARE_FRAGMENT_PREFIX = `${SHARE_FRAGMENT_KEY}=`;

/** A self-contained shared project: a single `.krs` plus its optional style. */
export interface SharePayload {
  krs: string;
  style?: string;
}

// Encode bytes in chunks so a large payload does not blow the argument limit of
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

function compress(text: string): string {
  return bytesToBase64Url(deflateSync(strToU8(text)));
}

function decompress(encoded: string): string | null {
  if (encoded === "") return null;
  try {
    return strFromU8(inflateSync(base64UrlToBytes(encoded)));
  } catch {
    return null;
  }
}

/** Compress a share payload into a URL-safe encoded string. */
export function encodeShare(payload: SharePayload): string {
  return compress(JSON.stringify(payload));
}

/**
 * Decode an `encodeShare` payload. Returns `null` for corrupt/truncated input.
 *
 * Backward compatible with the first karasu-nest release, whose payload was the
 * raw `.krs` text (not JSON): if the decompressed text is not a share-bundle
 * object, it is treated as a style-less `.krs`.
 */
export function decodeShare(encoded: string): SharePayload | null {
  const text = decompress(encoded);
  if (text === null) return null;
  try {
    const obj: unknown = JSON.parse(text);
    if (obj && typeof obj === "object" && typeof (obj as SharePayload).krs === "string") {
      const { krs, style } = obj as SharePayload;
      return typeof style === "string" ? { krs, style } : { krs };
    }
  } catch {
    // Not JSON → first-release raw-.krs payload; fall through.
  }
  return { krs: text };
}

/** Build a full shareable URL embedding `payload` in the fragment. */
export function buildShareUrl(
  payload: SharePayload,
  locationLike: { origin: string; pathname: string },
): string {
  return `${locationLike.origin}${locationLike.pathname}#${SHARE_FRAGMENT_PREFIX}${encodeShare(payload)}`;
}

/**
 * Read a shared project from a location hash (e.g. `#s=<encoded>`).
 *
 * Returns:
 * - `{ payload }` when a `#s=` fragment is present and decodes cleanly.
 * - `{ error: true }` when a `#s=` fragment is present but cannot be restored.
 * - `null` when there is no share fragment at all (normal navigation).
 */
export function readSharedProjectFromHash(
  hash: string,
): { payload: SharePayload } | { error: true } | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw.startsWith(SHARE_FRAGMENT_PREFIX)) return null;
  const encoded = raw.slice(SHARE_FRAGMENT_PREFIX.length);
  if (encoded === "") return { error: true };
  const payload = decodeShare(encoded);
  return payload === null ? { error: true } : { payload };
}
