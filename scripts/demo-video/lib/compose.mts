// Title cards, the thumbnail, and the final MP4: intro card, the recording, outro card,
// with fades.

import { chromium } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { BROWSER_SCALE } from "./browser.mts";
import { registerCleanup, SCREEN } from "./display.mts";
import { thumbnailCard, titleCard } from "./overlay.mts";

export interface Card {
  kicker: string;
  title: string;
  sub: string;
}

/** A card to render: a title card, or a thumbnail when `frame` (a PNG path) is given. */
export interface CardImage {
  card: Card;
  out: string;
  frame?: string;
  /** Language of the card text ("en" / "ja"), for line breaking in the thumbnail. */
  lang?: string;
}

/** Renders each card to a 1920x1080 PNG with a headless browser. */
export async function renderCards(images: readonly CardImage[]): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: {
        width: Math.round(SCREEN.width / BROWSER_SCALE),
        height: Math.round(SCREEN.height / BROWSER_SCALE),
      },
      deviceScaleFactor: BROWSER_SCALE,
    });
    for (const { card, out, frame, lang } of images) {
      await page.setContent("<html><body style='margin:0'></body></html>");
      if (frame) {
        // A data URL: the blank page cannot load file:// images.
        const url = `data:image/png;base64,${readFileSync(frame).toString("base64")}`;
        await thumbnailCard(page, lang ?? "en", url, card.kicker, card.title, card.sub);
      } else {
        await titleCard(page, card.kicker, card.title, card.sub);
      }
      await page.waitForTimeout(500);
      await page.screenshot({ path: out });
    }
  } finally {
    await browser.close();
  }
}

/**
 * Runs ffmpeg without blocking the event loop, so record.mts's SIGINT / SIGTERM
 * handler can still run during a long encode, and registers it for that cleanup.
 */
function ffmpeg(args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    const unregister = registerCleanup(() => child.kill("SIGKILL"));
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (e) => {
      unregister();
      reject(e);
    });
    child.on("exit", (code, signal) => {
      unregister();
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${signal ?? code}): ${stderr.trim()}`));
    });
  });
}

/** Seconds of video in `file` (NaN when ffprobe cannot tell). */
export function duration(file: string): number {
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

/** One frame of `video` at `seconds`, as a PNG. */
export async function extractFrame(video: string, seconds: number, out: string): Promise<void> {
  await ffmpeg([
    "-y",
    "-loglevel",
    "error",
    "-ss",
    seconds.toFixed(2),
    "-i",
    video,
    "-frames:v",
    "1",
    out,
  ]);
}

/** intro (still) + recording + outro (still), each joined with a short fade. */
export async function composeVideo(opts: {
  intro: string;
  raw: string;
  outro: string;
  out: string;
  cardSeconds?: number;
}): Promise<void> {
  const card = opts.cardSeconds ?? 4;
  const rawSeconds = duration(opts.raw);
  if (!Number.isFinite(rawSeconds) || rawSeconds <= 0) {
    throw new Error(`${opts.raw} has no readable duration`);
  }
  const fadeOutAt = Math.max(0, rawSeconds - 0.5).toFixed(2);
  const size = `${SCREEN.width}:${SCREEN.height}`;
  await ffmpeg([
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
export async function contactSheet(video: string, out: string, every = 3, cols = 4): Promise<void> {
  const seconds = duration(video);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`${video} has no duration`);
  const rows = Math.max(1, Math.ceil(seconds / every / cols));
  await ffmpeg([
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
