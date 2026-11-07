import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Fences the spec-writing rules of TPL-1171 and TPL-1608 across every E2E spec,
// not only the specs that once broke them. Each of them fails silently: an
// extended timeout and a raw keystroke pass today and flake later, and a count
// of every `.warning-item` passes until a new `info` diagnostic lands. Comments
// are stripped first, because specs explain these rules by naming them.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const SCANNED_ROOTS = ["packages/e2e/tests", "packages/e2e/fixtures"];

/** Playwright's default `expect` timeout; `playwright.config.ts` does not change it. */
const DEFAULT_EXPECT_TIMEOUT_MS = 5000;

const RULES = [
  {
    id: "extended-assertion-timeout",
    // `toPass` is excluded: it retries a block, and has no default worth keeping.
    // A shorter timeout is allowed: `replaceEditorContent` uses one inside `toPass`.
    pattern: /\.to(?!Pass\b)[A-Z]\w*\((?:[^()]|\([^()]*\))*?\btimeout\s*:\s*([^\s,}]+)/g,
    applies: (value: string | undefined) =>
      !(Number(value?.replaceAll("_", "")) <= DEFAULT_EXPECT_TIMEOUT_MS),
    message:
      "An auto-retrying assertion passes without a longer timeout, or the wait point is wrong (TPL-1171).",
  },
  {
    id: "raw-keystroke",
    pattern: /\.keyboard\s*\.\s*(?:type|insertText)\s*\(|\.pressSequentially\s*\(/g,
    message:
      "Fill through a locator or a fixture helper that knows the target is ready; a raw keystroke goes wherever focus is (TPL-1171).",
  },
  {
    id: "unscoped-warning-item",
    pattern: /["'`][^"'`\n]*\.warning-item(?![\w-])/g,
    message:
      "Scope to `.warning-item--warning`: `info` items share the class and are an open set (TPL-1608).",
  },
] as const;

type RuleId = (typeof RULES)[number]["id"];

interface Finding {
  rule: RuleId;
  file: string;
  line: number;
}

/** Blanks comments, keeping line numbers. A `//` inside a URL string is left alone. */
function stripComments(source: string): string {
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(
      /(^|[\s;{}(),])\/\/[^\n]*/g,
      (match, lead: string) => lead + blank(match.slice(lead.length)),
    );
}

function scanSource(file: string, source: string): Finding[] {
  const code = stripComments(source);
  return RULES.flatMap((rule) =>
    [...code.matchAll(rule.pattern)]
      .filter((match) => !("applies" in rule) || rule.applies(match[1]))
      .map((match) => ({
        rule: rule.id,
        file,
        line: code.slice(0, match.index).split("\n").length,
      })),
  );
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("E2E spec conventions (TPL-1171, TPL-1608)", () => {
  it("the scanned roots hold specs and fixtures", () => {
    // A renamed directory would otherwise turn this guard into a silent pass (TPL-2804).
    const empty = SCANNED_ROOTS.filter((root) => walk(join(REPO_ROOT, root)).length === 0);
    expect(empty).toEqual([]);
  });

  it("no spec or fixture breaks a rule", () => {
    const findings = SCANNED_ROOTS.flatMap((root) => walk(join(REPO_ROOT, root))).flatMap((path) =>
      scanSource(relative(REPO_ROOT, path), readFileSync(path, "utf-8")),
    );
    const messages = new Map<RuleId, string>(RULES.map((rule) => [rule.id, rule.message]));
    expect(findings.map((f) => `${f.file}:${f.line} ${f.rule}: ${messages.get(f.rule)}`)).toEqual(
      [],
    );
  });

  describe("what each rule catches", () => {
    const rulesIn = (source: string) => scanSource("x.spec.ts", source).map((f) => f.rule);

    it.each([
      ["a timeout on a state assertion", "await expect(a).toBeAttached({ timeout: 15000 });"],
      ["a timeout after a count", "await expect(a).toHaveCount(0, { timeout: 10_000 });"],
      ["a timeout it cannot read", "await expect(a).toBeVisible({ timeout: LONG });"],
      ["a timeout on a negated assertion", "await expect(a).not.toBeVisible({ timeout: 6000 });"],
      [
        "a timeout on its own line",
        "await expect(a).toHaveText(\n  x(),\n  { timeout: 6000 },\n);",
      ],
    ])("flags %s", (_name, source) => {
      expect(rulesIn(source)).toEqual(["extended-assertion-timeout"]);
    });

    it.each([
      ["keyboard.type", 'await page.keyboard.type("x");'],
      ["keyboard.insertText", 'await page.keyboard.insertText("x");'],
      ["pressSequentially", 'await input.pressSequentially("x");'],
    ])("flags %s", (_name, source) => {
      expect(rulesIn(source)).toEqual(["raw-keystroke"]);
    });

    it.each([
      ["a bare class", 'panel.locator(".warning-item")'],
      ["a class in a longer selector", 'page.locator(".warning-panel .warning-item")'],
      ["a template literal", "page.locator(`.warning-item`)"],
    ])("flags %s", (_name, source) => {
      expect(rulesIn(source)).toEqual(["unscoped-warning-item"]);
    });

    it.each([
      ["a poll's own timeout", "await expect.poll(() => a(), { timeout: 5000 }).toBe(1);"],
      ["toPass", "await expect(async () => {}).toPass({ timeout: 10_000 });"],
      ["a shorter timeout", "await expect(a).toContainText(b, { timeout: 1000 });"],
      ["a plain assertion", "await expect(a).toBeVisible();"],
      ["keyboard.press", 'await page.keyboard.press("Enter");'],
      ["a scoped warning", 'panel.locator(".warning-item--warning")'],
      ["an info warning", 'page.locator(".warning-item--info")'],
      [
        "a line comment",
        '// Counting all `.warning-item` would couple this\nawait page.keyboard.press("A");',
      ],
      ["a block comment", "/* `.warning-item` and keyboard.type( */\nconst a = 1;"],
    ])("leaves %s alone", (_name, source) => {
      expect(rulesIn(source)).toEqual([]);
    });

    it("reports the line of the finding, comments counted", () => {
      expect(scanSource("x.spec.ts", '/* one\ntwo */\nawait page.keyboard.type("x");')).toEqual([
        { rule: "raw-keystroke", file: "x.spec.ts", line: 3 },
      ]);
    });
  });
});
