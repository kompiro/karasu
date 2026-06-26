import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guard for TPL-20260626-01 (#1799): the karasu-nest PNG raster path
 * (`functions/render.ts`, resvg-wasm) supplies its own fonts, with no implicit
 * browser fallback. The SVG renderer emits emoji as inline node markers, so the
 * bundled emoji font MUST cover every marker codepoint — otherwise PNG output
 * shows tofu (□) while the browser SVG looks fine.
 *
 * This verifies the *actually shipped* fonts' cmaps (the union, since resvg
 * falls back across every buffer), so it catches both a missing marker and a
 * font swapped for one lacking coverage. Adding a new marker glyph to the
 * renderer requires adding its codepoint here (and confirming a bundled font
 * covers it) — the TPL's tripwire made executable.
 *
 * Note ✦ (U+2726, @new badge) is a Dingbats symbol, not an emoji — Noto Emoji
 * does NOT cover it, so Noto Sans Symbols 2 is bundled for it (#1799).
 */

// Non-ASCII glyphs the core SVG renderer emits as node markers / annotation
// badges. Sources: packages/core/src/renderer/svg-renderer.ts & layout.ts
// (👥 owner, 📦 resources, 🔗 link, 🔐 external) and the annotation badge icons
// from packages/core/src/builtins/reference-data.ts → default-style.ts:60
// (⚠ deprecated, ✦ new, ⚗ experimental).
const MARKER_CODEPOINTS: ReadonlyArray<{ cp: number; label: string }> = [
  { cp: 0x1f465, label: "👥 owner team" },
  { cp: 0x1f4e6, label: "📦 resources" },
  { cp: 0x1f517, label: "🔗 link" },
  { cp: 0x1f510, label: "🔐 external" },
  { cp: 0x26a0, label: "⚠ deprecated badge" },
  { cp: 0x2726, label: "✦ new badge" },
  { cp: 0x2697, label: "⚗ experimental badge" },
];

// The fonts the PNG render path loads (must mirror functions/render.ts FONT_PATHS).
const BUNDLED_FONTS = [
  "NotoSans-Regular.ttf",
  "NotoSansJP-Regular.otf",
  "NotoEmoji.ttf",
  "NotoSansSymbols2-Regular.ttf",
];

const fontPath = (file: string) =>
  fileURLToPath(new URL(`../../public/fonts/${file}`, import.meta.url));
const RENDER_FN_PATH = fileURLToPath(new URL("../../../../functions/render.ts", import.meta.url));

/** Minimal sfnt cmap reader: collects every codepoint mapped to a non-zero glyph. */
function readCmapCoverage(font: Buffer): Set<number> {
  const u16 = (o: number) => font.readUInt16BE(o);
  const u32 = (o: number) => font.readUInt32BE(o);

  const numTables = u16(4);
  let cmapOffset = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (font.toString("ascii", rec, rec + 4) === "cmap") cmapOffset = u32(rec + 8);
  }
  if (cmapOffset < 0) throw new Error("no cmap table");

  // Pick the best Unicode subtable: prefer (3,10)/(0,4..6) format-12, else (3,1) format-4.
  const numSub = u16(cmapOffset + 2);
  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < numSub; i++) {
    const rec = cmapOffset + 4 + i * 8;
    const platform = u16(rec);
    const enc = u16(rec + 2);
    const sub = cmapOffset + u32(rec + 4);
    const format = u16(sub);
    const unicodeFull = (platform === 3 && enc === 10) || (platform === 0 && enc >= 4);
    const unicodeBmp = (platform === 3 && enc === 1) || (platform === 0 && enc <= 3);
    const score = format === 12 && unicodeFull ? 3 : format === 4 && unicodeBmp ? 1 : 0;
    if (score > bestScore) {
      bestScore = score;
      best = sub;
    }
  }
  if (best < 0) throw new Error("no usable Unicode cmap subtable");

  const covered = new Set<number>();
  const format = u16(best);
  if (format === 12) {
    const nGroups = u32(best + 12);
    for (let g = 0; g < nGroups; g++) {
      const rec = best + 16 + g * 12;
      const start = u32(rec);
      const end = u32(rec + 4);
      const startGid = u32(rec + 8);
      for (let cp = start; cp <= end; cp++) if (startGid + (cp - start) !== 0) covered.add(cp);
    }
  } else if (format === 4) {
    const segX2 = u16(best + 6);
    const segCount = segX2 / 2;
    const endO = best + 14;
    const startO = endO + segX2 + 2;
    const deltaO = startO + segX2;
    const rangeO = deltaO + segX2;
    for (let s = 0; s < segCount; s++) {
      const end = u16(endO + s * 2);
      const start = u16(startO + s * 2);
      const delta = u16(deltaO + s * 2);
      const rangeOffset = u16(rangeO + s * 2);
      for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
        let gid: number;
        if (rangeOffset === 0) gid = (cp + delta) & 0xffff;
        else {
          const gi = rangeO + s * 2 + rangeOffset + (cp - start) * 2;
          gid = u16(gi);
          if (gid !== 0) gid = (gid + delta) & 0xffff;
        }
        if (gid !== 0) covered.add(cp);
      }
    }
  } else {
    throw new Error(`unsupported cmap format ${format}`);
  }
  return covered;
}

describe("PNG raster font coverage (TPL-20260626-01, #1799)", () => {
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

  it("the PNG render function wires every bundled font into its font set", () => {
    const src = readFileSync(RENDER_FN_PATH, "utf8");
    for (const file of BUNDLED_FONTS) expect(src).toContain(`/fonts/${file}`);
  });
});
