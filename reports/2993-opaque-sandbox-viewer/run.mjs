// Spike #2993: does the app preview run as a page-level CSP sandbox (opaque origin)?
import { chromium } from "/workspaces/karasu/.claude/worktrees/spike/2993-opaque-sandbox-viewer/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
import { start, log } from "./server.mjs";

const results = [];
const browser = await chromium.launch();

async function scenario(name, port, serverOpts, model) {
  const server = await start(port, serverOpts);
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") consoleErrors.push(`[${m.type()}] ${m.text()}`.slice(0, 300)); });
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)));
  await page.goto(`http://localhost:${port}/set-cookie`);
  log.length = 0;
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/g/${model}/view`, { waitUntil: "load" });
  let booted = true;
  try { await page.waitForSelector(".preview-container svg", { timeout: 60000 }); } catch { booted = false; }
  const wall = Date.now() - t0;
  const r = { name, model, booted, wallMsToFirstSvg: booted ? wall : null };
  if (booted) {
    Object.assign(r, await page.evaluate(async () => {
      const probe = {};
      probe.origin = self.origin;
      try { probe.cookie = JSON.stringify(document.cookie); } catch (e) { probe.cookie = `throws ${e.name}`; }
      try { localStorage.setItem("x", "1"); probe.localStorage = "ok"; } catch (e) { probe.localStorage = `throws ${e.name}`; }
      try { await navigator.clipboard.writeText("x"); probe.clipboard = "ok"; } catch (e) { probe.clipboard = `throws ${e.name}`; }
      try { const r = await fetch("/echo", { method: "POST", credentials: "include" }); probe.echoFetch = r.status; } catch (e) { probe.echoFetch = `throws ${e.name}: ${e.message}`; }
      probe.marks = window.__spike;
      probe.svgCount = document.querySelectorAll(".preview-container svg").length;
      probe.nodes = document.querySelectorAll(".preview-container [data-node-id]").length;
      return probe;
    }));
    r.echoSeenByServer = [...log];
    // Interactions: drill down, switch tab, open detail
    const drill = page.locator(".preview-container [data-has-children='true']").first();
    r.drillable = await drill.count();
    if (r.drillable) {
      const before = await page.locator(".preview-container [data-node-id]").count();
      await drill.click();
      await page.waitForTimeout(800);
      r.drillDownNodeCountChange = `${before} -> ${await page.locator(".preview-container [data-node-id]").count()}`;
    }
    await page.screenshot({ path: `${name}-${model}.png` });
    for (const tab of ["Deploy", "Org"]) {
      const t = page.getByRole("tab", { name: new RegExp(tab) }).or(page.getByText(tab, { exact: true })).first();
      if (await t.count()) { await t.click(); await page.waitForTimeout(500); }
    }
    r.afterTabsSvg = await page.locator(".preview-container svg").count();
  }
  r.consoleErrors = [...new Set(consoleErrors)].slice(0, 12);
  r.pageErrors = [...new Set(pageErrors)].slice(0, 8);
  results.push(r);
  await context.close();
  server.close();
}

let port = 4610;
await scenario("sandbox-no-asset-cors", port++, { sandbox: true, assetCors: false }, "small");
await scenario("sandbox", port++, { sandbox: true, assetCors: true }, "small");
await scenario("baseline-no-sandbox", port++, { sandbox: false, assetCors: true }, "small");
await scenario("sandbox", port++, { sandbox: true, assetCors: true }, "dify");
await scenario("baseline-no-sandbox", port++, { sandbox: false, assetCors: true }, "dify");
await browser.close();
writeFileSync("results.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
