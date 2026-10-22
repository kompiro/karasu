import { describe, expect, it } from "vitest";
import { isAllowedExternalUrl, isNodeId, parseWebviewMessage } from "./message-validation.js";

describe("isAllowedExternalUrl", () => {
  it("accepts http / https / mailto", () => {
    expect(isAllowedExternalUrl("https://example.com/page")).toBe(true);
    expect(isAllowedExternalUrl("http://example.com")).toBe(true);
    expect(isAllowedExternalUrl("mailto:dev@example.com")).toBe(true);
  });

  it("rejects file: URLs", () => {
    expect(isAllowedExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedExternalUrl("file://C:/Windows/System32")).toBe(false);
  });

  it("rejects javascript: and other non-web schemes", () => {
    expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("vscode://some/command")).toBe(false);
    expect(isAllowedExternalUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rejects malformed URL strings", () => {
    expect(isAllowedExternalUrl("not a url")).toBe(false);
    expect(isAllowedExternalUrl("://missing-scheme")).toBe(false);
    expect(isAllowedExternalUrl("")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isAllowedExternalUrl(undefined)).toBe(false);
    expect(isAllowedExternalUrl(null)).toBe(false);
    expect(isAllowedExternalUrl(42)).toBe(false);
  });

  // Tripwire: `isAllowedExternalUrl` delegates to core's `isSafeLinkUrl`
  // (single source of truth for the link-scheme allowlist). If core ever
  // broadens `ALLOWED_LINK_SCHEMES` — e.g. adding `vscode:` for permalinks —
  // that change would otherwise silently widen the extension-host
  // `openExternal` gate with no review signal in packages/vscode. This block
  // pins the exact scheme set at the extension trust boundary so such a
  // broadening fails here and forces an explicit decision.
  describe("scheme pinning at the extension trust boundary", () => {
    it("accepts exactly the http / https / mailto schemes", () => {
      expect(isAllowedExternalUrl("http://example.com/")).toBe(true);
      expect(isAllowedExternalUrl("https://example.com/")).toBe(true);
      expect(isAllowedExternalUrl("mailto:dev@example.com")).toBe(true);
    });

    it("rejects every other scheme, even ones plausibly safe elsewhere", () => {
      expect(isAllowedExternalUrl("vscode://kompiro.karasu/open")).toBe(false);
      expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
      expect(isAllowedExternalUrl("file:///etc/passwd")).toBe(false);
      expect(isAllowedExternalUrl("data:text/html,hi")).toBe(false);
      expect(isAllowedExternalUrl("command:workbench.action.terminal.new")).toBe(false);
    });

    it("rejects non-string values", () => {
      expect(isAllowedExternalUrl(undefined)).toBe(false);
      expect(isAllowedExternalUrl(null)).toBe(false);
      expect(isAllowedExternalUrl(42)).toBe(false);
      expect(isAllowedExternalUrl(["https://example.com/"])).toBe(false);
    });
  });
});

describe("isNodeId", () => {
  it("accepts a non-empty string", () => {
    expect(isNodeId("payment-service")).toBe(true);
    expect(isNodeId("a")).toBe(true);
  });

  it("rejects the empty string", () => {
    expect(isNodeId("")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isNodeId(42)).toBe(false);
    expect(isNodeId(null)).toBe(false);
    expect(isNodeId(undefined)).toBe(false);
    expect(isNodeId({ id: "payment-service" })).toBe(false);
  });
});

describe("parseWebviewMessage (#3312, TPL-168)", () => {
  it.each([
    [{ type: "ready" }],
    [{ type: "fs", id: 1, op: "readFile", path: "/p/index.krs" }],
    [{ type: "fs", id: 7, op: "readDir", path: "/p" }],
    [{ type: "fs", id: 9, op: "exists", path: "/p/a.krs.style" }],
    [{ type: "revealNode", nodeId: "Api", filePath: "/p/index.krs" }],
    [{ type: "openExternal", url: "https://example.com/" }],
  ])("accepts %o", (message) => {
    expect(parseWebviewMessage(message)).toEqual(message);
  });

  it("drops fields the protocol does not name", () => {
    expect(
      parseWebviewMessage({ type: "ready", command: "workbench.action.terminal.new" }),
    ).toEqual({ type: "ready" });
    expect(
      parseWebviewMessage({ type: "fs", id: 1, op: "readFile", path: "/p/a.krs", write: "x" }),
    ).toEqual({ type: "fs", id: 1, op: "readFile", path: "/p/a.krs" });
  });

  it.each([
    ["no object", "ready"],
    ["null", null],
    ["an unknown type", { type: "switchView", viewType: "system" }],
    ["a write the preview cannot do yet", { type: "fs", id: 1, op: "writeFile", path: "/p/a.krs" }],
    ["a fractional id", { type: "fs", id: 1.5, op: "readFile", path: "/p/a.krs" }],
    ["a negative id", { type: "fs", id: -1, op: "readFile", path: "/p/a.krs" }],
    ["a string id", { type: "fs", id: "1", op: "readFile", path: "/p/a.krs" }],
    ["a missing path", { type: "fs", id: 1, op: "readFile" }],
    ["an empty node id", { type: "revealNode", nodeId: "", filePath: "/p/a.krs" }],
    ["a non-string file path", { type: "revealNode", nodeId: "Api", filePath: 3 }],
    ["a file: URL", { type: "openExternal", url: "file:///etc/passwd" }],
  ])("refuses %s", (_name, data) => {
    expect(parseWebviewMessage(data)).toBeNull();
  });
});
