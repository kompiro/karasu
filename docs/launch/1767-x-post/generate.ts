// Regenerate the launch composite image (karasu-launch.png) for #1767.
//
// The image is a mock of the karasu app window: the JetBrains-mono editor pane
// (karasu-dark theme, ported from packages/app/src/components/EditorPane.tsx)
// showing assets/payment-platform.excerpt.krs, next to the system view rendered
// from examples/ja/payment-platform (assets/system-view.svg). Sources live in
// ./assets/, so the image cannot silently drift from the code / diagram it shows.
//
// Prerequisites:
//   - a CJK font so Chromium renders the Japanese labels (e.g. `fonts-noto-cjk`)
//   - Playwright's Chromium — run from packages/e2e where it is installed:
//       pnpm --filter @karasu-tools/e2e exec tsx ../../docs/launch/1767-x-post/generate.ts
//   - ImageMagick for the retina downscale (see the `convert` line below)
//
// Output: assets/karasu-launch@2x.png (3200x1800). Downscale to the committed
// 1600x900 asset with:
//   convert assets/karasu-launch@2x.png -resize 1600x900 assets/karasu-launch.png

import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const asset = (p: string) => resolve(DIR, "assets", p);

// --- karasu-dark editor theme (packages/app/src/components/EditorPane.tsx) ---
const KEYWORDS = new Set([
  "system", "service", "client", "domain", "usecase", "resource", "user", "role",
  "description", "team", "link", "deploy", "war", "jar", "oci", "lambda", "function",
  "assets", "job", "artifact", "store", "runtime", "realizes", "schedule", "image",
  "type", "import", "from",
]);
const C = {
  keyword: "#7dd3fc", annotation: "#fbbf24", string: "#86efac", comment: "#64748b",
  operator: "#f472b6", identifier: "#e2e8f0", bracket: "#94a3b8",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function span(tok: keyof typeof C, text: string): string {
  return `<span style="color:${C[tok]};${tok === "keyword" ? "font-weight:700;" : ""}">${esc(text)}</span>`;
}

// Port of the .krs monarch tokenizer (root state), line by line.
function highlight(src: string): string {
  return src.split("\n").map((line) => {
    let out = "", i = 0;
    while (i < line.length) {
      const rest = line.slice(i);
      let m: RegExpMatchArray | null;
      if ((m = rest.match(/^\/\/.*$/))) { out += span("comment", m[0]); break; }
      if ((m = rest.match(/^"[^"]*"/))) { out += span("string", m[0]); i += m[0].length; continue; }
      if ((m = rest.match(/^-->|^->/))) { out += span("operator", m[0]); i += m[0].length; continue; }
      if ((m = rest.match(/^@\w+/))) { out += m[0] === "@import" ? span("keyword", m[0]) : span("annotation", m[0]); i += m[0].length; continue; }
      if ((m = rest.match(/^[{}\[\]]/))) { out += span("bracket", m[0]); i += 1; continue; }
      if ((m = rest.match(/^[A-Za-z_][\w-]*/))) { out += span(KEYWORDS.has(m[0]) ? "keyword" : "identifier", m[0]); i += m[0].length; continue; }
      out += esc(line[i]); i += 1;
    }
    return out;
  }).join("\n");
}

const code = readFileSync(asset("payment-platform.excerpt.krs"), "utf8").replace(/\n$/, "");
const codeLines = highlight(code).split("\n");
const gutter = codeLines.map((_, n) => `<div>${n + 1}</div>`).join("");
const codeHtml = codeLines.map((l) => `<div>${l || "&nbsp;"}</div>`).join("");
const svg = readFileSync(asset("system-view.svg"), "utf8");
const crow = readFileSync(asset("crow.png")).toString("base64");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  :root { --void:#080b12; --chrome:#131217; --pane:#0f172a; --border:#243149; --textp:#dce8ff; --texts:#7b92b4; --accent:#7dd3fc; }
  body { width:1600px; height:900px;
    background:radial-gradient(1200px 700px at 78% -10%, #10203a 0%, transparent 60%), var(--void);
    font-family:'Noto Sans CJK JP','Noto Sans',system-ui,sans-serif; overflow:hidden; }
  .stage { padding:44px 48px 40px; height:100%; display:flex; flex-direction:column; }
  .window { flex:1; border:1px solid var(--border); border-radius:16px; overflow:hidden; background:var(--pane);
    box-shadow:0 40px 90px -30px rgba(0,0,0,.8), 0 0 0 1px rgba(125,211,252,.04); display:flex; flex-direction:column; }
  .titlebar { height:60px; background:var(--chrome); border-bottom:1px solid var(--border); display:flex; align-items:center; padding:0 22px; gap:14px; flex-shrink:0; }
  .brand { display:flex; align-items:center; gap:11px; }
  .brand img { height:40px; display:block; }
  .brand .wm { font-size:23px; font-weight:800; letter-spacing:.06em; background:linear-gradient(180deg,#eaf3ff,#7dd3fc); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .brand .kanji { font-size:22px; font-weight:700; color:#bcdcff; margin-right:-3px; }
  .tab { margin-left:10px; display:flex; align-items:center; gap:8px; height:34px; padding:0 15px; background:var(--pane); border:1px solid var(--border); border-radius:9px 9px 0 0; border-bottom:none; color:var(--textp); font-size:14px; font-family:'JetBrains Mono',ui-monospace,monospace; }
  .tab .dot { width:8px; height:8px; border-radius:50%; background:var(--accent); box-shadow:0 0 8px var(--accent); }
  .spacer { flex:1; }
  .badge { font-size:13.5px; color:var(--texts); letter-spacing:.02em; }
  .badge b { color:var(--accent); font-weight:600; }
  .split { flex:1; display:flex; min-height:0; }
  .editor { width:600px; flex-shrink:0; background:var(--pane); border-right:1px solid var(--border); display:flex; font-family:'JetBrains Mono',ui-monospace,'Noto Sans CJK JP',monospace; font-size:14px; line-height:23px; }
  .gutter { padding:22px 0; text-align:right; color:#3a475f; user-select:none; width:46px; flex-shrink:0; font-variant-numeric:tabular-nums; }
  .code { padding:22px 20px 22px 16px; color:var(--identifier); white-space:pre; overflow:hidden; }
  .preview { flex:1; position:relative; display:flex; align-items:center; justify-content:center; padding:22px 24px; min-width:0; }
  .preview .hint { position:absolute; bottom:14px; right:20px; font-size:12.5px; color:#4a5a76; }
  .preview svg { width:100%; height:auto; max-height:100%; border-radius:8px; }
  .caption { flex-shrink:0; display:flex; align-items:baseline; justify-content:space-between; padding:20px 6px 0; }
  .caption .lead { font-size:20px; color:var(--textp); font-weight:600; letter-spacing:.01em; }
  .caption .lead b { color:var(--accent); font-weight:800; }
  .caption .url { font-size:16px; color:var(--texts); font-family:'JetBrains Mono',monospace; letter-spacing:.02em; }
</style></head><body>
  <div class="stage">
    <div class="window">
      <div class="titlebar">
        <div class="brand"><img src="data:image/png;base64,${crow}"/><span class="kanji">鴉</span><span class="wm">karasu</span></div>
        <div class="tab"><span class="dot"></span>payment-platform.krs</div>
        <div class="spacer"></div>
        <div class="badge">text&nbsp;&nbsp;→&nbsp;&nbsp;<b>system view</b></div>
      </div>
      <div class="split">
        <div class="editor"><div class="gutter">${gutter}</div><div class="code">${codeHtml}</div></div>
        <div class="preview">${svg}<div class="hint">同じモデルから deploy / org ビューも生成</div></div>
      </div>
    </div>
    <div class="caption">
      <div class="lead">アーキテクチャを、<b>テキストで書く。</b>論理と物理を分けて描く .krs 言語</div>
      <div class="url">karasu.pages.dev</div>
    </div>
  </div>
</body></html>`;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.waitForTimeout(200);
  await page.screenshot({ path: asset("karasu-launch@2x.png") });
  await browser.close();
  console.log("wrote assets/karasu-launch@2x.png (downscale to karasu-launch.png — see header)");
}
main();
