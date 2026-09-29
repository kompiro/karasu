import { chromium } from "/workspaces/karasu/.claude/worktrees/spike/2993-opaque-sandbox-viewer/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
import { start } from "./server.mjs";
const browser = await chromium.launch();
const out = {};
for (const [label, opts, port] of [["sandbox", { sandbox: true, assetCors: true }, 4620], ["baseline", { sandbox: false, assetCors: true }, 4621]]) {
  const server = await start(port, opts);
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(`http://localhost:${port}/g/small/view`);
  await page.waitForSelector(".preview-container svg");
  const r = {};
  // Leaf node click -> detail panel: try leaf candidates until the DOM grows
  const leaves = page.locator(".preview-container g[data-node-id]:not([data-has-children='true'])");
  r.leafCandidates = await leaves.count();
  r.detailPanelDomDelta = 0;
  for (let i = 0; i < Math.min(r.leafCandidates, 6) && r.detailPanelDomDelta <= 0; i++) {
    const box = await leaves.nth(i).boundingBox();
    if (!box) continue;
    const before = await page.locator("body *").count();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(500);
    r.detailPanelDomDelta = (await page.locator("body *").count()) - before;
    r.detailPanelLeaf = await leaves.nth(i).getAttribute("data-node-id");
  }
  await page.screenshot({ path: `detail-${label}.png` });
  await page.mouse.click(5, 300);
  // Edge hover -> the CSS widens the edge's line/polyline
  const edges = page.locator(".preview-container .krs-edge--interactive");
  r.interactiveEdges = await edges.count();
  if (r.interactiveEdges) {
    const stroke = () => edges.first().evaluate((el) => {
      const s = el.querySelector("line:not(.krs-edge__hitline), polyline:not(.krs-edge__hitline)");
      return s ? getComputedStyle(s).strokeWidth : "n/a";
    });
    const before = await stroke();
    const box = await edges.first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await edges.first().hover({ force: true });
    await page.waitForTimeout(300);
    r.edgeHoverStroke = `${before} -> ${await stroke()}`;
  }
  // Export SVG -> download
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 5000 }),
      page.getByRole("button", { name: /Export SVG|SVG をエクスポート/ }).first().click(),
    ]);
    r.download = download.suggestedFilename();
  } catch (e) { r.download = `none (${String(e).slice(0, 80)})`; }
  r.pageErrors = errors;
  await page.screenshot({ path: `interactions-${label}.png` });
  out[label] = r;
  await context.close();
  server.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 2));
