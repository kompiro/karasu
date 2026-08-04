import { describe, it, expect } from "vitest";
import {
  bareTargetForLegacyPrefix,
  classifyResolveOutcome,
  decodePathname,
  hasExplicitRef,
  matchBarePermalink,
  redirectCacheControl,
} from "./bare-route.js";
import { FUNCTION_ROUTE_SEGMENTS, SPA_ROUTE_SEGMENTS, STATIC_ROUTE_SEGMENTS } from "../routes.js";

describe("matchBarePermalink", () => {
  it("matches a bare owner/repo (ref omitted → default branch)", () => {
    expect(matchBarePermalink("/kompiro/karasu")).toEqual({ owner: "kompiro", repo: "karasu" });
  });

  it("matches an explicit path and ref", () => {
    expect(matchBarePermalink("/kompiro/karasu/examples/en/hato/index.krs@abc123")).toEqual({
      owner: "kompiro",
      repo: "karasu",
    });
  });

  it("splits the ref on the LAST @, so an @ inside the path does not shift the repo", () => {
    expect(matchBarePermalink("/kompiro/karasu/a@b/c.krs@main")).toEqual({
      owner: "kompiro",
      repo: "karasu",
    });
  });

  it("declines a single segment — nothing to address a repo with", () => {
    expect(matchBarePermalink("/nope")).toBeNull();
    expect(matchBarePermalink("/")).toBeNull();
    expect(matchBarePermalink("")).toBeNull();
  });

  it("tolerates a trailing slash", () => {
    expect(matchBarePermalink("/kompiro/karasu/")).toEqual({ owner: "kompiro", repo: "karasu" });
  });

  it("declines owners GitHub could never issue", () => {
    // Dots and underscores are legal in a repo name but not in an owner, so a
    // root-level static file can never be read as `<owner>/…`.
    expect(matchBarePermalink("/favicon.svg/x")).toBeNull();
    expect(matchBarePermalink("/-lead-hyphen/repo")).toBeNull();
    expect(matchBarePermalink("/trail-/repo")).toBeNull();
    expect(matchBarePermalink("/under_score/repo")).toBeNull();
  });

  it("declines a repo name outside GitHub's charset", () => {
    expect(matchBarePermalink("/kompiro/re po")).toBeNull();
    expect(matchBarePermalink("/kompiro/re:po")).toBeNull();
  });

  // The guard's whole job is to keep the catch-all from swallowing paths that
  // belong to something else — the failure this route could otherwise cause is
  // "a page that worked yesterday now 404s" (TPL-1961).
  describe("declines every reserved top-level segment", () => {
    const reserved = [...SPA_ROUTE_SEGMENTS, ...FUNCTION_ROUTE_SEGMENTS, ...STATIC_ROUTE_SEGMENTS];
    it.each(reserved)("declines /%s/<rest>", (segment) => {
      expect(matchBarePermalink(`/${segment}/anything`)).toBeNull();
      expect(matchBarePermalink(`/${segment}/anything@main`)).toBeNull();
    });
  });

  it("declines the SPA project route, the one live path shaped like owner/repo", () => {
    // Reached on reload / bookmark / share, so it hits the server for real.
    expect(matchBarePermalink("/projects/my-project")).toBeNull();
  });
});

describe("decodePathname", () => {
  it("decodes percent-encoding so %40 is seen as the ref separator", () => {
    // Without this the guard reads `karasu%40abc` as a repo name and the ref is
    // silently lost — the permalink resolves against the default branch instead.
    const decoded = decodePathname("/kompiro/karasu%40abc123");
    expect(decoded).toBe("/kompiro/karasu@abc123");
    expect(hasExplicitRef(decoded!)).toBe(true);
  });

  it("returns null for malformed encoding rather than throwing", () => {
    expect(decodePathname("/%ZZ/bad")).toBeNull();
  });
});

describe("classifyResolveOutcome", () => {
  it("redirects a resolved model", () => {
    expect(classifyResolveOutcome({ status: 200 }, false)).toBe("redirect");
  });

  it("signposts a 404 — the repo was searched and had no .krs", () => {
    // Not a failure: this is where karasu-nest takes over (ADR-2249), so the
    // visitor gets the state and a next step.
    expect(classifyResolveOutcome({ status: 404 }, false)).toBe("signpost");
  });

  it("passes a 400 back to the SPA instead of signposting it", () => {
    // A 400 means the path never parsed as a permalink — `/docs/getting-started/intro`
    // does not end in `.krs`. Signposting it would invent a repository out of a
    // URL and tell the visitor their docs page has no architecture model.
    expect(classifyResolveOutcome({ status: 400 }, false)).toBe("passthrough");
  });

  it.each([400, 404])("shows the error for %i when a ref WAS pinned", (status) => {
    // An explicit @<ref> means the visitor meant a permalink; swallowing that
    // into a friendly page — or into the SPA — hides the diagnosis they need,
    // including when the ref itself is what is malformed.
    expect(classifyResolveOutcome({ status }, true)).toBe("error");
  });

  it.each([500, 502])("never signposts a transient failure (%i)", (status) => {
    // Rendering "no model here" during a GitHub outage would disguise an
    // outage as an absence, and a real permalink would look empty.
    expect(classifyResolveOutcome({ status }, false)).toBe("error");
    expect(classifyResolveOutcome({ status }, true)).toBe("error");
  });
});

describe("redirectCacheControl", () => {
  it("caches a full-SHA redirect immutably", () => {
    expect(redirectCacheControl(true)).toContain("immutable");
  });

  it("lets the edge hold a mutable redirect but makes the browser revalidate", () => {
    const value = redirectCacheControl(false);
    expect(value).toContain("s-maxage=60");
    expect(value).toContain("max-age=0");
    expect(value).not.toContain("immutable");
  });
});

describe("bareTargetForLegacyPrefix", () => {
  it("drops the retired /r/ prefix", () => {
    expect(bareTargetForLegacyPrefix("/r/kompiro/karasu@abc")).toBe("/kompiro/karasu@abc");
    expect(bareTargetForLegacyPrefix("/r/kompiro/karasu/a/b.krs")).toBe("/kompiro/karasu/a/b.krs");
  });

  it("sends a bare /r to the root rather than an empty Location", () => {
    expect(bareTargetForLegacyPrefix("/r")).toBe("/");
    expect(bareTargetForLegacyPrefix("/r/")).toBe("/");
  });

  it("leaves an owner that merely starts with r alone", () => {
    expect(bareTargetForLegacyPrefix("/rails/rails")).toBe("/rails/rails");
  });
});
