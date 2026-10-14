/* eslint-disable no-console -- CLI entry point; it reports progress on stdout */
// Records the README demo (Issue #3175): a sped-up replay of a reverse-architecture run
// (intro.html), then the karasu app over the model that run produced.
//
//   pnpm readme-demo:record --url http://localhost:3000/ --out <dir> --lang en
//
// The model is not in this repository (it describes a private system), so serve your copy
// with `karasu serve <dir>` and pass that URL. The scenes below select nodes by id, so the
// ids in SCENE must exist in the served model.
//
// Frames come from the CDP screencast, which emits a frame only when the page changes: a
// still scene costs one frame, and make-gif.mts turns the timestamps into frame delays.
// Writes <out>/frames/NNNNN.png, <out>/frames.json and <out>/marks.json.

import { chromium, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));

const { values: args } = parseArgs({
  options: {
    url: { type: "string" },
    out: { type: "string" },
    lang: { type: "string", default: "en" },
    "no-captions": { type: "boolean", default: false },
  },
});
if (!args.url || !args.out) {
  console.error(
    "usage: record.mts --url <karasu serve URL> --out <dir> [--lang en|ja] [--no-captions]",
  );
  process.exit(1);
}
const url = args.url;
const out = args.out;
const lang = args.lang === "ja" ? "ja" : "en";
const captionsOn = !args["no-captions"];

/** Node ids of the served model that the scenes walk through. */
const SCENE = {
  rootService: "HatoApp",
  rootLabel: "AI journaling system",
  firstDomain: "Conversation",
  focusNode: "Memory",
  focusEdgeFrom: "Conversation",
  zoomUsecase: "ProcessGenerationJob",
};

type CaptionKey = "intro" | "whole" | "drill" | "node" | "edge" | "usecases" | "deploy" | "end";
const CAPTIONS = JSON.parse(readFileSync(join(here, `captions.${lang}.json`), "utf8")) as Record<
  CaptionKey,
  [string, string]
>;

const W = 1280;
const H = 720;
rmSync(join(out, "frames"), { recursive: true, force: true });
mkdirSync(join(out, "frames"), { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: W, height: H },
  colorScheme: "dark",
  locale: lang === "ja" ? "ja-JP" : "en-US",
});

// Overlays every page gets: a cursor (the screencast does not draw the OS pointer) with a
// click ring, the caption card, and a veil that hides the page navigation.
await context.addInitScript((captions: boolean) => {
  addEventListener("DOMContentLoaded", () => {
    const cursor = document.createElement("div");
    cursor.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 13.8 L10.5 20 L13 18.8 L10 12.8 L16 12.8 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(cursor.style, {
      position: "fixed",
      left: "0",
      top: "0",
      zIndex: "2147483647",
      pointerEvents: "none",
      transform: "translate(-100px,-100px)",
    });
    const ring = document.createElement("div");
    Object.assign(ring.style, {
      position: "fixed",
      width: "36px",
      height: "36px",
      borderRadius: "50%",
      border: "3px solid #60a5fa",
      zIndex: "2147483646",
      pointerEvents: "none",
      opacity: "0",
    });
    const cap = document.createElement("div");
    cap.innerHTML = '<div class="m"></div><div class="s"></div>';
    Object.assign(cap.style, {
      position: "fixed",
      left: "0",
      right: "0",
      margin: "0 auto",
      width: "fit-content",
      maxWidth: "1100px",
      bottom: "44px",
      zIndex: "2147483645",
      pointerEvents: "none",
      background: "rgba(15,23,42,.92)",
      border: "1px solid #334155",
      borderRadius: "12px",
      padding: "12px 26px 13px",
      textAlign: "center",
      fontFamily: 'Inter, "Noto Sans JP", "DejaVu Sans", system-ui, sans-serif',
      opacity: "0",
      transition: "opacity .25s",
      boxShadow: "0 10px 30px rgba(0,0,0,.5)",
    });
    const main = cap.querySelector<HTMLElement>(".m")!;
    const sub = cap.querySelector<HTMLElement>(".s")!;
    Object.assign(main.style, { color: "#f8fafc", fontSize: "28px", fontWeight: "700" });
    Object.assign(sub.style, { color: "#94a3b8", fontSize: "18px", marginTop: "4px" });
    const veil = document.createElement("div");
    Object.assign(veil.style, {
      position: "fixed",
      inset: "0",
      background: "#0b1020",
      zIndex: "2147483644",
      pointerEvents: "none",
      opacity: "0",
      transition: "opacity .2s",
    });
    document.body.append(veil, cap, ring, cursor);

    const w = window as unknown as Record<string, unknown>;
    w.__veil = (on: boolean) => {
      veil.style.opacity = on ? "1" : "0";
    };
    w.__caption = (m: string, s: string) => {
      if (!captions) return;
      cap.style.opacity = "0";
      setTimeout(
        () => {
          main.textContent = m;
          sub.textContent = s;
          cap.style.opacity = "1";
        },
        cap.dataset.shown ? 220 : 0,
      );
      cap.dataset.shown = "1";
    };
    addEventListener(
      "mousemove",
      (e) => {
        cursor.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`;
      },
      true,
    );
    addEventListener(
      "mousedown",
      (e) => {
        ring.style.transition = "none";
        ring.style.left = `${e.clientX - 18}px`;
        ring.style.top = `${e.clientY - 18}px`;
        ring.style.opacity = "1";
        ring.style.transform = "scale(.5)";
        requestAnimationFrame(() => {
          ring.style.transition = "opacity .45s, transform .45s";
          ring.style.opacity = "0";
          ring.style.transform = "scale(1.3)";
        });
      },
      true,
    );
  });
}, captionsOn);

const page: Page = await context.newPage();

const caption = (key: CaptionKey) =>
  page.evaluate(([m, s]) => {
    (window as unknown as { __caption?: (m: string, s: string) => void }).__caption?.(m, s);
  }, CAPTIONS[key]);
const veil = (on: boolean) =>
  page.evaluate((v) => {
    (window as unknown as { __veil: (on: boolean) => void }).__veil(v);
  }, on);
const canvas = () => page.locator(".preview-container").first();

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
async function canvasBox(): Promise<Box> {
  const box = await canvas().boundingBox();
  if (!box) throw new Error("preview canvas is not on screen");
  return box;
}

/** Current zoom scale and the screen rect covering every drawn node. */
function measure() {
  return page.evaluate(() => {
    const inner = document.querySelector<HTMLElement>(".preview-container > div")!;
    const m = /scale\(([\d.]+)\)/.exec(inner.style.transform);
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const el of inner.querySelectorAll("[data-node-id]")) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      x1 = Math.min(x1, b.x);
      y1 = Math.min(y1, b.y);
      x2 = Math.max(x2, b.x + b.width);
      y2 = Math.max(y2, b.y + b.height);
    }
    return {
      scale: m ? Number(m[1]) : 1,
      w: x2 - x1,
      h: y2 - y1,
      cx: (x1 + x2) / 2,
      cy: (y1 + y2) / 2,
    };
  });
}

/** Wheel-zooms toward an absolute scale. Each wheel step is x1.1 or x0.9 around the canvas centre. */
async function zoomTo(target: number, delay = 0) {
  const box = await canvasBox();
  const { scale } = await measure();
  const steps = Math.round(Math.log(target / scale) / Math.log(1.1));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: delay ? 8 : 1 });
  for (let i = 0; i < Math.abs(steps); i++) {
    await page.mouse.wheel(0, steps > 0 ? -100 : 100);
    if (delay) await page.waitForTimeout(delay);
  }
  await page.waitForTimeout(100);
}

/** Drags the canvas so that screen point (x, y) lands on the canvas centre. */
async function panToCentre(x: number, y: number, steps = 6) {
  const box = await canvasBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  let dx = cx - x;
  let dy = cy - y;
  // The pointer has to stay inside the canvas for the whole drag, because onMouseLeave
  // ends a pan. So drag symmetrically around the centre, in pieces of at most 70%.
  while (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
    const k = Math.min(
      1,
      (box.width * 0.7) / Math.abs(dx || 1),
      (box.height * 0.7) / Math.abs(dy || 1),
    );
    const mx = dx * k;
    const my = dy * k;
    await page.mouse.move(cx - mx / 2, cy - my / 2);
    await page.mouse.down();
    // PreviewPane keeps `isDragging` in React state, so moves sent before it re-renders are dropped.
    await page.waitForTimeout(60);
    await page.mouse.move(cx + mx / 2, cy + my / 2, { steps });
    await page.waitForTimeout(40);
    await page.mouse.up();
    await page.waitForTimeout(80);
    dx -= mx;
    dy -= my;
  }
}

/** Waits until the view shows `expectId` (when given) and its node set stops changing. */
async function settle(expectId?: string) {
  let last = "";
  let same = 0;
  for (let i = 0; i < 60 && same < 2; i++) {
    await page.waitForTimeout(150);
    const ids = await page.$$eval(".preview-container [data-node-id]", (els) =>
      els
        .filter((e) => e.getBoundingClientRect().width > 0)
        .map((e) => e.getAttribute("data-node-id"))
        .join(","),
    );
    const ok = ids !== "" && (!expectId || ids.split(",").includes(expectId));
    same = ok && ids === last ? same + 1 : 0;
    last = ids;
  }
}

/** Fits every node of the current view into the canvas. The app has no fit-to-screen control. */
async function fit(margin = 0.86, maxScale = 1.4) {
  const box = await canvasBox();
  for (let pass = 0; pass < 2; pass++) {
    const r = await measure();
    const natural = { w: r.w / r.scale, h: r.h / r.scale };
    await zoomTo(
      Math.min(maxScale, (box.width * margin) / natural.w, (box.height * margin) / natural.h),
    );
    const a = await measure();
    await panToCentre(a.cx, a.cy);
  }
}

async function nodeCenter(id: string) {
  const b = await page.locator(`[data-node-id="${id}"]`).first().boundingBox();
  if (!b) throw new Error(`node ${id} is not on screen`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function glideTo(id: string, steps = 22) {
  const p = await nodeCenter(id);
  await page.mouse.move(p.x, p.y, { steps });
  return p;
}

async function clickAt(x: number, y: number, steps = 12) {
  await page.mouse.move(x, y, { steps });
  await page.waitForTimeout(220);
  await page.mouse.down();
  await page.mouse.up();
}

/** Hidden stretches in epoch seconds, the clock of the screencast timestamps. make-gif.mts compresses them. */
const marks: { t: number; hidden: boolean }[] = [];

/** Hides the canvas while it re-fits, so the jump between zoom levels is not recorded. */
async function hideCanvas(hidden: boolean) {
  marks.push({ t: Date.now() / 1000, hidden });
  await page.evaluate((h) => {
    const inner = document.querySelector<HTMLElement>(".preview-container > div")!;
    inner.style.transition = "opacity .18s";
    inner.style.opacity = h ? "0" : "1";
  }, hidden);
  await page.waitForTimeout(200);
}

async function drill(id: string, expectId: string) {
  const p = await glideTo(id);
  await page.waitForTimeout(350);
  await hideCanvas(true);
  await page.mouse.down();
  await page.mouse.up();
  await settle(expectId);
  await fit();
  await hideCanvas(false);
  await page.mouse.move(p.x, p.y);
}

/** Smooth-scrolls the focus canvas body to a fraction of its horizontal scroll range. */
async function scrollFocus(fraction: number, ms: number) {
  await page.evaluate((f) => {
    const b = document.querySelector<HTMLElement>(".focus-canvas__body")!;
    b.scrollTo({ left: (b.scrollWidth - b.clientWidth) * f, behavior: "smooth" });
  }, fraction);
  await page.waitForTimeout(ms);
}

async function boxOf(selector: string) {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`${selector} is not on screen`);
  return b;
}

// --- record ------------------------------------------------------------------------------
const cdp = await context.newCDPSession(page);
const frames: { file: string; t: number }[] = [];
let n = 0;
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  const file = `${String(n++).padStart(5, "0")}.png`;
  writeFileSync(join(out, "frames", file), Buffer.from(data, "base64"));
  frames.push({ file, t: metadata.timestamp ?? Date.now() / 1000 });
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});

// Scene 0: the reverse-architecture run (replay)
await page.goto(pathToFileURL(join(here, "intro.html")).href);
await cdp.send("Page.startScreencast", {
  format: "png",
  maxWidth: W,
  maxHeight: H,
  everyNthFrame: 1,
});
await caption("intro");
await page.waitForFunction(() => document.body.dataset.done === "1", null, { timeout: 30000 });
await page.waitForTimeout(1000);

// Move to the app behind the veil; make-gif.mts compresses this stretch.
marks.push({ t: Date.now() / 1000, hidden: true });
await veil(true);
await page.waitForTimeout(250);
await page.goto(url);
await veil(true);
await page.waitForSelector(`[data-node-id="${SCENE.rootService}"]`, { timeout: 60000 });
await page.click(".warning-panel-header"); // the diagnostics panel collapses to one header row
await page.mouse.move(W - 40, H - 120);
await settle(SCENE.rootService);
await fit();
await caption("whole");
await veil(false);
marks.push({ t: Date.now() / 1000, hidden: false });

// Scene 1: the whole system
await page.waitForTimeout(2400);

// Scene 2: into the service and its domains
await glideTo(SCENE.rootService);
await caption("drill");
await drill(SCENE.rootService, SCENE.firstDomain);
await page.waitForTimeout(1300);

// Scene 3: focus on a node, then on one of its edges
await caption("node");
await glideTo(SCENE.focusNode, 18);
await page.waitForTimeout(500);
{
  const pill = await boxOf(".node-focus-pill");
  await clickAt(pill.x + pill.width / 2, pill.y + pill.height / 2, 10);
}
await page.waitForSelector(".focus-canvas [data-focus-node]");
await page.waitForTimeout(900);
await scrollFocus(1, 1400); // what the node depends on
await scrollFocus(0, 1500); // who depends on it
await caption("edge");
{
  // SVG text is hit-tested on its glyphs only, so aim at the first characters of the label.
  const t = await boxOf(
    `.focus-canvas [data-focus-from="${SCENE.focusEdgeFrom}"][data-focus-to="${SCENE.focusNode}"] text tspan`,
  );
  await clickAt(t.x + 14, t.y + t.height / 2, 14);
}
await page.waitForFunction(() =>
  document.querySelector(".focus-canvas__title")?.textContent?.includes("→"),
);
await page.waitForTimeout(2200);
{
  const close = await boxOf(".focus-canvas__close");
  await clickAt(close.x + close.width / 2, close.y + close.height / 2);
  await page.waitForTimeout(500);
}

// Scene 4: into a domain and its use cases, then zoom in until the cards read
await glideTo(SCENE.firstDomain);
await caption("usecases");
await drill(SCENE.firstDomain, SCENE.zoomUsecase);
await page.waitForTimeout(1200);
{
  const target = await nodeCenter(SCENE.zoomUsecase);
  await panToCentre(target.x, target.y, 16);
  const { scale } = await measure();
  await zoomTo(Math.max(scale * 2.4, 1.1), 60);
  await page.waitForTimeout(1700);
}

// Scene 5: the same model, physical view
await page.mouse.move(W / 2 + 200, 30, { steps: 12 });
await hideCanvas(true);
await caption("deploy");
await page.keyboard.press("Control+2");
await settle();
await fit();
await hideCanvas(false);
await page.waitForTimeout(2200);

// Scene 6: back to the top level, held so the loop restarts calmly
await hideCanvas(true);
await caption("end");
await page.keyboard.press("Control+1");
await page.waitForTimeout(400);
// switching views may already have reset the drill-down; click the crumb only when it is a link
const crumb = page.locator(".breadcrumb-link").filter({ hasText: SCENE.rootLabel });
if (await crumb.count()) await crumb.first().click();
await settle(SCENE.rootService);
await fit();
await hideCanvas(false);
await page.mouse.move(W - 40, H - 120, { steps: 16 });
await page.waitForTimeout(1600);

await cdp.send("Page.stopScreencast");
await page.waitForTimeout(300);
writeFileSync(join(out, "frames.json"), JSON.stringify(frames));
writeFileSync(join(out, "marks.json"), JSON.stringify(marks));
const first = frames[0];
const last = frames.at(-1);
if (!first || !last) throw new Error("the screencast delivered no frames");
console.log(`frames ${frames.length}, duration ${(last.t - first.t).toFixed(1)}s`);
await browser.close();
