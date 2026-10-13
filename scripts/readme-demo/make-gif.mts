/* eslint-disable no-console -- CLI entry point; it reports progress on stdout */
// Builds the looping README GIF from the frames record.mts wrote (Issue #3175).
//
//   pnpm readme-demo:gif <record out dir> <out.gif> [--width 960] [--fps 12] [--hold 2]
//
// The screencast emits a frame only when the page changes, so each kept frame is shown
// until the next one: a still scene is one long frame. Stretches where record.mts hid the
// canvas (a re-fit, a page navigation) are compressed to a short cut. Needs ImageMagick's
// `convert` on PATH.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    width: { type: "string", default: "960" },
    fps: { type: "string", default: "12" },
    hold: { type: "string", default: "2" },
  },
});
const [dir, outGif] = positionals;
if (!dir || !outGif) {
  console.error(
    "usage: make-gif.mts <record out dir> <out.gif> [--width 960] [--fps 12] [--hold 2]",
  );
  process.exit(1);
}

interface Frame {
  file: string;
  t: number;
}
const frames = JSON.parse(readFileSync(join(dir, "frames.json"), "utf8")) as Frame[];
if (frames.length === 0) {
  console.error(`${dir}/frames.json holds no frames; record again`);
  process.exit(1);
}
const marks = JSON.parse(readFileSync(join(dir, "marks.json"), "utf8")) as {
  t: number;
  hidden: boolean;
}[];

/** Screen time each hidden stretch keeps, in seconds. */
const ALLOW = 0.25;
const hidden: [number, number][] = [];
for (let i = 0; i < marks.length - 1; i++) {
  // +0.2 s covers the fade back in
  if (marks[i]!.hidden && !marks[i + 1]!.hidden) hidden.push([marks[i]!.t, marks[i + 1]!.t + 0.2]);
}
const warp = (t: number) =>
  t - hidden.reduce((cut, [a, b]) => cut + Math.max(0, Math.min(t, b) - a - ALLOW), 0);

const minGap = 1 / Number(opts.fps);
const kept: Frame[] = [];
for (const f of frames.map((x) => ({ ...x, t: warp(x.t) }))) {
  const last = kept.at(-1);
  if (!last || f.t - last.t >= minGap) kept.push(f);
  else last.file = f.file; // a burst shows its latest image
}

const args = ["-loop", "0"];
let total = 0;
kept.forEach((f, i) => {
  const next = kept[i + 1];
  const seconds = next ? next.t - f.t : Number(opts.hold);
  const cs = Math.max(2, Math.round(seconds * 100)); // GIF delays are centiseconds
  total += cs;
  args.push("-delay", String(cs), join(dir, "frames", f.file));
});
// Crop the bottom diagnostics row (y >= 692 of 720), scale, and let ImageMagick diff frames.
args.push(
  "-crop",
  "1280x692+0+0",
  "+repage",
  "-resize",
  `${opts.width}x`,
  "-layers",
  "Optimize",
  outGif,
);
execFileSync("convert", args, { stdio: "inherit" });
console.log(`frames kept ${kept.length}/${frames.length}, length ${(total / 100).toFixed(1)}s`);
