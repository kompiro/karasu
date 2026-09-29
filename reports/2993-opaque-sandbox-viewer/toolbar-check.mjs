import { chromium } from "/workspaces/karasu/.claude/worktrees/spike/2993-opaque-sandbox-viewer/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 }, locale: "en-US" })).newPage();
const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
await p.goto("http://localhost:4700/g/small/view");
await p.waitForSelector(".preview-container svg");
const state = () => p.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  exportLabel: [...document.querySelectorAll("button")].map((x) => x.textContent.trim()).find((x) => /SVG/.test(x)),
}));
const r = { initial: await state() };
await p.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
await p.waitForTimeout(300);
r.afterTheme = await state();
await p.getByRole("button", { name: /Switch to English|日本語に切り替える/ }).click();
await p.waitForTimeout(300);
r.afterLocale = await state();
await p.screenshot({ path: "toolbar-switches.png" });
r.errs = errs;
console.log(JSON.stringify(r));
await b.close();
