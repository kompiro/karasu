// Opens each sample in the local spike app, one shot per mode, and reports the switcher and labels.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const out = execFileSync("pnpm", ["exec", "tsx", resolve(here, "links.ts"), "http://localhost:5199"], { encoding: "utf8" });
const links = [...out.matchAll(/^\s+(off|position|arrow): (\S+)$/gm)].map((m) => ({ mode: m[1], url: m[2] }));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
for (const [i, l] of links.entries()) {
  await page.goto(l.url);
  await page.waitForSelector("svg [data-edge-from]", { timeout: 30000 });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => ({
    switcher: document.querySelector('[data-spike="pair-cue"]')?.textContent,
    edges: document.querySelectorAll("svg [data-edge-from]").length,
    arrows: [...document.querySelectorAll("svg [data-edge-from] text")].filter((t) => /^[→↘↓↙←↖↑↗] /.test(t.textContent ?? "")).length,
  }));
  console.log(i, l.mode, info);
  await page.screenshot({ path: resolve(here, `local-${i}-${l.mode}.png`) });
}
console.log({ errors });
await browser.close();
