/**
 * The fonts the PNG render path (`functions/render.ts`, resvg-wasm) hands the
 * rasterizer, and a reader for what they cover (TPL-1799, #1799).
 *
 * resvg in the Workers runtime has no system fonts and no implicit fallback:
 * the union of these files' cmaps is every character a PNG can show. Kept out
 * of the test files so two guards read the same list and the same reader:
 * `png-font-coverage.test.ts` (the list equals what `functions/render.ts`
 * loads, and covers the renderer's markers) and
 * `scripts/ci/raster-input.test.ts` (every character the corpus draws on a
 * raster path is covered).
 */

/** File names under `packages/app/public/fonts/`, in the order `functions/render.ts` loads them. */
export const RASTER_FONT_FILES: readonly string[] = [
  "NotoSans-Regular.ttf",
  "NotoSansJP-Regular.otf",
  "NotoEmoji.ttf",
  "NotoSansSymbols2-Regular.ttf",
];

/** Minimal sfnt cmap reader: collects every codepoint mapped to a non-zero glyph. */
export function readCmapCoverage(font: Uint8Array): Set<number> {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const u16 = (o: number) => view.getUint16(o);
  const u32 = (o: number) => view.getUint32(o);
  const tag = (o: number) => String.fromCharCode(...font.subarray(o, o + 4));

  const numTables = u16(4);
  let cmapOffset = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (tag(rec) === "cmap") cmapOffset = u32(rec + 8);
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
