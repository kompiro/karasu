import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { contrastRatio, WCAG_AA_LARGE_TEXT, WCAG_AA_NORMAL_TEXT } from "@karasu-tools/core";
import { describe, expect, it } from "vitest";

/**
 * Meta-test — every token that paints text must clear WCAG AA on every
 * opaque surface it can be painted on, in **both** theme sets.
 *
 * TPL-2193. `styles-no-raw-color.test.ts` proves a color is themeable;
 * this proves the themed value is legible. The failure mode it fences is
 * a palette tuned by eye against one background: the light set was tuned
 * against white, so `--text-muted` measured 4.12:1 on `--bg-raised` but
 * 3.51:1 on `--bg-void`, and the dark set's muted sat at 1.78:1 on
 * `--bg-overlay` (#2193). Neither is visible in a diff review.
 *
 * Sibling of `packages/core/src/builtins/default-style-contrast.test.ts`,
 * which fences text drawn onto the diagram canvas. Same `contrastRatio()`,
 * so the app chrome and the diagram cannot disagree about what passes.
 */

const THEMES_CSS = fileURLToPath(new URL("themes.css", import.meta.url));

/**
 * Opaque surfaces text is painted on. Translucent chrome (`--warning-bg`,
 * `--accent-dim`, `--diff-banner-bg`) is *not* here: its effective background
 * is the tint composited over whichever of these it spans, which lowers the
 * ratio — `--accent` measured 4.30:1 on the security notice that way. Those
 * pairs are tracked in #2461.
 *
 * `--bg-selected` is absent for a different reason: every rule that sets it
 * also sets `--text-primary`, and the only other thing inheriting there is an
 * icon glyph — checked below at the 3:1 non-text minimum.
 */
const SURFACES = ["bg-void", "bg-base", "bg-surface", "bg-raised", "bg-overlay", "bg-elevated"];

/** Backgrounds deliberately outside `SURFACES` — see above. */
const NON_SURFACE_BG = ["bg-selected"];

/**
 * Tokens whose role is text. `--accent` / `--accent-hover` / `--feather` /
 * `--success` are absent by role, not by exemption: they paint fills, borders
 * and glows, which answer to the 3:1 non-text minimum. After #2193 the only
 * `color:` use left on `--accent` is `.toolbar-btn--apply-patch`, on an opaque
 * `--bg-raised` (5.17:1 light / 5.17:1 dark).
 */
const TEXT_TOKENS = [
  "text-primary",
  "text-secondary",
  "text-tertiary",
  "text-muted",
  "text-link",
  "text-link-hover",
  "nav-btn-text",
  "error",
  "warning",
  "info",
];

/**
 * `--text-*` tokens that are not chrome text. `--text-on-accent` is painted on
 * an accent-colored background rather than a surface, and that pairing misses
 * AA in dark today (#2461) — it is named here so the drift guard below stays
 * a complete accounting rather than a silent omission.
 */
const NON_CHROME_TEXT = ["text-on-accent"];

/** Text that carries its own background rather than sitting on the chrome. */
const SELF_BACKED_PAIRS: [string, string][] = [
  ["export-error-text", "export-error-bg"],
  ["opfs-banner-text", "opfs-banner-bg"],
];

/** Non-text glyphs, which answer to the 3:1 minimum (WCAG 1.4.11). */
const GLYPH_PAIRS: [string, string][] = [
  // File-tree / outline icons inherit `--text-muted` inside a selected row.
  ["text-muted", "bg-selected"],
];

type TokenSet = Map<string, string>;

/**
 * Split themes.css into its two token sets. The dark set is bare `:root`;
 * the light set overrides it under `:root[data-theme="light"]`, so a token
 * the light block does not redefine keeps its dark value — resolve exactly
 * that way rather than assuming both blocks are complete.
 */
function readThemeSets(): { dark: TokenSet; light: TokenSet } {
  const css = readFileSync(THEMES_CSS, "utf8");
  const block = (selector: string): TokenSet => {
    const start = css.indexOf(selector);
    expect(start, `${selector} block is present`).toBeGreaterThanOrEqual(0);
    const body = css.slice(start, css.indexOf("\n}", start));
    const tokens: TokenSet = new Map();
    for (const [, name, value] of body.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)) {
      tokens.set(name, value.trim());
    }
    return tokens;
  };
  const dark = block(":root {");
  const light = new Map([...dark, ...block(':root[data-theme="light"] {')]);
  return { dark, light };
}

/**
 * Every `#RRGGBB` in a token value — a gradient contributes each of its stops.
 * A stop written any other way (`rgb()`, `#abc`, a named color) would be
 * skipped rather than measured, so callers assert `hasOnlyHexColors` too and
 * the pair fails loudly instead of going half-checked.
 */
function hexStops(value: string): string[] {
  return value.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
}

/** True when every color in `value` is a plain `#RRGGBB`. */
function hasOnlyHexColors(value: string): boolean {
  return !/\b(?:rgba?|hsla?|color-mix)\(/i.test(value) && !/#[0-9a-fA-F]{3,4}\b/.test(value);
}

function ratio(fg: string, bg: string): number {
  const r = contrastRatio(fg, bg);
  // undefined means a value stopped being a plain 6-digit hex — the pair went
  // unchecked rather than failing, so surface it as a failure of its own.
  expect(r, `${fg} / ${bg} are both #RRGGBB`).toBeDefined();
  return r as number;
}

const sets = readThemeSets();

describe("themed text tokens meet WCAG AA on every surface they land on", () => {
  for (const setName of ["dark", "light"] as const) {
    const tokens = sets[setName];
    describe(`${setName} set`, () => {
      for (const token of TEXT_TOKENS) {
        it(`--${token} clears AA on every opaque surface`, () => {
          const fg = tokens.get(token);
          expect(fg, `--${token} is defined in the ${setName} set`).toBeDefined();
          for (const surface of SURFACES) {
            const bg = tokens.get(surface);
            expect(bg, `--${surface} is defined in the ${setName} set`).toBeDefined();
            expect(
              ratio(fg as string, bg as string),
              `--${token} on --${surface} (${setName})`,
            ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
          }
        });
      }

      for (const [fgToken, bgToken] of SELF_BACKED_PAIRS) {
        it(`--${fgToken} clears AA on --${bgToken}`, () => {
          const fg = tokens.get(fgToken);
          const bgValue = tokens.get(bgToken) ?? "";
          const stops = hexStops(bgValue);
          expect(fg, `--${fgToken} is defined`).toBeDefined();
          expect(stops.length, `--${bgToken} has at least one hex stop`).toBeGreaterThan(0);
          expect(
            hasOnlyHexColors(bgValue),
            `--${bgToken} is all #RRGGBB, so no stop goes unmeasured`,
          ).toBe(true);
          for (const stop of stops) {
            expect(
              ratio(fg as string, stop),
              `--${fgToken} on --${bgToken} stop ${stop} (${setName})`,
            ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
          }
        });
      }

      for (const [fgToken, bgToken] of GLYPH_PAIRS) {
        it(`--${fgToken} clears the non-text minimum on --${bgToken}`, () => {
          const fg = tokens.get(fgToken);
          const bg = tokens.get(bgToken);
          expect(fg, `--${fgToken} is defined`).toBeDefined();
          expect(bg, `--${bgToken} is defined`).toBeDefined();
          expect(
            ratio(fg as string, bg as string),
            `--${fgToken} on --${bgToken} (${setName})`,
          ).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT);
        });
      }

      it("bakes the current --text-muted into the select chevron", () => {
        // A data-URI cannot read a var(), so the chevron carries a copy of the
        // muted color. A copy drifts: this is the same failure #2193 fixed,
        // one level up, so pin the copy to its source.
        const chevron = tokens.get("select-chevron") ?? "";
        const baked = /%23([0-9a-fA-F]{6})\b/.exec(chevron);
        expect(baked, "--select-chevron bakes a %23RRGGBB stroke").not.toBeNull();
        expect((baked as RegExpExecArray)[1].toLowerCase()).toBe(
          (tokens.get("text-muted") as string).replace("#", "").toLowerCase(),
        );
      });

      it("checks every --text-* and --bg-* token this set defines", () => {
        // The lists above are hand-maintained, so a token added later would
        // otherwise be exempt by omission — silently, which is how the palette
        // got here. Every name must be either checked or named as excluded.
        const accountedText = new Set([...TEXT_TOKENS, ...NON_CHROME_TEXT]);
        const accountedBg = new Set([...SURFACES, ...NON_SURFACE_BG]);
        const unaccounted = [...tokens.keys()].filter(
          (name) =>
            (name.startsWith("text-") && !accountedText.has(name)) ||
            (name.startsWith("bg-") && !accountedBg.has(name)),
        );
        // Add it to TEXT_TOKENS / SURFACES to check it, or to NON_CHROME_TEXT /
        // NON_SURFACE_BG with a comment saying why it is not chrome text.
        expect(unaccounted).toEqual([]);
      });

      it("keeps the text hierarchy ordered from primary to muted", () => {
        // Compression is the price of AA on a mid-tone surface, but the ramp
        // must still descend: if muted ever outshines secondary the token
        // names stop describing what the user sees.
        const reference = tokens.get("bg-surface") as string;
        const steps = ["text-primary", "text-secondary", "text-tertiary", "text-muted"].map((t) =>
          ratio(tokens.get(t) as string, reference),
        );
        for (let i = 1; i < steps.length; i++) {
          expect(steps[i], `step ${i} is no brighter than step ${i - 1}`).toBeLessThanOrEqual(
            steps[i - 1],
          );
        }
      });
    });
  }

  it("reads both theme sets", () => {
    // Guard against the parser silently matching nothing.
    expect(sets.dark.size).toBeGreaterThanOrEqual(40);
    expect(sets.light.size).toBeGreaterThanOrEqual(40);
    expect(sets.light.get("text-muted")).not.toBe(sets.dark.get("text-muted"));
  });
});
