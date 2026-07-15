import { describe, it, expect } from "vitest";
import type { ShareTarget } from "@karasu-tools/core";
import { resolveDeepLinkHash } from "./deep-link-anchor.js";

describe("resolveDeepLinkHash", () => {
  it("returns the ?krs= anchor when present and valid (repo-backed permalink)", () => {
    expect(resolveDeepLinkHash(undefined, "?krs=krs-system-Payment")).toBe("#krs-system-Payment");
  });

  it("accepts a ?krs= value that already carries the leading #", () => {
    expect(resolveDeepLinkHash(undefined, "?krs=%23krs-deploy")).toBe("#krs-deploy");
  });

  it("ignores an invalid ?krs= value (falls back to whole-model)", () => {
    expect(resolveDeepLinkHash(undefined, "?krs=not-an-anchor")).toBeNull();
  });

  it("prefers ?krs= over the inline payload target", () => {
    const target: ShareTarget = { view: "system", node: "Billing" };
    expect(resolveDeepLinkHash(target, "?krs=krs-system-Ordering")).toBe("#krs-system-Ordering");
  });

  it("falls back to the payload target when ?krs= is absent (inline share)", () => {
    const target: ShareTarget = { view: "system", node: "Payment" };
    expect(resolveDeepLinkHash(target, "")).toBe("#krs-system-Payment");
  });

  it("falls back to the payload target when ?krs= is invalid", () => {
    const target: ShareTarget = { view: "org" };
    expect(resolveDeepLinkHash(target, "?krs=garbage")).toBe("#krs-org-root");
  });

  it("returns null when there is neither a ?krs= anchor nor a target", () => {
    expect(resolveDeepLinkHash(undefined, "")).toBeNull();
  });
});
