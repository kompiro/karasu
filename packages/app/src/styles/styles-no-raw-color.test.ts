import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Meta-test — component CSS must reference themed colors through tokens,
 * never as raw literals.
 *
 * TPL-1001: a theme is a global rendering toggle, and every
 * "surface" must honour it. In CSS the surfaces are the component
 * stylesheets; the failure mode is a rule that hard-codes a color and so
 * silently stays dark-only. Routing every color through a token in
 * themes.css is what lets `:root[data-theme="light"]` re-skin the app.
 *
 * Scope: layout.css, base.css and components/*.css. tokens.css /
 * themes.css / index.css are excluded — they are *where* raw colors are
 * legitimately defined.
 */

const STYLES_DIR = fileURLToPath(new URL(".", import.meta.url));

/** Strip `/* ... *\/` comments so issue refs like `#1399` don't false-positive. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Raw color literals: hex, and rgb()/rgba()/hsl()/hsla() functional forms. */
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const FUNCTIONAL = /\b(?:rgba?|hsla?)\(/gi;
/**
 * A `#` inside an inline SVG data-URI is percent-encoded, so a baked-in color
 * slips past HEX. That is not a loophole worth leaving open: the select
 * chevron sat at `%233d5068` and stayed dark-set under the light theme until
 * #2193. Such images belong in themes.css as a token per set.
 */
const ENCODED_HEX = /%23[0-9a-fA-F]{3,8}\b/g;

function scopedFiles(): { name: string; path: string }[] {
  const files = [
    { name: "base.css", path: `${STYLES_DIR}base.css` },
    { name: "layout.css", path: `${STYLES_DIR}layout.css` },
  ];
  const componentsDir = `${STYLES_DIR}components`;
  for (const entry of readdirSync(componentsDir).sort()) {
    if (entry.endsWith(".css")) {
      files.push({ name: `components/${entry}`, path: `${componentsDir}/${entry}` });
    }
  }
  return files;
}

describe("component CSS uses theme tokens, not raw colors", () => {
  for (const file of scopedFiles()) {
    it(`${file.name} has no raw color literals`, () => {
      const css = stripComments(readFileSync(file.path, "utf8"));
      const offenders = [
        ...(css.match(HEX) ?? []),
        ...(css.match(FUNCTIONAL) ?? []),
        ...(css.match(ENCODED_HEX) ?? []),
      ];
      // A non-empty list means a rule hard-coded a color — define a token
      // in themes.css and reference it with var(--…) instead.
      expect(offenders).toEqual([]);
    });
  }

  it("scans every component stylesheet", () => {
    // Guard against the glob silently matching nothing.
    expect(scopedFiles().length).toBeGreaterThanOrEqual(8);
  });
});

/**
 * Rules allowed to dim with `opacity`, each because what it dims is not text
 * a reader has to make out. Everything else expresses dimness as a *token*,
 * whose contrast `theme-contrast.test.ts` can then measure.
 *
 * Matching is on the selector, not on whether the rule also sets `color:` —
 * the rule that prompted this set only `text-decoration` and `opacity`, and
 * inherited its color, so a color-and-opacity test would have missed it.
 */
const DIMMING_ALLOWED = [
  // Diagram glyphs, not chrome text: the SVG's own diff and hover states.
  '.preview-pane svg [data-diff-state="unchanged"]',
  '.preview-pane svg [data-diff-state="removed"]',
  ".preview-container svg:has(.krs-edge--interactive:hover)",
  ".preview-pane--has-errors .preview-container svg",
  // Icon glyphs beside a label that carries the meaning.
  ".diagram-tab-icon",
  ".edit-tab-icon",
  ".breadcrumb-separator",
  ".project-selector::before",
  // Disabled controls — WCAG 1.4.3 exempts inactive components.
  ".context-menu-item:disabled",
  ".context-menu-item[data-disabled]",
  ".toolbar-btn--format:disabled",
];

/** `from` / `to` / `50%` — keyframe steps, not selectors that paint anything. */
const KEYFRAME_STEP = /^(from|to|-?\d+(\.\d+)?%)$/;

describe("text is dimmed with a token, not with opacity", () => {
  // TPL-2193. `theme-contrast.test.ts` measures token values, and opacity
  // never reaches them: it dims what the reader sees while the token stays
  // put, so the fence reports the undimmed ratio and passes. The edge-detail
  // removed row read at 2.95:1 that way while its pair was declared covered.
  for (const file of scopedFiles()) {
    it(`${file.name} dims nothing readable with opacity`, () => {
      const css = stripComments(readFileSync(file.path, "utf8"));
      const offenders: string[] = [];
      for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const opacity = /(?:^|\s)opacity:\s*([\d.]+)/.exec(body);
        if (!opacity || Number(opacity[1]) >= 1) continue;
        const name = selector.trim().replace(/\s+/g, " ");
        if (KEYFRAME_STEP.test(name)) continue;
        // Add the selector above with a reason, or carry the dimness in a
        // token so its contrast is measured rather than assumed.
        if (!DIMMING_ALLOWED.some((allowed) => name.includes(allowed))) offenders.push(name);
      }
      expect(offenders).toEqual([]);
    });
  }

  it("lists no selector that has since disappeared", () => {
    // An allowance outliving its rule is a stale claim, and would silently
    // excuse a future rule that happens to match the same selector.
    const all = scopedFiles()
      .map((f) => stripComments(readFileSync(f.path, "utf8")))
      .join("\n");
    expect(DIMMING_ALLOWED.filter((selector) => !all.includes(selector))).toEqual([]);
  });
});
