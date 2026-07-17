import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildChecklist,
  collectManualItems,
  triageItem,
  isDevToolingAt,
  isRetired,
  renderMarkdown,
  readAtSources,
  type AtSource,
} from "./generate-qa-checklist.ts";

const src = (file: string, content: string): AtSource => ({ file, content });

describe("isDevToolingAt / isRetired", () => {
  it("excludes only `tool` / `tooling`, keeping product and status-drift types in scope", () => {
    expect(isDevToolingAt("---\ntype: tool\n---\n# AT")).toBe(true);
    expect(isDevToolingAt("---\ntype: tooling\n---\n# AT")).toBe(true);
    expect(isDevToolingAt("---\ntype: product\n---\n# AT")).toBe(false);
    expect(isDevToolingAt("# AT (no frontmatter)")).toBe(false);
    // status-like / sub-category drift values stay in scope (esp. `manual`).
    expect(isDevToolingAt("---\ntype: manual\n---\n# AT")).toBe(false);
    expect(isDevToolingAt("---\ntype: feature\n---\n# AT")).toBe(false);
  });

  it("reads `type` only from the leading frontmatter, not a body `type:` near a `---` rule", () => {
    const md = ["# AT", "", "some prose about a `type: tool` example", "", "---", ""].join("\n");
    expect(isDevToolingAt(md)).toBe(false);
  });

  it("detects a retired banner but not the word 'retired' in prose", () => {
    expect(isRetired("# AT\n\n> **⚠️ Retired (2026-06-16)** — superseded.")).toBe(true);
    expect(isRetired("# AT\n\n> **Retired** — superseded.")).toBe(true);
    expect(isRetired("# AT\n\nThis feature was retired last year.")).toBe(false);
  });
});

describe("collectManualItems — exclusion logic (#2045)", () => {
  it("drops a `- [ ]` bullet that a sibling automation marker already covers", () => {
    const md = [
      "# AT-0099",
      "### AC-1",
      "- [ ] fenced by a sibling marker",
      "> ✅ Automated — `packages/e2e/tests/at-0099.spec.ts` › `case A`",
      "- [ ] genuinely manual",
    ].join("\n");
    const r = collectManualItems(src("docs/acceptance/0099.md", md));
    expect(r.excluded).toBeUndefined();
    expect(r.droppedCovered).toBe(1);
    expect(r.items.map((i) => i.text)).toEqual(["genuinely manual"]);
  });

  it("drops `- [ ]` bullets under a suite-wide marker, but not after the next heading", () => {
    const md = [
      "### AC-1",
      "> ✅ Automated by `packages/e2e/tests/at-0099.spec.ts` (suite-wide)",
      "- [ ] covered A",
      "- [ ] covered B",
      "### AC-2",
      "- [ ] manual after the heading",
    ].join("\n");
    const r = collectManualItems(src("x.md", md));
    expect(r.droppedCovered).toBe(2);
    expect(r.items.map((i) => i.text)).toEqual(["manual after the heading"]);
  });

  it("ignores `- [x]` (already-done) items without counting them as dropped", () => {
    const r = collectManualItems(src("x.md", ["### AC-1", "- [x] done", "- [ ] todo"].join("\n")));
    expect(r.items.map((i) => i.text)).toEqual(["todo"]);
    expect(r.droppedCovered).toBe(0);
  });

  it("excludes an entire dev-tooling AT (tool / tooling)", () => {
    for (const t of ["tool", "tooling"]) {
      const r = collectManualItems(
        src("x.md", ["---", `type: ${t}`, "---", "### AC-1", "- [ ] manual"].join("\n")),
      );
      expect(r.excluded).toBe("tooling");
      expect(r.items).toEqual([]);
    }
  });

  it("keeps a `type: manual` product AT in scope", () => {
    const r = collectManualItems(
      src("x.md", ["---", "type: manual", "---", "### AC-1", "- [ ] eyeball it"].join("\n")),
    );
    expect(r.excluded).toBeUndefined();
    expect(r.items.map((i) => i.text)).toEqual(["eyeball it"]);
  });

  it("excludes an entire retired AT", () => {
    const r = collectManualItems(
      src("x.md", ["# AT", "> **⚠️ Retired (2026-06-16)** — gone.", "- [ ] manual"].join("\n")),
    );
    expect(r.excluded).toBe("retired");
    expect(r.items).toEqual([]);
  });

  it("attaches the nearest section heading and folds continuation lines", () => {
    const md = [
      "### AC-3: rendering",
      "- [ ] the diagram looks right",
      "      across both themes",
    ].join("\n");
    const r = collectManualItems(src("x.md", md));
    expect(r.items[0].section).toBe("AC-3: rendering");
    expect(r.items[0].text).toBe("the diagram looks right across both themes");
  });
});

describe("triageItem", () => {
  it("routes external / LLM items to human-only", () => {
    expect(triageItem("deploy", "Cloudflare Pages にデプロイされる")).toBe("human-only");
    expect(triageItem("chat", "LLM の応答品質を確認")).toBe("human-only");
  });
  it("routes aesthetic-judgment items to agent-sweep", () => {
    expect(triageItem("layout", "Bézier 曲線が自然に見える")).toBe("agent-sweep");
    expect(triageItem("theme", "パネルが読みやすい")).toBe("agent-sweep");
  });
  it("routes deterministic UI operations to spec-target", () => {
    expect(triageItem("nav", "タブをクリックすると切り替わる")).toBe("spec-target");
  });
  it("falls back to needs-review without a strong signal", () => {
    expect(triageItem("misc", "なんらかの確認")).toBe("needs-review");
  });
  it("prefers human-only over a competing aesthetic signal", () => {
    expect(triageItem("share", "Slack で一目で自然に見える")).toBe("human-only");
  });
});

describe("buildChecklist", () => {
  it("aggregates, omits empty groups, and counts exclusions + triage", () => {
    const sources = [
      src("docs/acceptance/0001.md", "### AC-1\n- [ ] タブをクリック"),
      src("docs/acceptance/0002-tool.md", "---\ntype: tool\n---\n- [ ] x"),
      src("docs/acceptance/0003-retired.md", "> **⚠️ Retired (2026-01-01)** — x\n- [ ] y"),
      src("docs/acceptance/0004.md", "- [ ] fenced\n> ✅ Automated — `a.spec.ts`"),
    ];
    const { groups, summary } = buildChecklist(sources);
    expect(summary.atFilesScanned).toBe(4);
    expect(summary.excludedTooling).toBe(1);
    expect(summary.excludedRetired).toBe(1);
    expect(summary.droppedCovered).toBe(1);
    expect(summary.manualItems).toBe(1);
    expect(summary.triage["spec-target"]).toBe(1);
    // 0002 (tool) + 0003 (retired) excluded, 0004 all-covered → only 0001 survives.
    expect(groups.map((g) => g.file)).toEqual(["docs/acceptance/0001.md"]);
  });
});

describe("renderMarkdown", () => {
  it("renders a dated, triaged checklist", () => {
    const result = buildChecklist([
      src("docs/acceptance/0001.md", "### AC-1\n- [ ] タブをクリック"),
    ]);
    const md = renderMarkdown(result, "2026-07-17");
    expect(md).toContain("# QA 手動チェックリスト — 2026-07-17");
    expect(md).toContain("手動確認項目: **1**");
    expect(md).toContain("- [ ] タブをクリック  `<spec-target>`");
    expect(md).toContain("[0001.md](../acceptance/0001.md)");
  });
});

describe("real corpus smoke", () => {
  const atDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "acceptance");
  const { summary, groups } = buildChecklist(readAtSources(atDir));

  it("removes the known contamination classes from the real checklist", () => {
    // AT-1403 is retired (superseded by AT-1575); its items must not appear.
    expect(groups.some((g) => g.file.includes("1403-landing-page"))).toBe(false);
    expect(summary.excludedRetired).toBeGreaterThanOrEqual(1);
    // Non-product ATs (`type: tool` / `tooling`) are excluded (~15 in the corpus).
    expect(summary.excludedTooling).toBeGreaterThanOrEqual(10);
    // The marker-blindness bug: real `- [ ]` items carry a `✅ Automated`
    // marker and must be dropped. If this ever hits 0 the reuse of
    // scanBulletCoverage has silently broken.
    expect(summary.droppedCovered).toBeGreaterThan(0);
    // Sanity: something manual still survives.
    expect(summary.manualItems).toBeGreaterThan(0);
  });
});
