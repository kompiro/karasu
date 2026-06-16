import { describe, expect, it } from "vitest";
import { collectAnchors, extractTitle } from "./markdown.ts";
import { rewriteBody, rewriteLinkTarget } from "./rewrite.ts";
import { contentPathOf, routeOf, routeRelative, slugOf } from "./site-map.ts";

const PUBLISHED = new Set([
  "concepts.md",
  "concepts.ja.md",
  "guide/README.md",
  "guide/01-service-team-design.md",
  "guide/01-service-team-design.ja.md",
  "guide/02-onboarding.md",
  "spec/syntax.md",
  "spec/style.md",
  "spec/style.ja.md",
]);

describe("site-map", () => {
  it("maps docs paths to slugs", () => {
    expect(slugOf("concepts.md")).toBe("concepts");
    expect(slugOf("guide/README.md")).toBe("guide");
    expect(slugOf("guide/01-service-team-design.ja.md")).toBe("guide/01-service-team-design");
    expect(slugOf("spec/syntax.md")).toBe("spec/syntax");
  });

  it("maps docs paths to routes (ja prefixed, trailing slash, no leading slash)", () => {
    expect(routeOf("concepts.md")).toBe("concepts/");
    expect(routeOf("guide/README.md")).toBe("guide/");
    expect(routeOf("guide/README.ja.md")).toBe("ja/guide/");
    expect(routeOf("spec/syntax.md")).toBe("spec/syntax/");
    expect(routeOf("guide/01-service-team-design.ja.md")).toBe("ja/guide/01-service-team-design/");
  });

  it("maps docs paths to content-collection paths (ja under ja/, README -> index)", () => {
    expect(contentPathOf("concepts.md")).toBe("concepts.md");
    expect(contentPathOf("guide/README.md")).toBe("guide/index.md");
    expect(contentPathOf("guide/README.ja.md")).toBe("ja/guide/index.md");
    expect(contentPathOf("spec/syntax.ja.md")).toBe("ja/spec/syntax.md");
  });

  it("computes base-agnostic relative routes", () => {
    expect(routeRelative("guide/05-x/", "spec/syntax/")).toBe("../../spec/syntax/");
    expect(routeRelative("ja/guide/01/", "guide/01/")).toBe("../../../guide/01/");
    expect(routeRelative("concepts/", "spec/syntax/")).toBe("../spec/syntax/");
  });
});

describe("rewriteLinkTarget", () => {
  const ctx = { srcDocsRel: "guide/05-communicating-diagrams.md", published: PUBLISHED };

  it("rewrites in-site cross-section links route-relative", () => {
    expect(rewriteLinkTarget("../spec/style.md", ctx)).toBe("../../spec/style/");
  });

  it("preserves anchors on in-site links", () => {
    expect(rewriteLinkTarget("../concepts.md#goals-and-non-goals", ctx)).toBe(
      "../../concepts/#goals-and-non-goals",
    );
  });

  it("rewrites a language-switcher link to the ja locale route", () => {
    const enCtx = { srcDocsRel: "guide/01-service-team-design.md", published: PUBLISHED };
    expect(rewriteLinkTarget("01-service-team-design.ja.md", enCtx)).toBe(
      "../../ja/guide/01-service-team-design/",
    );
  });

  it("rewrites examples/ links to GitHub tree URLs", () => {
    expect(rewriteLinkTarget("../../examples/payment-platform/", ctx)).toBe(
      "https://github.com/kompiro/karasu/tree/main/examples/payment-platform/",
    );
  });

  it("rewrites out-of-site docs/*.md links to GitHub blob URLs", () => {
    const conceptsCtx = { srcDocsRel: "concepts.md", published: PUBLISHED };
    expect(rewriteLinkTarget("./adr/20260323-03-organization-diagram.md", conceptsCtx)).toBe(
      "https://github.com/kompiro/karasu/blob/main/docs/adr/20260323-03-organization-diagram.md",
    );
    // github-actions.md lives under docs/ but isn't published in Phase 1.
    expect(rewriteLinkTarget("../github-actions.md", ctx)).toBe(
      "https://github.com/kompiro/karasu/blob/main/docs/github-actions.md",
    );
  });

  it("leaves external and in-page links untouched", () => {
    expect(rewriteLinkTarget("https://example.com/x", ctx)).toBe("https://example.com/x");
    expect(rewriteLinkTarget("#top", ctx)).toBe("#top");
    expect(rewriteLinkTarget("mailto:a@b.com", ctx)).toBe("mailto:a@b.com");
  });

  it("keeps a query string out of the resolved path", () => {
    expect(rewriteLinkTarget("../spec/style.md?v=1#sec", ctx)).toBe("../../spec/style/?v=1#sec");
    expect(rewriteLinkTarget("../github-actions.md?v=1", ctx)).toBe(
      "https://github.com/kompiro/karasu/blob/main/docs/github-actions.md?v=1",
    );
  });
});

describe("rewriteBody", () => {
  const ctx = { srcDocsRel: "guide/05-communicating-diagrams.md", published: PUBLISHED };

  it("rewrites links in prose but never inside code fences", () => {
    const body = [
      "See [style](../spec/style.md).",
      "",
      "```krs",
      "edge a -> b // not a [link](../spec/style.md)",
      "```",
      "",
      "And [concepts](../concepts.md#goals-and-non-goals).",
    ].join("\n");
    const out = rewriteBody(body, ctx);
    expect(out).toContain("[style](../../spec/style/)");
    expect(out).toContain("// not a [link](../spec/style.md)"); // untouched inside fence
    expect(out).toContain("[concepts](../../concepts/#goals-and-non-goals)");
  });

  it("does not let a shorter inner fence close a longer code block", () => {
    const body = [
      "````krs",
      "```",
      "a [link](../spec/style.md) still inside the block",
      "````",
      "",
      "Out: [style](../spec/style.md).",
    ].join("\n");
    const out = rewriteBody(body, ctx);
    expect(out).toContain("a [link](../spec/style.md) still inside the block"); // untouched
    expect(out).toContain("Out: [style](../../spec/style/).");
  });

  it("rewrites angle-bracketed reference-style definitions", () => {
    const out = rewriteBody('[ref]: <../spec/style.md> "Style"', ctx);
    expect(out).toBe('[ref]: ../../spec/style/ "Style"');
  });
});

describe("markdown helpers", () => {
  it("extracts and strips the first H1 as the title", () => {
    const { title, body } = extractTitle("# Hello World\n\nbody text\n");
    expect(title).toBe("Hello World");
    expect(body).toBe("body text\n");
  });

  it("collects heading slugs and explicit anchors, skipping code fences", () => {
    const body = [
      "## The inverse Conway maneuver — designing teams",
      '<a id="goals-and-non-goals">',
      "",
      "```krs",
      "## not a heading",
      "```",
    ].join("\n");
    const anchors = collectAnchors(body, "Title");
    expect(anchors.has("the-inverse-conway-maneuver--designing-teams")).toBe(true);
    expect(anchors.has("goals-and-non-goals")).toBe(true);
    expect(anchors.has("not-a-heading")).toBe(false);
  });
});
