import { describe, expect, it } from "vitest";
import { findRelated, formatRelatedAsMarkdown } from "./related.ts";
import type { ParsedTpl } from "./validate.ts";

function makeTpl(
  overrides: Partial<ParsedTpl["fm"]> & Pick<ParsedTpl["fm"], "id" | "title" | "topic">,
): ParsedTpl {
  return {
    file: `${overrides.id}-x.md`,
    body: "",
    fm: {
      status: "active",
      date: "2026-05-10",
      applicable_to: ["x"],
      discovered_from: [{ issue: "#0" }],
      scope: { packages: ["core"] },
      ...overrides,
    },
  };
}

const FIXTURE: ParsedTpl[] = [
  makeTpl({ id: "TPL-20260510-04", title: "continuous input", topic: "app-ui" }),
  makeTpl({ id: "TPL-20260510-08", title: "derived state", topic: "app-ui" }),
  makeTpl({ id: "TPL-20260510-09", title: "event leak", topic: "app-ui" }),
  makeTpl({
    id: "TPL-20260510-05",
    title: "implicit filter",
    topic: "renderer",
    scope: { packages: ["core", "app"] },
  }),
  makeTpl({
    id: "TPL-20260510-06",
    title: "display mode",
    topic: "renderer",
    scope: { packages: ["core"] },
  }),
  makeTpl({ id: "TPL-20260510-99", title: "old", topic: "renderer", status: "deprecated" }),
];

describe("findRelated", () => {
  it("filters by topic", () => {
    const matched = findRelated(FIXTURE, { topic: "app-ui" });
    expect(matched.map((m) => m.fm.id)).toEqual([
      "TPL-20260510-04",
      "TPL-20260510-08",
      "TPL-20260510-09",
    ]);
  });

  it("hides deprecated by default", () => {
    const matched = findRelated(FIXTURE, { topic: "renderer" });
    expect(matched.map((m) => m.fm.id)).toEqual(["TPL-20260510-05", "TPL-20260510-06"]);
  });

  it("includes deprecated when explicitly requested", () => {
    const matched = findRelated(FIXTURE, {
      topic: "renderer",
      includeStatus: ["active", "deprecated"],
    });
    expect(matched.map((m) => m.fm.id)).toEqual([
      "TPL-20260510-05",
      "TPL-20260510-06",
      "TPL-20260510-99",
    ]);
  });

  it("filters by package alongside topic (AND)", () => {
    const matched = findRelated(FIXTURE, { topic: "renderer", pkg: "app" });
    expect(matched.map((m) => m.fm.id)).toEqual(["TPL-20260510-05"]);
  });

  it("filters by package alone (no topic)", () => {
    const matched = findRelated(FIXTURE, { pkg: "app" });
    expect(matched.map((m) => m.fm.id)).toEqual(["TPL-20260510-05"]);
  });

  it("returns empty when nothing matches", () => {
    expect(findRelated(FIXTURE, { topic: "build" })).toEqual([]);
  });
});

describe("formatRelatedAsMarkdown", () => {
  it("produces a markdown bullet list with default repo-root prefix", () => {
    const matched = findRelated(FIXTURE, { topic: "app-ui" });
    const md = formatRelatedAsMarkdown(matched);
    const lines = md.split("\n");
    expect(lines).toEqual([
      "- [TPL-20260510-04](docs/test-perspectives/TPL-20260510-04-x.md) — continuous input",
      "- [TPL-20260510-08](docs/test-perspectives/TPL-20260510-08-x.md) — derived state",
      "- [TPL-20260510-09](docs/test-perspectives/TPL-20260510-09-x.md) — event leak",
    ]);
  });

  it("respects a custom path prefix", () => {
    const matched = findRelated(FIXTURE, { topic: "renderer", pkg: "app" });
    const md = formatRelatedAsMarkdown(matched, { pathPrefix: "../test-perspectives/" });
    expect(md).toBe(
      "- [TPL-20260510-05](../test-perspectives/TPL-20260510-05-x.md) — implicit filter",
    );
  });

  it("returns empty string when no matches", () => {
    expect(formatRelatedAsMarkdown([])).toBe("");
  });
});
