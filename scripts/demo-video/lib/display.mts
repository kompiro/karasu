// The virtual X display every demo is recorded from, the screen recorder, and the
// real X pointer. Recording the display (not a page screencast) is what lets one recipe
// cover both the browser app and VS Code, and it captures the OS cursor as the viewer
// would see it.

import { type ChildProcess, execFileSync, spawn } from "node:child_process";

export const DISPLAY = ":99";
export const SCREEN = { width: 1920, height: 1080 };
const XENV = { ...process.env, DISPLAY };

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function displayIsUp(): boolean {
  try {
    execFileSync("xdotool", ["getmouselocation"], { env: XENV, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Starts Xvfb on DISPLAY unless one is already serving it. Returns a stop function. */
export async function ensureDisplay(): Promise<() => void> {
  if (displayIsUp()) return () => {};
  const xvfb = spawn(
    "Xvfb",
    [DISPLAY, "-screen", "0", `${SCREEN.width}x${SCREEN.height}x24`, "-nolisten", "tcp"],
    { stdio: "ignore" },
  );
  for (let i = 0; i < 50 && !displayIsUp(); i++) await sleep(100);
  if (!displayIsUp()) throw new Error(`Xvfb did not come up on ${DISPLAY}`);
  return () => xvfb.kill();
}

export interface Recording {
  stop(): Promise<void>;
}

/**
 * Records the whole display to an H.264 MP4. Fragmented MP4, so a run that dies
 * half-way still leaves a playable file to look at; compose.mts rewrites it with
 * +faststart.
 */
export function startRecording(out: string, fps = 30): Recording {
  const ffmpeg: ChildProcess = spawn(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "x11grab",
      "-draw_mouse",
      "1",
      "-framerate",
      String(fps),
      "-video_size",
      `${SCREEN.width}x${SCREEN.height}`,
      "-i",
      DISPLAY,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "frag_keyframe+empty_moov",
      out,
    ],
    // stdout/stderr must not be inherited: a pipe the recorder holds open keeps a
    // caller's `| tail` waiting after the scenario has exited.
    { stdio: ["pipe", "ignore", "ignore"] },
  );
  return {
    stop: () =>
      new Promise<void>((resolve) => {
        ffmpeg.on("exit", () => resolve());
        ffmpeg.stdin?.write("q");
        ffmpeg.stdin?.end();
      }),
  };
}

/** One PNG of the display, for checking a framing before recording. */
export function grab(out: string): void {
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "x11grab",
    "-video_size",
    `${SCREEN.width}x${SCREEN.height}`,
    "-i",
    DISPLAY,
    "-frames:v",
    "1",
    out,
  ]);
}

// ---- the real pointer ----
// Playwright's mouse sends CDP input events, which never move the X cursor, so a
// recording would show a still pointer while things get clicked. These move it.

const xdo = (...args: Array<string | number>) =>
  execFileSync("xdotool", args.map(String), { env: XENV }).toString();

export interface Point {
  x: number;
  y: number;
}

export function cursorPos(): Point {
  const out = xdo("getmouselocation");
  return { x: Number(/x:(\d+)/.exec(out)?.[1]), y: Number(/y:(\d+)/.exec(out)?.[1]) };
}

/** Moves the pointer along an eased path, so the viewer can follow it. */
export async function moveTo(x: number, y: number, ms = 600): Promise<void> {
  const from = cursorPos();
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    xdo("mousemove", Math.round(from.x + (x - from.x) * e), Math.round(from.y + (y - from.y) * e));
    await sleep(16);
  }
}

/** Button 1 = left, 3 = right. */
export async function clickAt(p: Point, { button = 1, ms = 600 } = {}): Promise<void> {
  await moveTo(p.x, p.y, ms);
  await sleep(150);
  xdo("click", button);
}

/** Ctrl+click at the pointer's current position. */
export async function ctrlClick(): Promise<void> {
  xdo("keydown", "ctrl");
  await sleep(150);
  xdo("click", 1);
  await sleep(150);
  xdo("keyup", "ctrl");
}

/** Wheel steps over a point. In the karasu preview the wheel zooms: "down" zooms out. */
export async function wheelAt(p: Point, dir: "up" | "down", steps: number): Promise<void> {
  await moveTo(p.x, p.y, 400);
  for (let i = 0; i < steps; i++) {
    xdo("click", dir === "down" ? 5 : 4);
    await sleep(120);
  }
}

/** Parks the pointer in the bottom-right corner, out of the frame's way. */
export function parkPointer(): void {
  xdo("mousemove", SCREEN.width - 5, SCREEN.height - 5);
}
