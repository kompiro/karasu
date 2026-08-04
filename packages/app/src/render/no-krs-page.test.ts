import { describe, it, expect } from "vitest";
import { buildNoKrsPage } from "./no-krs-page.js";

describe("buildNoKrsPage", () => {
  it("answers 200, because a missing model is the page's content and not a failure", () => {
    // The URL is well-formed and the answer ("no model yet, here is how to get
    // one") is what the visitor came for. A 404 would say the address was wrong.
    const page = buildNoKrsPage("kompiro", "karasu");
    expect(page.status).toBe(200);
    expect(page.contentType).toBe("text/html; charset=utf-8");
  });

  it("names the repo it is talking about", () => {
    const { body } = buildNoKrsPage("kompiro", "karasu");
    expect(body).toContain("kompiro/karasu");
    expect(body).toContain("https://github.com/kompiro/karasu");
  });

  it("points at the reverse-engineering guide as the next step", () => {
    // karasu-nest does not exist yet; the BYO route already does, so the
    // signpost must lead somewhere real rather than promising a service.
    const { body } = buildNoKrsPage("kompiro", "karasu");
    expect(body).toContain("docs/guide/reverse-engineering-with-ai.md");
  });

  it("explains how the model becomes reachable at this same URL", () => {
    const { body } = buildNoKrsPage("kompiro", "karasu");
    expect(body).toContain("index.krs");
  });

  it("does not assert that the repository exists", () => {
    // GitHub raw answers "no such repo" and "repo without a .krs" identically,
    // and telling them apart costs an API call ADR-1828 rules out of the hot
    // path. Claiming the repo exists would invent one out of any two-segment URL.
    const { body } = buildNoKrsPage("nope", "deeper");
    expect(body).toContain("no such repository");
  });

  it("asks crawlers not to index it", () => {
    // Every repo without a model would otherwise be an indexable near-duplicate.
    expect(buildNoKrsPage("kompiro", "karasu").body).toContain('name="robots" content="noindex"');
  });

  it("escapes the repo slug it echoes back", () => {
    // The route guard's charset check already blocks these, but the guard is a
    // routing decision, not an output contract — the escaping is what makes the
    // page safe on its own terms (TPL-168).
    const { body } = buildNoKrsPage("o<script>", 'r"epo');
    expect(body).not.toContain("<script>");
    expect(body).toContain("&lt;script&gt;");
    expect(body).toContain("&quot;");
  });

  it("is a standalone page, not the SPA shell", () => {
    // ADR-1801 rejected inlining the SPA shell for the share page for the same
    // reason: it doubles the delivery and caching surface for one static page.
    const { body } = buildNoKrsPage("kompiro", "karasu");
    expect(body).toMatch(/^<!doctype html>/);
    expect(body).not.toContain("/assets/");
  });
});
