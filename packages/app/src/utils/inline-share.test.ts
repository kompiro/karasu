import { describe, it, expect } from "vitest";
import { deflateSync, strToU8 } from "fflate";
import {
  encodeShare,
  decodeShare,
  buildShareUrl,
  readSharedProjectFromHash,
  SHARE_FRAGMENT_KEY,
} from "./inline-share.js";

const SAMPLE = `system Shop {
  service Api { label "API" }
  database Db { label "Postgres" }
  Api -> Db "reads"
}`;
const STYLE = `service { fill: #0a0; }`;

// Reproduces the first-release (PR1) payload: raw deflated .krs, base64url, no JSON.
function legacyEncode(krs: string): string {
  return btoa(String.fromCharCode(...deflateSync(strToU8(krs))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("inline-share encode/decode (bundle)", () => {
  it("round-trips a .krs-only payload", () => {
    expect(decodeShare(encodeShare({ krs: SAMPLE }))).toEqual({ krs: SAMPLE });
  });

  it("round-trips a .krs + .krs.style bundle", () => {
    expect(decodeShare(encodeShare({ krs: SAMPLE, style: STYLE }))).toEqual({
      krs: SAMPLE,
      style: STYLE,
    });
  });

  it("round-trips multi-byte (Japanese) content", () => {
    const krs = `system 店舗 {\n  service 注文 { label "注文サービス 🛒" }\n}`;
    expect(decodeShare(encodeShare({ krs }))).toEqual({ krs });
  });

  it("produces a URL-safe payload (no +, /, or =)", () => {
    const encoded = encodeShare({ krs: SAMPLE.repeat(20) + "πλ∑≈ç√∫" });
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("returns null for corrupt payloads instead of throwing", () => {
    expect(decodeShare("not-a-valid-deflate-stream")).toBeNull();
    expect(decodeShare("")).toBeNull();
  });

  it("decodes a first-release raw-.krs payload (backward compatible)", () => {
    expect(decodeShare(legacyEncode(SAMPLE))).toEqual({ krs: SAMPLE });
  });
});

describe("buildShareUrl", () => {
  it("embeds the payload in the fragment under the s= key", () => {
    const url = buildShareUrl(
      { krs: SAMPLE, style: STYLE },
      { origin: "https://karasu-nest.example", pathname: "/" },
    );
    expect(url.startsWith(`https://karasu-nest.example/#${SHARE_FRAGMENT_KEY}=`)).toBe(true);
    // The content must live in the fragment, never the query (fragment is not
    // sent to the server — statelessness/privacy).
    expect(url).not.toContain("?");
    const hash = url.slice(url.indexOf("#"));
    expect(readSharedProjectFromHash(hash)).toEqual({ payload: { krs: SAMPLE, style: STYLE } });
  });
});

describe("readSharedProjectFromHash", () => {
  it("returns null when there is no share fragment", () => {
    expect(readSharedProjectFromHash("")).toBeNull();
    expect(readSharedProjectFromHash("#krs-system-root")).toBeNull();
    expect(readSharedProjectFromHash("#krs-deploy")).toBeNull();
  });

  it("flags an error for an empty or corrupt share fragment", () => {
    expect(readSharedProjectFromHash("#s=")).toEqual({ error: true });
    expect(readSharedProjectFromHash("#s=@@@not-base64@@@")).toEqual({ error: true });
  });

  it("decodes a valid share fragment with or without leading #", () => {
    const encoded = encodeShare({ krs: SAMPLE });
    expect(readSharedProjectFromHash(`#s=${encoded}`)).toEqual({ payload: { krs: SAMPLE } });
    expect(readSharedProjectFromHash(`s=${encoded}`)).toEqual({ payload: { krs: SAMPLE } });
  });
});
