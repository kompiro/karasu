import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RASTER_FONT_FILES, readCmapCoverage } from "./raster-fonts.js";

/**
 * Guard for TPL-1799 (#1799): the karasu-nest PNG raster path
 * (`functions/render.ts`, resvg-wasm) supplies its own fonts, with no implicit
 * browser fallback. The SVG renderer emits emoji as inline node markers, so the
 * bundled emoji font MUST cover every marker codepoint — otherwise PNG output
 * shows tofu (□) while the browser SVG looks fine.
 *
 * This verifies the *actually shipped* fonts' cmaps (the union, since resvg
 * falls back across every buffer), so it catches both a missing marker and a
 * font swapped for one lacking coverage. The list below is hand-kept; what
 * the raster paths actually receive is checked over the whole example and AT
 * corpus by scripts/ci/raster-input.test.ts, which needs no list. A marker
 * drawn only in views the raster paths never render still belongs here: the
 * degraded boundary tab is drawn only when grouped by team or boundary (the
 * same ◇ does reach the rasters, as the @planned badge).
 *
 * Note ✦ (U+2726, @new badge) is a Dingbats symbol, not an emoji — Noto Emoji
 * does NOT cover it, so Noto Sans Symbols 2 is bundled for it (#1799).
 */

// Non-ASCII glyphs the core SVG renderer emits as node markers / annotation
// badges. The meta chips (owner team / resources / link / capability) became
// vector paths in #2366 proposal D (renderer/meta-glyphs.ts), so their emoji
// codepoints left this list. Remaining sources: the annotation badge icons
// from packages/core/src/builtins/reference-data.ts → default-style.ts:60
// (⚠ deprecated, ✦ new, ⚗ experimental), and the diff ghost badge for a node
// whose annotations were all removed (svg-renderer.ts emits − U+2212).
const MARKER_CODEPOINTS: ReadonlyArray<{ cp: number; label: string }> = [
  { cp: 0x26a0, label: "⚠ deprecated badge" },
  { cp: 0x2726, label: "✦ new badge" },
  { cp: 0x2697, label: "⚗ experimental badge" },
  { cp: 0x270e, label: "✎ draft badge" },
  { cp: 0x2212, label: "− removed-annotation ghost badge" },
  // ◇ marks a boundary membership the banded view could not draw as a frame
  // (#2179, container-frame.ts `renderDegradedTabs`). The first candidate ⧉ (U+29C9)
  // is outside the bundled fonts and rasterised as tofu — this line is why the
  // notation changed.
  { cp: 0x25c7, label: "◇ degraded boundary membership tab" },
];

// The fonts the PNG render path loads (shared with scripts/ci/raster-input.test.ts).
// The second test below asserts this set is exactly the `/fonts/*` set wired in
// functions/render.ts, so the two can't silently diverge (in either direction).
const BUNDLED_FONTS = RASTER_FONT_FILES;

const fontPath = (file: string) =>
  fileURLToPath(new URL(`../../public/fonts/${file}`, import.meta.url));
const RENDER_FN_PATH = fileURLToPath(new URL("../../../../functions/render.ts", import.meta.url));

describe("PNG raster font coverage (TPL-1799, #1799)", () => {
  it("the bundled fonts together cover every marker glyph the renderer emits", () => {
    const covered = new Set<number>();
    for (const file of BUNDLED_FONTS) {
      for (const cp of readCmapCoverage(readFileSync(fontPath(file)))) covered.add(cp);
    }
    // On failure the diff lists the missing labels — these glyphs would render
    // as tofu (□) in the PNG output.
    const missing = MARKER_CODEPOINTS.filter((m) => !covered.has(m.cp)).map((m) => m.label);
    expect(missing).toEqual([]);
  });

  it("BUNDLED_FONTS exactly mirrors the font set functions/render.ts loads", () => {
    const src = readFileSync(RENDER_FN_PATH, "utf8");
    // Parse the `/fonts/<file>` entries from render.ts FONT_PATHS. Asserting set
    // equality (not just ⊇) catches drift in BOTH directions: a font added to
    // render.ts but not here (its glyphs would be absent from the coverage
    // union, silently weakening the guard) and vice versa.
    const wired = [...src.matchAll(/["'`]\/fonts\/([^"'`]+)["'`]/g)].map((m) => m[1]);
    expect(new Set(wired)).toEqual(new Set(BUNDLED_FONTS));
  });
});
