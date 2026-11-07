import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Scans every E2E spec and fixture for the spec-writing rules of TPL-1171 and
// TPL-1608. Each of them fails silently: an extended timeout and a raw keystroke
// pass today and flake later, and a count of every `.warning-item` passes until a
// new `info` diagnostic lands. Only the timeout rule is general enough to carry a
// TPL guard marker: what the other two catch is narrower than their items, which
// also cover other input methods, other severity checks and core tests.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const SCANNED_ROOTS = ["packages/e2e/tests", "packages/e2e/fixtures"];

/** Playwright's default `expect` timeout; a test below keeps the config from changing it. */
const DEFAULT_EXPECT_TIMEOUT_MS = 5000;

/** Whether a `timeout` value is a plain number that does not extend the default. */
const isExtended = (value: string | undefined): boolean => {
  if (value === undefined || !/^[\d_]+$/.test(value.trim())) return true;
  const ms = Number(value.replaceAll("_", ""));
  return ms === 0 || ms > DEFAULT_EXPECT_TIMEOUT_MS;
};

const RULES = [
  {
    id: "extended-assertion-timeout",
    // `toPass` retries a block and has no default worth keeping. The equality
    // matchers take a value, not options, so a `timeout` there is data.
    pattern:
      /\.(?:to(?!Pass\b|Equal\b|StrictEqual\b|MatchObject\b)[A-Z]\w*|poll|configure)\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*?\btimeout\b\s*(?::\s*([^,}]+))?/g,
    applies: isExtended,
    code: "without-strings",
    message:
      "An auto-retrying assertion passes without a longer timeout, or the wait point is wrong (TPL-1171).",
  },
  {
    id: "raw-keystroke",
    pattern: /\.keyboard\s*\.\s*(?:type|insertText)\s*\(|\.pressSequentially\s*\(/g,
    code: "without-strings",
    message:
      "Fill through a locator or a fixture helper that knows the target is ready; a raw keystroke goes wherever focus is (TPL-1171).",
  },
  {
    id: "unscoped-warning-item",
    pattern: /["'`][^"'`\n]*\.warning-item(?![\w-]|\.warning-item--)/g,
    code: "with-strings",
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

/**
 * Blanks comments, and the contents of strings when `strings` is set, keeping
 * every line number. It reads strings so that a glob such as `"/api/*"` does not
 * open a comment. A `"` or `'` string ends at its line even if unclosed, so a
 * quote inside a regex literal cannot swallow the rest of the file.
 */
function blank(source: string, strings: boolean): string {
  const blanked = (text: string) => text.replace(/[^\n]/g, " ");
  let out = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    let end = i + 1;
    if (ch === '"' || ch === "'" || ch === "`") {
      while (end < source.length && source[end] !== ch) {
        if (ch !== "`" && source[end] === "\n") break;
        end += source[end] === "\\" ? 2 : 1;
      }
      end = Math.min(end + 1, source.length);
      const body = source.slice(i, end);
      out += strings ? blanked(body) : body;
    } else if (ch === "/" && source[i + 1] === "/") {
      const newline = source.indexOf("\n", i);
      end = newline === -1 ? source.length : newline;
      out += blanked(source.slice(i, end));
    } else if (ch === "/" && source[i + 1] === "*") {
      const close = source.indexOf("*/", i + 2);
      end = close === -1 ? source.length : close + 2;
      out += blanked(source.slice(i, end));
    } else {
      out += ch;
    }
    i = end;
  }
  return out;
}

function scanSource(file: string, source: string): Finding[] {
  const views = { "with-strings": blank(source, false), "without-strings": blank(source, true) };
  return RULES.flatMap((rule) => {
    const code = views[rule.code];
    return [...code.matchAll(rule.pattern)]
      .filter((match) => !("applies" in rule) || rule.applies(match[1]))
      .map((match) => ({
        rule: rule.id,
        file,
        line: code.slice(0, match.index).split("\n").length,
      }));
  });
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

  it("does not extend the assertion timeout for the whole suite", () => {
    const config = readFileSync(join(REPO_ROOT, "packages/e2e/playwright.config.ts"), "utf-8");
    expect(blank(config, true)).not.toMatch(/\bexpect\s*:/);
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
      ["a computed timeout", "await expect(a).toBeVisible({ timeout: 2 * 5000 });"],
      ["a shorthand timeout", "await expect(a).toBeVisible({ timeout });"],
      ["no timeout at all", "await expect(a).toBeVisible({ timeout: 0 });"],
      ["two levels of calls", "await expect(a).toHaveText(x(y()), { timeout: 15000 });"],
      ["a long poll", "await expect.poll(() => a(), { timeout: 15000 }).toBe(1);"],
      ["a suite-wide configure", "const e = expect.configure({ timeout: 15000 });"],
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
      ["a poll at the default", "await expect.poll(() => a(), { timeout: 5000 }).toBe(1);"],
      ["an equality matcher's data", "expect(cfg).toEqual({ timeout: 15000 });"],
      ["a timeout in a string", 'await expect(a).toContainText("timeout: 30000");'],
      ["an already scoped compound", 'page.locator(".warning-item.warning-item--warning")'],
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

    it("is not fooled by comment markers inside strings", () => {
      const glob = 'page.route("/api/*", r);\nawait page.keyboard.type("x");\n/** doc */';
      expect(rulesIn(glob)).toEqual(["raw-keystroke"]);
      expect(rulesIn('f("a // b", page.keyboard.type("x"));')).toEqual(["raw-keystroke"]);
      expect(rulesIn('const r = /don\'t/;\nawait page.keyboard.type("x");')).toEqual([
        "raw-keystroke",
      ]);
    });

    it("reports the line of the finding, comments counted", () => {
      expect(scanSource("x.spec.ts", '/* one\ntwo */\nawait page.keyboard.type("x");')).toEqual([
        { rule: "raw-keystroke", file: "x.spec.ts", line: 3 },
      ]);
    });
  });
});
