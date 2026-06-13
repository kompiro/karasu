import { describe, it, expect } from "vitest";
import { isSafeLinkUrl, parseUrlScheme, ALLOWED_LINK_SCHEMES } from "./link-url.js";

describe("parseUrlScheme", () => {
  it("returns the normalized scheme for absolute URLs", () => {
    expect(parseUrlScheme("https://example.com")).toBe("https:");
    expect(parseUrlScheme("HTTP://example.com")).toBe("http:");
    expect(parseUrlScheme("mailto:a@b.com")).toBe("mailto:");
  });

  it("normalizes case and strips C0/whitespace tricks the browser also ignores", () => {
    expect(parseUrlScheme("JaVaScRiPt:alert(1)")).toBe("javascript:");
    // Leading control chars / whitespace are stripped before the scheme,
    // matching how a browser would interpret the href.
    expect(parseUrlScheme("https://ok.com")).toBe("https:");
    expect(parseUrlScheme("  https://ok.com")).toBe("https:");
  });

  it("returns null for non-absolute / unparseable strings", () => {
    expect(parseUrlScheme("docs/readme.md")).toBeNull();
    expect(parseUrlScheme("//evil.com")).toBeNull();
    expect(parseUrlScheme("")).toBeNull();
  });
});

describe("isSafeLinkUrl", () => {
  it("accepts the allowlisted schemes", () => {
    expect(isSafeLinkUrl("https://example.com")).toBe(true);
    expect(isSafeLinkUrl("http://example.com")).toBe(true);
    expect(isSafeLinkUrl("mailto:team@example.com")).toBe(true);
    expect(isSafeLinkUrl("HTTPS://EXAMPLE.COM")).toBe(true); // case-folded scheme
  });

  it("rejects script-bearing and other schemes", () => {
    expect(isSafeLinkUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeLinkUrl("JaVaScRiPt:alert(1)")).toBe(false);
    expect(isSafeLinkUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeLinkUrl("vbscript:msgbox(1)")).toBe(false);
    // Obfuscation that browsers still treat as javascript:
    expect(isSafeLinkUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects relative and protocol-relative URLs", () => {
    expect(isSafeLinkUrl("docs/readme.md")).toBe(false);
    expect(isSafeLinkUrl("./architecture.md")).toBe(false);
    expect(isSafeLinkUrl("//evil.com")).toBe(false);
  });

  it("only contains the documented schemes", () => {
    expect([...ALLOWED_LINK_SCHEMES].sort()).toEqual(["http:", "https:", "mailto:"]);
  });
});
