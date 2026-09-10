/* eslint-disable no-console -- spike script */
/**
 * SPIKE — not for merge. Renders every drill-down level of a model with the
 * tree exactly as it stands and writes `<path> <sha1> <w>x<h>` per level, so a
 * later instrumented build can prove byte-identity against unmodified main.
 *
 *   pnpm tsx reports/width-budget-ladder/baseline-hashes.ts <file.krs> <out.txt>
 */
import { writeFileSync } from "node:fs";
import { parseModel, sha1, svgCanvas, walkLevels } from "./walk.ts";

const [file, out] = process.argv.slice(2);
if (!file || !out) throw new Error("usage: baseline-hashes.ts <file.krs> <out.txt>");
const levels = walkLevels(parseModel(file));
const lines = levels.map((l) => {
  const { width, height } = svgCanvas(l.svg);
  return `${l.path}\t${sha1(l.svg)}\t${width}\t${height}\t${l.svg.length}`;
});
writeFileSync(out, `${lines.join("\n")}\n`);
console.log(`${levels.length} levels -> ${out}`);
