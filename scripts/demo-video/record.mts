/* eslint-disable no-console -- CLI entry point; it reports progress on stdout */
// Records one demo-video scenario to a captioned 1920x1080 MP4 (Issue #3355).
//
//   pnpm demo-video:record <scenario> [--lang en|ja] [--out <dir>]
//
// <scenario> is a file name under scenarios/ without its extension. The run copies the
// scenario's fixture model for the language to a scratch dir, records the virtual
// display while the scenario drives the app or VS Code, then wraps the recording in
// intro / outro title cards. Writes, under <out>:
//   <scenario>.<lang>.mp4            the video
//   <scenario>.<lang>.thumbnail.png  the title beside a frame the scenario marked
//   <scenario>.<lang>.contact.png    a grid of frames, for reviewing the video
// <out> defaults to dist/demo-video/ of the main checkout (gitignored), also when run
// from a worktree, so the videos outlive the worktree. Scratch files go to the OS temp dir.
//
// The workflow, the prerequisites and the pitfalls are in .claude/skills/demo-video/SKILL.md.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { composeVideo, contactSheet, duration, extractFrame, renderCards } from "./lib/compose.mts";
import {
  ensureDisplay,
  parkPointer,
  type Recording,
  runCleanups,
  sleep,
  startRecording,
} from "./lib/display.mts";
import { HIDE_OVERLAYS_CSS } from "./lib/overlay.mts";
import type { Lang, Scenario } from "./lib/scenario.mts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const mainCheckout = dirname(
  execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: repo })
    .toString()
    .trim(),
);

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    lang: { type: "string", default: "en" },
    out: { type: "string", default: join(mainCheckout, "dist", "demo-video") },
  },
});
const scenarios = readdirSync(join(here, "scenarios")).map((f) => f.replace(/\.mts$/, ""));
const name = positionals[0];
if (!name || !scenarios.includes(name)) {
  console.error(
    `usage: record.mts <scenario> [--lang en|ja] [--out dir]\nscenarios: ${scenarios.join(", ")}`,
  );
  process.exit(1);
}
if (args.lang !== "en" && args.lang !== "ja") {
  console.error(`--lang must be en or ja, not ${args.lang}`);
  process.exit(1);
}
const lang: Lang = args.lang;
const out = resolve(args.out);

const scenario = (
  (await import(pathToFileURL(join(here, "scenarios", `${name}.mts`)).href)) as {
    default: Scenario;
  }
).default;

// ---- prerequisites ----
const missing: string[] = [];
for (const tool of ["ffmpeg", "ffprobe", "Xvfb", "xdotool"]) {
  try {
    execFileSync("which", [tool], { stdio: "ignore" });
  } catch {
    missing.push(`${tool}: sudo apt-get install -y ffmpeg xvfb xdotool`);
  }
}
let fonts = "";
try {
  fonts = execFileSync("fc-list").toString();
} catch {
  missing.push("fc-list: sudo apt-get install -y fontconfig");
}
if (!/Noto Sans CJK/.test(fonts)) missing.push("CJK font: sudo apt-get install -y fonts-noto-cjk");
if (!/Noto Color Emoji/.test(fonts)) {
  missing.push("emoji font (toolbar icons): sudo apt-get install -y fonts-noto-color-emoji");
}
for (const req of scenario.requires) {
  if (!existsSync(join(repo, req.path))) missing.push(`${req.path}: ${req.build}`);
}
if (missing.length > 0) {
  console.error(`missing prerequisites:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

// ---- record ----
const work = join(tmpdir(), "karasu-demo-video", `${name}.${lang}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
// Named after the fixture: VS Code shows this folder name in its title bar and explorer.
const model = join(work, scenario.fixture);
cpSync(join(here, "fixtures", scenario.fixture, lang), model, { recursive: true });
const raw = join(work, "raw.mp4");
const thumbFrame = join(work, "thumbnail-frame.png");

// An interrupted run (Ctrl+C, a tool timeout) must not leave Xvfb, ffmpeg, VS Code or
// karasu serve running on the shared display and ports.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    runCleanups();
    process.exit(130);
  });
}

const stopDisplay = await ensureDisplay();
let recording: Recording | undefined;
let thumbnailMarked = false;
let failed = false;
try {
  await scenario.run({
    lang,
    repo,
    work,
    model,
    startRecording() {
      recording ??= startRecording(raw);
    },
    async stopRecording() {
      await recording?.stop();
    },
    async markThumbnail(page) {
      // A pointer resting on an edge highlights it and dims the rest of the diagram.
      parkPointer();
      await sleep(300);
      await page.screenshot({ path: thumbFrame, style: HIDE_OVERLAYS_CSS });
      thumbnailMarked = true;
    },
  });
} catch (e) {
  failed = true;
  console.error("scenario failed:", e instanceof Error ? e.message.split("\n")[0] : e);
} finally {
  await recording?.stop();
  stopDisplay();
}
if (!recording) {
  console.error("the scenario never started recording");
  process.exit(1);
}
if (failed) {
  console.error(`partial recording kept for inspection: ${raw}`);
  try {
    await contactSheet(raw, join(work, "raw.contact.png"));
    console.error(`contact sheet: ${join(work, "raw.contact.png")}`);
  } catch {
    console.error("(the partial recording is too short for a contact sheet)");
  }
  process.exit(1);
}

// ---- compose ----
const cards = scenario.cards[lang];
const intro = join(work, "intro.png");
const outro = join(work, "outro.png");
if (!thumbnailMarked) {
  // composeVideo below reports an unreadable duration; take the first frame meanwhile.
  const seconds = duration(raw);
  await extractFrame(raw, Number.isFinite(seconds) ? seconds / 2 : 0, thumbFrame);
}
mkdirSync(out, { recursive: true });
const thumbnail = join(out, `${name}.${lang}.thumbnail.png`);
await renderCards([
  { card: cards.intro, out: intro },
  { card: { ...cards.intro, sub: cards.outroSub }, out: outro },
  { card: cards.intro, out: thumbnail, frame: thumbFrame, lang },
]);
const video = join(out, `${name}.${lang}.mp4`);
await composeVideo({ intro, raw, outro, out: video });
const sheet = join(out, `${name}.${lang}.contact.png`);
await contactSheet(video, sheet);
console.log(`video: ${video}\nthumbnail: ${thumbnail}\ncontact sheet: ${sheet}`);
