// Title cards and the final MP4: intro card, the recording, outro card, with fades.

import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { BROWSER_SCALE } from "./browser.mts";
import { SCREEN } from "./display.mts";
import { titleCard } from "./overlay.mts";

export interface Card {
  kicker: string;
  title: string;
  sub: string;
}

/** Renders each card to a 1920x1080 PNG with a headless browser. */
export async function renderCards(cards: ReadonlyArray<[Card, string]>): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: {
      width: Math.round(SCREEN.width / BROWSER_SCALE),
      height: Math.round(SCREEN.height / BROWSER_SCALE),
    },
    deviceScaleFactor: BROWSER_SCALE,
  });
  for (const [card, out] of cards) {
    await page.setContent("<html><body style='margin:0'></body></html>");
    await titleCard(page, card.kicker, card.title, card.sub);
    await page.waitForTimeout(500);
    await page.screenshot({ path: out });
  }
  await browser.close();
}

function duration(file: string): number {
  return Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      file,
    ]).toString(),
  );
}

/** intro (still) + recording + outro (still), each joined with a short fade. */
export function composeVideo(opts: {
  intro: string;
  raw: string;
  outro: string;
  out: string;
  cardSeconds?: number;
}): void {
  const card = opts.cardSeconds ?? 4;
  const fadeOutAt = Math.max(0, duration(opts.raw) - 0.5).toFixed(2);
  const size = `${SCREEN.width}:${SCREEN.height}`;
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    ...["-loop", "1", "-t", String(card), "-framerate", "30", "-i", opts.intro],
    ...["-i", opts.raw],
    ...["-loop", "1", "-t", String(card), "-framerate", "30", "-i", opts.outro],
    "-filter_complex",
    [
      `[0]scale=${size},format=yuv420p,fade=t=out:st=${card - 0.5}:d=0.5[a]`,
      `[1]scale=${size},format=yuv420p,fade=t=in:st=0:d=0.4,fade=t=out:st=${fadeOutAt}:d=0.5[b]`,
      `[2]scale=${size},format=yuv420p,fade=t=in:st=0:d=0.5[c]`,
      "[a][b][c]concat=n=3:v=1:a=0[v]",
    ].join(";"),
    ...["-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "18"],
    ...["-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", opts.out],
  ]);
}

/** A grid of frames every `every` seconds, for reviewing a recording at a glance. */
export function contactSheet(video: string, out: string, every = 3, cols = 4): void {
  const seconds = duration(video);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`${video} has no duration`);
  const rows = Math.max(1, Math.ceil(seconds / every / cols));
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    video,
    "-vf",
    `fps=1/${every},scale=640:-1,tile=${cols}x${rows}`,
    "-frames:v",
    "1",
    out,
  ]);
}
