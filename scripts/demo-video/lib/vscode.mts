// VS Code with the karasu extension, driven over CDP. ExTester is not used: its
// ChromeDriver does not run on the arm64 devcontainer, and a demo needs a real window
// on the recorded display anyway.

import { type Browser, chromium, type Frame, type Locator, type Page } from "@playwright/test";
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { closeSync, cpSync, mkdirSync, openSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { DISPLAY, type Point, registerCleanup, SCREEN, sleep } from "./display.mts";

const CDP_PORT = 9333;

/** Settings that keep the recording calm: no welcome page, suggestion popups or chat. */
const SETTINGS = {
  "workbench.startupEditor": "none",
  "workbench.tips.enabled": false,
  "workbench.welcomePage.walkthroughs.openOnInstall": false,
  "security.workspace.trust.enabled": false,
  "telemetry.telemetryLevel": "off",
  "update.mode": "none",
  "extensions.ignoreRecommendations": true,
  "chat.disableAIFeatures": true,
  "workbench.secondarySideBar.defaultVisibility": "hidden",
  "window.commandCenter": false,
  "workbench.layoutControl.enabled": false,
  "window.restoreWindows": "none",
  "files.hotExit": "off",
  "git.enabled": false,
  "workbench.colorTheme": "Default Light Modern",
  "window.zoomLevel": 0.5,
  "editor.fontSize": 16,
  "editor.minimap.enabled": false,
  "editor.stickyScroll.enabled": false,
  "breadcrumbs.enabled": false,
  "workbench.editor.enablePreview": false,
  // Typed text must land exactly as written: no auto-closed brackets or quotes, and
  // Enter keeps the previous line's indent (so type lines without leading spaces).
  "editor.autoClosingBrackets": "never",
  "editor.autoClosingQuotes": "never",
  "editor.autoIndent": "keep",
  "editor.quickSuggestions": { other: "off", comments: "off", strings: "off" },
  "editor.suggestOnTriggerCharacters": false,
  "editor.wordBasedSuggestions": "off",
  "editor.hover.enabled": false,
  "editor.parameterHints.enabled": false,
  "editor.lightbulb.enabled": "off",
};

/** Downloads (once) the stable VS Code build for this machine via @vscode/test-electron. */
export async function vscodeExecutable(repo: string): Promise<string> {
  const req = createRequire(join(repo, "packages", "vscode-e2e", "package.json"));
  const { downloadAndUnzipVSCode } = req("@vscode/test-electron") as {
    downloadAndUnzipVSCode(opts: { version: string; cachePath: string }): Promise<string>;
  };
  // The downloader creates only the last path segment, not its parents.
  const cachePath = join(homedir(), ".cache", "karasu-demo-video", "vscode");
  mkdirSync(cachePath, { recursive: true });
  return downloadAndUnzipVSCode({ version: "stable", cachePath });
}

export interface CodeWindow {
  win: Page;
  browser: Browser;
  close(): Promise<void>;
}

/**
 * Launches VS Code on `workspace` with the extension at `extensionPath` loaded as a
 * development extension (the title bar says "[Extension Development Host]"), a fresh
 * user-data dir under `userDataDir`, and the window resized to fill the display.
 */
export async function launchCode(opts: {
  executable: string;
  extensionPath: string;
  userDataDir: string;
  workspace: string;
  log?: string;
}): Promise<CodeWindow> {
  rmSync(opts.userDataDir, { recursive: true, force: true });
  mkdirSync(join(opts.userDataDir, "User"), { recursive: true });
  writeFileSync(join(opts.userDataDir, "User", "settings.json"), JSON.stringify(SETTINGS, null, 1));
  // A shell started from the VS Code server carries ELECTRON_RUN_AS_NODE=1, which turns
  // the `code` launcher into plain node ("bad option: --extensionDevelopmentPath").
  const env = Object.fromEntries(
    Object.entries({ ...process.env, DISPLAY }).filter(
      ([k]) => !k.startsWith("ELECTRON_") && !k.startsWith("VSCODE_"),
    ),
  );
  // A VS Code left over from an earlier run would answer on the CDP port and be driven
  // (and resized) instead of the one launched here.
  try {
    await (await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)).close();
    throw new Error(`port ${CDP_PORT} is taken (a VS Code left from an earlier run?)`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith(`port ${CDP_PORT}`)) throw e;
  }
  const logFd = openSync(opts.log ?? "/dev/null", "w");
  const proc: ChildProcess = spawn(
    opts.executable,
    [
      `--extensionDevelopmentPath=${opts.extensionPath}`,
      `--user-data-dir=${opts.userDataDir}`,
      `--extensions-dir=${join(opts.userDataDir, "ext")}`,
      "--disable-workspace-trust",
      "--skip-welcome",
      "--skip-release-notes",
      "--disable-gpu",
      "--no-sandbox",
      // The devcontainer's /dev/shm is 64 MB; without this the renderer dies with
      // "No space left on device" partway through a recording.
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${CDP_PORT}`,
      "--new-window",
      opts.workspace,
    ],
    { env, stdio: ["ignore", logFd, logFd] },
  );
  const stop = () => {
    proc.kill();
    closeSync(logFd);
  };
  const unregister = registerCleanup(stop);

  let browser: Browser | undefined;
  try {
    for (let i = 0; i < 60 && !browser; i++) {
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
      } catch {
        await sleep(500);
      }
    }
    if (!browser) throw new Error("VS Code did not open its CDP port");
    let win: Page | undefined;
    for (let i = 0; i < 120 && !win; i++) {
      win = browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url().includes("workbench.html"));
      if (!win) await sleep(500);
    }
    if (!win) throw new Error("VS Code workbench window did not appear");
    await win.waitForSelector(".monaco-workbench");

    // CDP's Browser.setWindowBounds does not exist in Electron; resize the X window.
    const xenv = { ...process.env, DISPLAY };
    const ids = execFileSync(
      "xdotool",
      ["search", "--onlyvisible", "--name", "Visual Studio Code"],
      {
        env: xenv,
      },
    )
      .toString()
      .trim()
      .split("\n");
    for (const id of ids) {
      execFileSync(
        "xdotool",
        ["windowmove", id, "0", "0", "windowsize", id, String(SCREEN.width), String(SCREEN.height)],
        { env: xenv },
      );
    }
    await sleep(1500);
    const connected = browser;
    return {
      win,
      browser: connected,
      // Kill the process instead of closing through CDP: a CDP close asks VS Code to
      // close the window, which raises "save changes?" for the unsaved demo edits.
      close: async () => {
        unregister();
        stop();
        await sleep(1000);
      },
    };
  } catch (e) {
    unregister();
    stop();
    throw e;
  }
}

/** Copies a fixture to a fresh workspace dir. */
export function freshWorkspace(fixture: string, dir: string): string {
  rmSync(dir, { recursive: true, force: true });
  cpSync(fixture, dir, { recursive: true });
  return dir;
}

/**
 * The frame that hosts the karasu viewer. The webview is rebuilt once right after the
 * preview opens, so a Frame held across steps goes stale ("Target closed"): look it up
 * again for every step (see `inViewer`).
 */
export async function viewerFrame(win: Page): Promise<Frame> {
  for (let i = 0; i < 60; i++) {
    for (const f of win.frames()) {
      try {
        if (await f.locator(".preview-container").count()) return f;
      } catch {
        // detached while we looked; try the next one
      }
    }
    await sleep(500);
  }
  throw new Error("karasu viewer frame not found");
}

/** Runs `fn` against a freshly resolved viewer frame, retrying while the webview reloads. */
export async function inViewer<T>(win: Page, fn: (f: Frame) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(await viewerFrame(win));
    } catch (e) {
      if (attempt >= 6) throw e;
      await sleep(700);
    }
  }
}

/**
 * Screen point of a client-coordinate point inside `frame`. The viewer sits two
 * iframes deep in the workbench, and Playwright's boundingBox does not add their
 * offsets for these out-of-process frames, so walk the frame chain ourselves and
 * scale by the window's zoom (devicePixelRatio).
 */
export async function toScreen(frame: Frame, pt: Point): Promise<Point> {
  let { x, y } = pt;
  let fr: Frame = frame;
  for (let parent = fr.parentFrame(); parent; parent = fr.parentFrame()) {
    const el = await fr.frameElement();
    const r = await el.evaluate((e) => {
      const b = (e as Element).getBoundingClientRect();
      return { x: b.x, y: b.y };
    });
    x += r.x;
    y += r.y;
    fr = parent;
  }
  const dpr = await fr.evaluate(() => devicePixelRatio);
  return { x: Math.round(x * dpr), y: Math.round(y * dpr) };
}

/** Screen point of a locator's center inside `frame`. */
export async function centerIn(frame: Frame, locator: Locator): Promise<Point> {
  const r = await locator.evaluate((e) => {
    const b = e.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  return toScreen(frame, r);
}

/**
 * Screen point at fraction `t` along an edge's drawn line. An edge's group box is
 * mostly empty space, so its center rarely lies on the line; right-clicking there
 * hits whatever edge crosses it instead. Pick `t` away from other edges' crossings.
 */
export async function edgePoint(frame: Frame, from: string, to: string, t = 0.5): Promise<Point> {
  const group = frame
    .locator(`[data-edge-canonical-id][data-edge-from="${from}"][data-edge-to="${to}"]`)
    .first();
  const r = await group.evaluate((el, frac) => {
    const lines = [...el.querySelectorAll<SVGGeometryElement>("path, line, polyline")].filter(
      (p) => typeof p.getTotalLength === "function" && p.getTotalLength() > 20,
    );
    const longest = lines.sort((a, b) => b.getTotalLength() - a.getTotalLength())[0];
    if (!longest) throw new Error("edge has no drawn line");
    const pt = longest.getPointAtLength(longest.getTotalLength() * frac);
    const m = longest.getScreenCTM();
    if (!m) throw new Error("edge has no CTM");
    return { x: pt.x * m.a + pt.y * m.c + m.e, y: pt.x * m.b + pt.y * m.d + m.f };
  }, t);
  return toScreen(frame, r);
}

/** Editor keyboard helpers bound to one window. */
export function editorKeys(win: Page) {
  const kb = win.keyboard;
  // Clicking the preview leaves focus in the webview: without this, Ctrl+P / Ctrl+G
  // act on the preview's editor group and typed text goes into the wrong place.
  const focusFirstGroup = async () => {
    await kb.press("Control+1");
    await sleep(400);
  };
  return {
    focusFirstGroup,
    async quickOpen(name: string) {
      await focusFirstGroup();
      await kb.press("Control+p");
      await sleep(500);
      await kb.type(name, { delay: 40 });
      await sleep(600);
      await kb.press("Enter");
      await sleep(900);
    },
    async command(title: string) {
      await kb.press("F1");
      await sleep(500);
      await kb.type(title, { delay: 35 });
      await sleep(700);
      await kb.press("Enter");
    },
    /** Puts the caret at the end of line `n` of the active editor. */
    async lineEnd(n: number) {
      await focusFirstGroup();
      await kb.press("Control+g");
      await sleep(700);
      await kb.type(String(n), { delay: 80 });
      await sleep(500);
      await kb.press("Enter");
      await sleep(500);
      await kb.press("End");
      await sleep(200);
    },
    /** Opens a new line below the caret and types `text` (no leading indent). */
    async typeLine(text: string, delay = 65) {
      await kb.press("Enter");
      await kb.type(text, { delay });
    },
  };
}
