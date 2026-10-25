/* eslint-disable no-console -- CLI entry point; it reports progress on stdout */
// Records one demo-video scenario to a captioned 1920x1080 MP4 (Issue #3355).
//
//   pnpm demo-video:record <scenario> [--lang en|ja] [--out <dir>]
//
// <scenario> is a file name under scenarios/ without its extension. The run copies the
// scenario's fixture model for the language to a scratch dir, records the virtual
// display while the scenario drives the app or VS Code, then wraps the recording in
// intro / outro title cards. Writes <out>/<scenario>.<lang>.mp4 and a contact sheet
// <out>/<scenario>.<lang>.contact.png for reviewing the frames. <out> defaults to the
// gitignored dist/ of the main checkout, also when run from a worktree, so the videos
// outlive the worktree. Scratch files go to the OS temp dir.
//
// The workflow, the prerequisites and the pitfalls are in .claude/skills/demo-video/SKILL.md.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { composeVideo, contactSheet, renderCards } from "./lib/compose.mts";
import { ensureDisplay, type Recording, startRecording } from "./lib/display.mts";
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
    out: { type: "string", default: join(mainCheckout, "dist") },
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
const lang: Lang = args.lang === "ja" ? "ja" : "en";
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
const fonts = execFileSync("fc-list").toString();
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

const stopDisplay = await ensureDisplay();
let recording: Recording | undefined;
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
  contactSheet(raw, join(work, "raw.contact.png"));
  console.error(`contact sheet: ${join(work, "raw.contact.png")}`);
  process.exit(1);
}

// ---- compose ----
const cards = scenario.cards[lang];
const intro = join(work, "intro.png");
const outro = join(work, "outro.png");
await renderCards([
  [cards.intro, intro],
  [{ ...cards.intro, sub: cards.outroSub }, outro],
]);
mkdirSync(out, { recursive: true });
const video = join(out, `${name}.${lang}.mp4`);
composeVideo({ intro, raw, outro, out: video });
const sheet = join(out, `${name}.${lang}.contact.png`);
contactSheet(video, sheet);
console.log(`video: ${video}\ncontact sheet: ${sheet}`);
