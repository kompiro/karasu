import { describe, it, expect } from "vitest";
import { deflateSync, strToU8 } from "fflate";
import {
  encodeShare,
  decodeShare,
  buildShareUrl,
  buildShareUrls,
  MAX_UNFURL_PAYLOAD,
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

describe("buildShareUrls", () => {
  const loc = { origin: "https://karasu-nest.example", pathname: "/" };

  it("returns a fragment URL (private) and an unfurl URL (query) for a small payload", () => {
    const { fragmentUrl, unfurlUrl } = buildShareUrls({ krs: SAMPLE, style: STYLE }, loc);
    // Private link: payload in the fragment, never in the query.
    expect(fragmentUrl).toContain(`/#${SHARE_FRAGMENT_KEY}=`);
    expect(fragmentUrl).not.toContain("?");
    // Unfurl link: server-visible /s?s= page.
    expect(unfurlUrl).not.toBeNull();
    expect(unfurlUrl!.startsWith(`https://karasu-nest.example/s?${SHARE_FRAGMENT_KEY}=`)).toBe(
      true,
    );
  });

  it("both URLs carry the same encoded payload (single encode)", () => {
    const { fragmentUrl, unfurlUrl } = buildShareUrls({ krs: SAMPLE }, loc);
    const fragEncoded = fragmentUrl.split(`#${SHARE_FRAGMENT_KEY}=`)[1];
    const unfurlEncoded = new URL(unfurlUrl!).searchParams.get(SHARE_FRAGMENT_KEY);
    expect(unfurlEncoded).toBe(fragEncoded);
    expect(decodeShare(fragEncoded)).toEqual({ krs: SAMPLE });
  });

  it("drops the unfurl URL (oversize) but keeps the fragment URL when the payload is too large", () => {
    // Random-ish content resists deflate so the encoded payload exceeds the cap.
    let krs = "system Big {\n";
    for (let i = 0; krs.length < MAX_UNFURL_PAYLOAD * 12; i++) {
      krs += `  service S${i} { label "svc ${i} ${(i * 2654435761) % 1000000} αβγ" }\n`;
    }
    krs += "}";
    const { fragmentUrl, unfurlUrl } = buildShareUrls({ krs }, loc);
    expect(unfurlUrl).toBeNull();
    expect(fragmentUrl).toContain(`/#${SHARE_FRAGMENT_KEY}=`);
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
