// A headed Chromium window that fills the virtual display, for scenes in the karasu app
// (`karasu serve` or the hosted app).

import { type BrowserContext, chromium, type Locator, type Page } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DISPLAY, type Point, SCREEN } from "./display.mts";

/** Device scale of the window. 1.25 keeps diagram labels readable at 1080p. */
export const BROWSER_SCALE = 1.25;

export interface AppBrowser {
  context: BrowserContext;
  page: Page;
  close(): Promise<void>;
}

/**
 * Kiosk mode: no tab strip or address bar, which leaves room for the diagram (say a
 * URL in a caption when it matters). Window size is in DIP, so it is the screen
 * divided by the scale.
 */
export async function launchAppBrowser(profileDir: string, lang: "en" | "ja"): Promise<AppBrowser> {
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(join(profileDir, "Default"), { recursive: true });
  // The "translate this page?" bubble ignores --disable-features; only the profile
  // preference keeps it away.
  writeFileSync(
    join(profileDir, "Default", "Preferences"),
    JSON.stringify({ translate: { enabled: false }, translate_blocked_languages: ["en", "ja"] }),
  );
  const width = Math.round(SCREEN.width / BROWSER_SCALE);
  const height = Math.round(SCREEN.height / BROWSER_SCALE);
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: null,
    locale: lang === "ja" ? "ja-JP" : "en-US",
    env: { ...process.env, DISPLAY },
    args: [
      "--window-position=0,0",
      `--window-size=${width},${height}`,
      `--force-device-scale-factor=${BROWSER_SCALE}`,
      `--lang=${lang === "ja" ? "ja" : "en-US"}`,
      "--disable-features=Translate,TranslateUI",
      "--no-first-run",
      "--kiosk",
    ],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page, close: () => context.close() };
}

/** Screen point of a locator's center in the kiosk window. */
export async function screenCenter(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`no bounding box for ${locator}`);
  return {
    x: Math.round((box.x + box.width / 2) * BROWSER_SCALE),
    y: Math.round((box.y + box.height / 2) * BROWSER_SCALE),
  };
}
