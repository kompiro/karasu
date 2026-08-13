import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  compositeOver,
  contrastRatio,
  getReference,
  WCAG_AA_LARGE_TEXT,
  WCAG_AA_NORMAL_TEXT,
} from "@karasu-tools/core";
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
 * Opaque surfaces text is painted on. Translucent chrome is not here — it is
 * measured composited, in `TINTED_PAIRS` below.
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
 * `--text-*` tokens that are not chrome text: they are painted on a specific
 * colored background instead, and are checked as `SOLID_PAIRS` below.
 */
const NON_CHROME_TEXT = ["text-on-accent"];

/**
 * `--badge-preview-text` is checked against the real badge colors rather than
 * a token, in its own test below — the Reference panel supplies that
 * background inline from `getReference()`, so the only honest fence reads the
 * same source the component does.
 */
const NON_TOKEN_BACKED_TEXT = ["badge-preview-text"];

/** Text that carries its own background rather than sitting on the chrome. */
const SELF_BACKED_PAIRS: [string, string][] = [
  ["export-error-text", "export-error-bg"],
  ["opfs-banner-text", "opfs-banner-bg"],
];

/**
 * Text painted on an opaque *colored* token rather than a chrome surface.
 * This is where a hardcoded literal used to hide: the CommandPalette and
 * ProjectPicker selected rows wrote `text-white` on `--accent`, which measured
 * 3.14:1 in dark until #2461 gave `--text-on-accent` a per-theme ink.
 */
const SOLID_PAIRS: [string, string][] = [
  ["text-on-accent", "accent"],
  ["error-badge-text", "error"],
];

/**
 * Text painted on translucent chrome, with the opaque surfaces that chrome can
 * span. The effective background is the tint composited over each — always
 * worse than the surface alone, which is why these need their own pass.
 *
 * The spans are traced from where each component mounts, not assumed:
 *   `--accent-dim`      toolbars and the crud matrix (`--bg-surface` /
 *                       `--bg-base`), breadcrumb (`--bg-surface`), snapshot
 *                       picker inside a dialog (`--bg-raised` / `--bg-overlay`)
 *   `--error-dim`       context menu (`--bg-raised`), preview error state
 *                       (`--bg-base`), project selector (`--bg-void`)
 *   `--warning-bg`      settings pane and chat pane, both on the body
 *                       (`--bg-base`)
 *   `--diff-banner-bg`  the diff banner, a direct child of the app shell
 *                       (`--bg-base`)
 *   `--diff-bg-*`       edge-detail rows inside a panel (`--bg-raised` /
 *                       `--bg-overlay`)
 * Moving one of these components to a different pane changes its span; update
 * the list here in the same change.
 */
const TINTED_PAIRS: { fg: string; tint: string; over: string[] }[] = [
  {
    fg: "accent-hover",
    tint: "accent-dim",
    over: ["bg-base", "bg-surface", "bg-raised", "bg-overlay"],
  },
  { fg: "text-link-hover", tint: "accent-dim", over: ["bg-surface"] },
  { fg: "text-primary", tint: "accent-dim", over: ["bg-raised", "bg-overlay"] },
  { fg: "error", tint: "error-dim", over: ["bg-void", "bg-base", "bg-raised"] },
  { fg: "text-secondary", tint: "warning-bg", over: ["bg-base"] },
  { fg: "warning", tint: "warning-bg", over: ["bg-base"] },
  { fg: "text-link", tint: "warning-bg", over: ["bg-base"] },
  { fg: "text-primary", tint: "diff-banner-bg", over: ["bg-base"] },
  { fg: "diff-color-removed", tint: "diff-banner-bg", over: ["bg-base"] },
  { fg: "diff-color-added", tint: "diff-banner-bg", over: ["bg-base"] },
  { fg: "text-primary", tint: "diff-banner-hover-bg", over: ["bg-base"] },
  { fg: "text-primary", tint: "diff-banner-active-bg", over: ["bg-base"] },
  // Edge-detail diff rows: the route is primary, the label secondary (muted is
  // too faint once the tint lifts the background), the marker its diff color.
  { fg: "text-primary", tint: "diff-bg-added", over: ["bg-raised", "bg-overlay"] },
  { fg: "text-primary", tint: "diff-bg-removed", over: ["bg-raised", "bg-overlay"] },
  { fg: "text-secondary", tint: "diff-bg-added", over: ["bg-raised", "bg-overlay"] },
  { fg: "text-secondary", tint: "diff-bg-removed", over: ["bg-raised", "bg-overlay"] },
  { fg: "diff-color-added", tint: "diff-bg-added", over: ["bg-raised", "bg-overlay"] },
  { fg: "diff-color-removed", tint: "diff-bg-removed", over: ["bg-raised", "bg-overlay"] },
];

/**
 * Text painted straight onto a panel surface by a token outside `TEXT_TOKENS`.
 * The diff colors reach here through the node-detail annotation diff list,
 * a third role beyond the banner label and the SVG stroke — and the one that
 * caught dark `--diff-color-removed` at 4.27:1 on `--bg-overlay` (#2461).
 */
const PANEL_TEXT_PAIRS: { fg: string; over: string[] }[] = [
  { fg: "diff-color-added", over: ["bg-raised", "bg-overlay"] },
  { fg: "diff-color-removed", over: ["bg-raised", "bg-overlay"] },
];

/**
 * Translucent tokens that host no text, so they answer to the 3:1 non-text
 * minimum their borders and glows already meet rather than to AA.
 */
const TEXT_FREE_TINTS = [
  "accent-border",
  "accent-border-strong",
  "accent-glow",
  "border-default",
  "border-faint",
  "border-strong",
  "border-subtle",
  "diff-banner-active-border",
  "diff-banner-border",
  "diff-bg-changed", // paints a swatch fill; no label sits inside it
  "feather-dim",
  "feather-glow",
  "highlight-edge",
  "opfs-banner-border", // rules off the banner edge; its text sits on the gradient
  "overlay-scrim", // dims what is *behind* it; the dialog's text is above
  "reference-scrim",
  "shadow-diagram-color", // a drop shadow, painted outside the element it lifts
  "warning-border",
  "warning-dim",
];

/**
 * The diff colors double as SVG strokes on the diagram canvas, where the
 * applicable minimum is 3:1 (WCAG 1.4.11) rather than AA — a color tuned only
 * for the banner label could go faint as a stroke.
 */
const STROKE_ON_CANVAS: [string, string][] = [
  ["diff-color-added", "bg-raised"],
  ["diff-color-removed", "bg-raised"],
  ["diff-color-changed", "bg-raised"],
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

/**
 * A token whose *whole* value is one `rgba()` — the form every translucent
 * token takes. Anchored, so gradients and shadows (which also contain rgba)
 * are not mistaken for tints by the drift guard.
 */
const LONE_RGBA = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/;

/** The color a viewer actually sees where a translucent `tint` covers `surface`. */
function effectiveBackground(tint: string, surface: string): string {
  const m = LONE_RGBA.exec(tint.trim());
  expect(m, `${tint} is a lone rgba() value`).not.toBeNull();
  const [, r, g, b, alpha] = m as RegExpExecArray;
  const hex = `#${[r, g, b].map((c) => Number(c).toString(16).padStart(2, "0")).join("")}`;
  const composited = compositeOver(hex, surface, alpha === undefined ? 1 : Number(alpha));
  expect(composited, `${tint} composites over ${surface}`).toBeDefined();
  return composited as string;
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

      for (const [fgToken, bgToken] of SOLID_PAIRS) {
        it(`--${fgToken} clears AA on --${bgToken}`, () => {
          const fg = tokens.get(fgToken);
          const bg = tokens.get(bgToken);
          expect(fg, `--${fgToken} is defined`).toBeDefined();
          expect(bg, `--${bgToken} is defined`).toBeDefined();
          expect(
            ratio(fg as string, bg as string),
            `--${fgToken} on --${bgToken} (${setName})`,
          ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
        });
      }

      for (const { fg: fgToken, tint: tintToken, over } of TINTED_PAIRS) {
        it(`--${fgToken} clears AA on --${tintToken} over ${over.join(" / ")}`, () => {
          const fg = tokens.get(fgToken);
          const tint = tokens.get(tintToken);
          expect(fg, `--${fgToken} is defined`).toBeDefined();
          expect(tint, `--${tintToken} is defined`).toBeDefined();
          for (const surface of over) {
            const bg = tokens.get(surface);
            expect(bg, `--${surface} is defined`).toBeDefined();
            const effective = effectiveBackground(tint as string, bg as string);
            expect(
              ratio(fg as string, effective),
              `--${fgToken} on --${tintToken} over --${surface} = ${effective} (${setName})`,
            ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
          }
        });
      }

      for (const { fg: fgToken, over } of PANEL_TEXT_PAIRS) {
        it(`--${fgToken} clears AA as panel text on ${over.join(" / ")}`, () => {
          const fg = tokens.get(fgToken);
          expect(fg, `--${fgToken} is defined`).toBeDefined();
          for (const surface of over) {
            const bg = tokens.get(surface);
            expect(bg, `--${surface} is defined`).toBeDefined();
            expect(
              ratio(fg as string, bg as string),
              `--${fgToken} as panel text on --${surface} (${setName})`,
            ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
          }
        });
      }

      for (const [strokeToken, canvasToken] of STROKE_ON_CANVAS) {
        it(`--${strokeToken} stays visible as a stroke on --${canvasToken}`, () => {
          const stroke = tokens.get(strokeToken);
          const canvas = tokens.get(canvasToken);
          expect(stroke, `--${strokeToken} is defined`).toBeDefined();
          expect(canvas, `--${canvasToken} is defined`).toBeDefined();
          expect(
            ratio(stroke as string, canvas as string),
            `--${strokeToken} stroke on --${canvasToken} (${setName})`,
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

      it("accounts for every translucent token this set defines", () => {
        // Same guard, one layer out: a new tint that hosts text has to declare
        // the surfaces it spans, or say in TEXT_FREE_TINTS that it hosts none.
        const measured = new Set(TINTED_PAIRS.map((p) => p.tint));
        const unaccounted = [...tokens.entries()]
          .filter(([, value]) => LONE_RGBA.test(value.trim()))
          .map(([name]) => name)
          .filter((name) => !measured.has(name) && !TEXT_FREE_TINTS.includes(name));
        expect(unaccounted).toEqual([]);
      });

      it("names only tokens that exist in its exclusion lists", () => {
        // An exclusion that outlives its token is a stale claim, and worse, it
        // would keep excusing a *new* token that later takes the same name.
        const stale = [
          ...NON_CHROME_TEXT,
          ...NON_TOKEN_BACKED_TEXT,
          ...NON_SURFACE_BG,
          ...TEXT_FREE_TINTS,
        ].filter((name) => !tokens.has(name));
        expect(stale).toEqual([]);
      });

      it("keeps --badge-preview-text legible on every badge color it can paint", () => {
        // The Reference panel sets this background inline from getReference(),
        // always the dark-palette badge color whichever theme is active — so
        // read the same source the component does rather than a stand-in token.
        // White measured 2.15:1 on `@experimental` in *both* themes (#2461).
        const ink = tokens.get("badge-preview-text");
        expect(ink, "--badge-preview-text is defined").toBeDefined();
        const badges = getReference("en").annotations.map((a) => a.defaultBadge.color);
        expect(badges.length, "getReference exposes annotation badges").toBeGreaterThan(0);
        for (const badge of badges) {
          expect(
            ratio(ink as string, badge),
            `--badge-preview-text on badge ${badge} (${setName})`,
          ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
        }
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
