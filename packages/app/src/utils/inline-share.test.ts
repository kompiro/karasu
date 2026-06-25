import { describe, it, expect } from "vitest";
import {
  encodeKrsSource,
  decodeKrsSource,
  buildShareUrl,
  readSharedKrsFromHash,
  SHARE_FRAGMENT_KEY,
} from "./inline-share.js";

const SAMPLE = `system Shop {
  service Api { label "API" }
  database Db { label "Postgres" }
  Api -> Db "reads"
}`;

describe("inline-share encode/decode", () => {
  it("round-trips a .krs source", () => {
    expect(decodeKrsSource(encodeKrsSource(SAMPLE))).toBe(SAMPLE);
  });

  it("round-trips multi-byte (Japanese) content", () => {
    const jp = `system 店舗 {\n  service 注文 { label "注文サービス 🛒" }\n}`;
    expect(decodeKrsSource(encodeKrsSource(jp))).toBe(jp);
  });

  it("produces a URL-safe payload (no +, /, or =)", () => {
    // Repeated content compresses well; use varied content to exercise base64.
    const encoded = encodeKrsSource(SAMPLE.repeat(20) + "πλ∑≈ç√∫");
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("returns null for corrupt payloads instead of throwing", () => {
    expect(decodeKrsSource("not-a-valid-deflate-stream")).toBeNull();
    expect(decodeKrsSource("")).toBeNull();
  });
});

describe("buildShareUrl", () => {
  it("embeds the source in the fragment under the s= key", () => {
    const url = buildShareUrl(SAMPLE, {
      origin: "https://karasu-nest.example",
      pathname: "/",
    });
    expect(url.startsWith(`https://karasu-nest.example/#${SHARE_FRAGMENT_KEY}=`)).toBe(true);
    // The source must live in the fragment, never the query (fragment is not
    // sent to the server — statelessness/privacy).
    expect(url).not.toContain("?");
    const hash = url.slice(url.indexOf("#"));
    const restored = readSharedKrsFromHash(hash);
    expect(restored).toEqual({ source: SAMPLE });
  });
});

describe("readSharedKrsFromHash", () => {
  it("returns null when there is no share fragment", () => {
    expect(readSharedKrsFromHash("")).toBeNull();
    expect(readSharedKrsFromHash("#krs-system-root")).toBeNull();
    expect(readSharedKrsFromHash("#krs-deploy")).toBeNull();
  });

  it("flags an error for an empty or corrupt share fragment", () => {
    expect(readSharedKrsFromHash("#s=")).toEqual({ error: true });
    expect(readSharedKrsFromHash("#s=@@@not-base64@@@")).toEqual({ error: true });
  });

  it("decodes a valid share fragment with or without leading #", () => {
    const encoded = encodeKrsSource(SAMPLE);
    expect(readSharedKrsFromHash(`#s=${encoded}`)).toEqual({ source: SAMPLE });
    expect(readSharedKrsFromHash(`s=${encoded}`)).toEqual({ source: SAMPLE });
  });
});
