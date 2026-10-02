// Generates the #3022 spike report: reports/3022-edge-label-disclosure/index.html
// (+ artifact.html, summary.json). Run from the repository root:
//
//   pnpm exec tsx reports/3022-edge-label-disclosure/build.ts
//
// Needs Chromium for the two hover screenshots:
//   pnpm --filter @karasu-tools/e2e install-browsers

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";
import { compile } from "../../packages/core/src/index.ts";
import { dataUri, escapeHtml, pane, reportFragment, reportPage } from "../../scripts/report/index.ts";
import { corpusStats } from "./corpus.ts";
import { captureFocus, type FocusMeasure } from "./focus-capture.ts";
import { measureFocus, measureSvg, readSurface, type FocusMetrics, type Metrics } from "./measure.ts";
import { shortenDomainEdgeLabels } from "./short-labels.ts";

const dir = new URL(".", import.meta.url).pathname;
const repo = new URL("../../", import.meta.url).pathname;
const umami = readFileSync(`${dir}umami.krs`, "utf8");
const { source: short, rewritten } = shortenDomainEdgeLabels(umami);

const edgeStyle = (max: string, display: string) =>
  `edge { label-max-chars: ${max}; label-display: ${display}; }`;

function render(source: string, styleSource: string): string {
  const r = compile(source, { viewPath: ["Umami", "UmamiApp"], diagramType: "system", styleSource });
  const errors = r.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) throw new Error(JSON.stringify(errors));
  return r.svg;
}

interface Variant {
  id: string;
  name: string;
  what: string;
  svg: string;
  m: Metrics;
  focus: FocusMetrics;
}

const variants: Variant[] = (
  [
    ["v0", "V0 現状 (main)", "ラベル全文を edge の中点に描く", umami, edgeStyle("none", "always")],
    ["v1", "V1 writer 側のみ (#3018)", "短い動詞句ラベル、根拠は description へ。renderer は現状のまま", short, edgeStyle("none", "always")],
    ["v2-40", "V2 省略のみ (40 文字)", "canvas では 40 文字で省略、全文は hover の tooltip", umami, edgeStyle("40", "always")],
    ["v2-32", "V2 省略のみ (32 文字)", "canvas では 32 文字で省略", umami, edgeStyle("32", "always")],
    ["v2-24", "V2 省略のみ (24 文字)", "canvas では 24 文字で省略", umami, edgeStyle("24", "always")],
    ["v6-none", "V6 auto (省略なし)", "重ならずに置けるラベルだけ描く", umami, edgeStyle("none", "auto")],
    ["v6-48", "V6 auto + 省略 48 (slice A の既定)", "省略したうえで、置けるラベルだけ描く", umami, edgeStyle("48", "auto")],
    ["v6-40", "V6 auto + 省略 40", "省略したうえで、置けるラベルだけ描く", umami, edgeStyle("40", "auto")],
    ["v6-32", "V6 auto + 省略 32", "省略したうえで、置けるラベルだけ描く", umami, edgeStyle("32", "auto")],
    ["v6-24", "V6 auto + 省略 24", "省略したうえで、置けるラベルだけ描く", umami, edgeStyle("24", "auto")],
    ["v5", "V5 writer 側 + auto", "#3018 の短いラベルに auto を重ねる", short, edgeStyle("40", "auto")],
    ["v4", "V4 hover のみ", "canvas にはラベルを描かない", umami, edgeStyle("none", "hover")],
  ] as const
).map(([id, name, what, source, style]) => {
  const svg = render(source, style);
  return { id, name, what, svg, m: measureSvg(svg), focus: measureFocus(svg) };
});
const v = (id: string): Variant => variants.find((x) => x.id === id)!;

// ── The structure under the labels: who depends on whom ──────────────────────
const surface = readSurface(v("v0").svg);
const degree = surface.nodes
  .map((n) => ({
    id: n.id,
    out: surface.edges.filter((e) => e.from === n.id).length,
    in: surface.edges.filter((e) => e.to === n.id).length,
  }))
  .sort((a, b) => b.in + b.out - (a.in + a.out));
const pairKey = (a: string, b: string) => [a, b].sort().join("↔");
const directed = new Set(surface.edges.map((e) => `${e.from}->${e.to}`));
const mutualPairs = new Set(
  surface.edges.filter((e) => directed.has(`${e.to}->${e.from}`)).map((e) => pairKey(e.from, e.to)),
);
const unorderedPairs = new Set(surface.edges.map((e) => pairKey(e.from, e.to)));
const hubs = degree.slice(0, 2).map((d) => d.id);
const hubEdges = surface.edges.filter((e) => hubs.includes(e.from) || hubs.includes(e.to)).length;

const corpus = corpusStats(`${repo}examples`);

// ── The hover tiers, live in the report and as screenshots ───────────────────
// The edge rules are sliced out of the app's stylesheet, so the report cannot
// drift from what the preview does.
const previewCss = readFileSync(`${repo}packages/app/src/styles/components/preview.css`, "utf8");
const edgeCss = previewCss.slice(
  previewCss.indexOf(".preview-container svg .krs-edge--interactive {"),
  previewCss.indexOf("/* ── Preview Toolbar"),
);
if (!edgeCss.includes("edge-label-tip")) throw new Error("edge disclosure rules not found in preview.css");
// The app's theme tokens the sliced rules read, pinned to the dark theme.
const tokens =
  ".preview-container { position: relative; --bg-raised: #172035; --border-strong: rgba(255, 255, 255, 0.15);" +
  " --shadow-dropdown: 0 4px 12px rgba(0, 0, 0, 0.4); --text-primary: #dce8ff; }";
// Node focus and the tooltip are the app's own module, transpiled as-is, so the
// panes below behave exactly as the preview does.
// esbuild is a dependency of packages/cli, not of the workspace root.
const esbuild = createRequire(`${repo}packages/cli/package.json`)("esbuild") as {
  transformSync(code: string, options: { loader: "ts"; format: "cjs"; target: string }): { code: string };
};
const disclosureJs = esbuild.transformSync(
  readFileSync(`${repo}packages/app/src/components/edge-disclosure.ts`, "utf8"),
  { loader: "ts", format: "cjs", target: "es2020" },
).code;
// The focus canvas is the same: the app's module, attached to each pane.
const focusCanvasJs = esbuild.transformSync(
  readFileSync(`${repo}packages/app/src/components/focus-canvas.ts`, "utf8"),
  { loader: "ts", format: "cjs", target: "es2020" },
).code;
const focusScript =
  `(() => { const module = { exports: {} }; const exports = module.exports; ${disclosureJs}\n` +
  `document.querySelectorAll(".preview-container").forEach((c) => module.exports.attachEdgeDisclosure(c)); })();` +
  `(() => { const module = { exports: {} }; const exports = module.exports; ${focusCanvasJs}\n` +
  `document.querySelectorAll(".preview-container").forEach((c) => module.exports.attachFocusCanvas(c, { layout: c.dataset.focusLayout || undefined })); })();`;
const livePane =
(variant: Variant, note: string) =>
  `<div class="preview-container">${pane({ label: variant.name, svg: variant.svg, note })}</div>`;

async function shoot(
  svg: string,
  target: { edge: [string, string] } | { node: string },
): Promise<Buffer> {
  const { nodes, edges, viewBox } = readSurface(svg);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: viewBox[2], height: viewBox[3] },
      deviceScaleFactor: 1.5,
    });
    await page.setContent(
      `<!doctype html><html><head><style>body{margin:0;background:#0F172A}` +
        `.preview-container svg{display:block}${tokens}${edgeCss}</style></head>` +
        `<body><div class="preview-container" style="width:${viewBox[2]}px">${svg}</div>` +
        `<script>${focusScript}</script></body></html>`,
    );
    if ("node" in target) {
      const n = nodes.find((x) => x.id === target.node)!;
      await page.mouse.move(n.x + n.width / 2, n.y + 12);
    } else {
      const e = edges.find((x) => x.from === target.edge[0] && x.to === target.edge[1])!;
      const a = e.points[0];
      const b = e.points.at(-1)!;
      let hit = false;
      for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.15, 0.85]) {
        await page.mouse.move(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        const hovered = await page.evaluate(() => {
          const g = document.querySelector(".krs-edge:hover");
          return g ? `${g.getAttribute("data-edge-from")}->${g.getAttribute("data-edge-to")}` : null;
        });
        if (hovered === `${target.edge[0]}->${target.edge[1]}`) {
          hit = true;
          break;
        }
      }
      if (!hit) throw new Error(`could not hover ${target.edge.join("->")}`);
    }
    await page.waitForTimeout(400); // the peer dim eases over 150ms
    return await page.locator(".preview-container").screenshot();
  } finally {
    await browser.close();
  }
}

// tsx compiles this file as CommonJS, which has no top-level await.
async function main(): Promise<void> {
const hoverTarget: [string, string] = ["Analytics", "Identity"];
const hoverShot = await shoot(v("v6-32").svg, { edge: hoverTarget });
const focusShot = await shoot(v("v6-32").svg, { node: "Identity" });
const focusNode = "Identity";
const focus = await captureFocus(
  { svg: v("v6-48").svg, css: tokens + edgeCss, script: focusScript },
  { nodes: surface.nodes.map((n) => n.id), edges: surface.edges },
  { edge: hoverTarget, node: focusNode },
);
const hoverLabel = readSurface(v("v0").svg).edges.find(
  (e) => e.from === hoverTarget[0] && e.to === hoverTarget[1],
)!.label!;

// ── Tables ───────────────────────────────────────────────────────────────────
const td = (x: string | number, cls = "") => `<td${cls ? ` class="${cls}"` : ""}>${x}</td>`;
const collisions = (m: Metrics) => m.labelNodePenetrations + m.labelLabelOverlaps + m.labelLinePenetrations;
const metricsTable =
  `<table class="num"><thead><tr><th>variant</th><th>canvas に出すもの</th><th>描くラベル</th>` +
  `<th>幅の中央値</th><th>ラベル面積 / canvas</th><th>label↔card</th><th>label↔label</th>` +
  `<th>label↔他の線</th><th>衝突計</th><th>SVG バイト</th></tr></thead><tbody>` +
  variants
    .map(
      (x) =>
        `<tr>${td(escapeHtml(x.name))}${td(escapeHtml(x.what))}${td(`${x.m.labelsDrawn} / ${x.m.edges}`)}` +
        `${td(`${x.m.widthMedianPx}px`)}${td(`${(x.m.labelInkRatio * 100).toFixed(1)}%`)}` +
        `${td(x.m.labelNodePenetrations)}${td(x.m.labelLabelOverlaps)}${td(x.m.labelLinePenetrations)}` +
        `${td(collisions(x.m), collisions(x.m) === 0 ? "ok" : "bad")}${td(x.m.bytes.toLocaleString("en-US"))}</tr>`,
    )
    .join("") +
  `</tbody></table>`;

const focusTable =
  `<table class="num"><thead><tr><th>variant</th><th>canvas に出すもの</th><th>focus 中に見えるラベル (中央値 / 最大)</th>` +
  `<th>衝突の合計 (10 node)</th><th>最悪の node</th><th>衝突 0 の node</th></tr></thead><tbody>` +
  ["v0", "v1", "v2-32", "v6-32", "v5"]
    .map(v)
    .map(
      (x) =>
        `<tr>${td(escapeHtml(x.name))}${td(escapeHtml(x.what))}${td(`${x.focus.labelsMedian} / ${x.focus.labelsMax}`)}` +
        `${td(x.focus.collisionsTotal, x.focus.collisionsTotal === 0 ? "ok" : "bad")}` +
        `${td(x.focus.collisionsWorstNode)}${td(`${x.focus.cleanNodes} / ${x.focus.nodes}`)}</tr>`,
    )
    .join("") +
  `</tbody></table>`;

const degreeTable =
  `<table class="num"><thead><tr><th>domain</th><th>依存される (in)</th><th>依存する (out)</th><th>計</th></tr></thead><tbody>` +
  degree.map((d) => `<tr>${td(escapeHtml(d.id))}${td(d.in)}${td(d.out)}${td(d.in + d.out)}</tr>`).join("") +
  `</tbody></table>`;

// ── The focus canvas ─────────────────────────────────────────────────────────
const collisionsOf = (m: FocusMeasure) => m.labelCard + m.labelLabel + m.lineLabel + m.lineCard;
const size = (m: FocusMeasure) => `${Math.round(m.width)} × ${Math.round(m.height)}`;
const focusNodeTable =
  `<table class="num"><thead><tr><th>domain</th><th>in / out</th><th>3 列: 大きさ (px)</th><th>3 列: 衝突</th>` +
  `<th>縦 1 列: 大きさ (px)</th><th>縦 1 列: 衝突</th><th>最長ラベルの行数</th></tr></thead><tbody>` +
  [...focus.nodes]
    .sort((a, b) => b.in + b.out - (a.in + a.out))
    .map(
      (n) =>
        `<tr>${td(escapeHtml(n.id))}${td(`${n.in} / ${n.out}`)}${td(size(n.columns))}` +
        `${td(collisionsOf(n.columns), collisionsOf(n.columns) === 0 ? "ok" : "bad")}${td(size(n.spine))}` +
        `${td(collisionsOf(n.spine), collisionsOf(n.spine) === 0 ? "ok" : "bad")}${td(n.columns.linesMax)}</tr>`,
    )
    .join("") +
  `</tbody></table>`;
const maxOf = (ms: FocusMeasure[], key: "width" | "height") => Math.round(Math.max(...ms.map((m) => m[key])));
const columnsAll = focus.nodes.map((n) => n.columns);
const spineAll = focus.nodes.map((n) => n.spine);
const focusCollisions = [...columnsAll, ...spineAll, ...focus.pairs].reduce((sum, m) => sum + collisionsOf(m), 0);
const focusLanes = columnsAll.reduce((sum, m) => sum + m.lanes, 0);
const focusOf = focus.nodes.find((n) => n.id === focusNode)!;
const busiestOf = focus.nodes.find((n) => n.id === focus.busiest)!;

const css = `<style>
table.num { border-collapse: collapse; font-size: 13px; margin: 12px 0; width: 100%; }
table.num th, table.num td { border-bottom: 1px solid var(--line); padding: 6px 8px; text-align: right; vertical-align: top; }
table.num th:first-child, table.num td:first-child, table.num th:nth-child(2), table.num td:nth-child(2) { text-align: left; }
table.num td.ok { color: #0B7A3B; font-weight: 600; }
table.num td.bad { color: #B42318; font-weight: 600; }
.preview-container { margin: 16px 0; }
.preview-container .edge-label-tip { font-family: system-ui, sans-serif; }
/* In the app the focus canvas covers the preview pane. A report pane is only as
   tall as its diagram, so here it takes the window instead. */
.preview-container .focus-canvas { position: fixed; }
${tokens}
${edgeCss}
</style>`;

const v0 = v("v0").m;
const v1 = v("v1").m;
const v24 = v("v2-24").m;
const a32 = v("v6-32").m;
const v5 = v("v5").m;
const p = (html: string) => `<p>${html}</p>`;

const options = {
  title: "Edge ラベルの段階的開示",
  subtitle: "線が多い domain レベルの canvas で、どの段に何を出せば読めるか (Umami の UmamiApp drill-down で計測)",
  meta: ["spike/3022-edge-label-disclosure", "Issue #3022", "writer 側は Issue #3018"],
  sections: [
    {
      body:
        css +
        p(
          `対象は reverse-architecture で起こした Umami モデルの <code>UmamiApp</code> drill-down です。` +
            `domain ${v0.nodes} 個に対して edge が ${v0.edges} 本あり、全部にラベルが付いています。` +
            `ラベルの長さは中央値 ${v0.charsMedian} 文字、最長 ${v0.charsMax} 文字です。`,
        ) +
        `<ul>` +
        `<li><strong>読めない原因は 2 つあります。</strong>ラベルが長いこと、そして線が多すぎて短いラベルにも置き場が無いことです。</li>` +
        `<li><strong>ラベルを短くするだけでは衝突が残ります。</strong>現状の衝突は ${collisions(v0)} 件です。` +
        `writer 側だけ直すと ${collisions(v1)} 件、canvas で 24 文字に省略すると ${collisions(v24)} 件まで減りますが、0 にはなりません。</li>` +
        `<li><strong>「重ならずに置けるラベルだけ描く」と衝突は 0 になります。</strong>canvas に残るラベルは ${a32.edges} 本中 ${a32.labelsDrawn} 本です。` +
        `writer 側の修正を重ねると ${v5.labelsDrawn} 本です。残りは hover で開示します。</li>` +
        `<li><strong>全文は focus canvas で読みます。</strong>edge をクリックするか、node の <code>Relations</code> を押すと、canvas の上にもう 1 枚 canvas が開き、対象の card と edge だけを、ラベルを省略せずに描きます。` +
        `全 ${focus.nodes.length} node と全 ${focus.pairs.length} 組で、衝突は ${focusCollisions} 件です。</li>` +
        `<li><strong>既存の examples は 1 バイトも変わりません。</strong>${corpus.rendered} 個の root view で、省略も保留も 1 件も発動しませんでした。</li>` +
        `</ul>`,
    },
    {
      title: "計測結果",
      body:
        metricsTable +
        p(
          `衝突の判定は renderer 自身の関数 (<code>label-placement.ts</code> の <code>countLabel*</code>) をそのまま使っています。` +
            `「label↔他の線」は実線の edge だけを数えています。薄く描かれる ghost edge の線は、既存の方針 (ADR-2360) どおり障害物に含めていません。` +
            `V6 と V5 で ghost の線に掛かるラベルは ${a32.labelGhostLinePenetrations} 本残ります。`,
        ) +
        p(
          `省略だけ (V2) の行が示すとおり、文字数を詰めても label↔card は ${v("v2-40").m.labelNodePenetrations} → ${v24.labelNodePenetrations} までしか減りません。` +
            `既存の自動配置 (ADR-2048) は約 90px の範囲でしかラベルを動かせず、その範囲に空きが無いためです。`,
        ),
    },
    {
      title: "段 0: canvas",
      body:
        p(
          `下の図はどれも操作できます。線に hover すると、canvas が省略または保留したラベルの全文が tooltip で出ます。` +
            `domain の card に hover すると、その domain の edge だけが残ります。` +
            `この振る舞いは app の preview が使うものと同じコードです。`,
        ) +
        livePane(v("v0"), `現状。衝突 ${collisions(v0)} 件、ラベルが canvas の ${(v0.labelInkRatio * 100).toFixed(1)}% を覆う`) +
        livePane(v("v1"), `writer 側のみ。${rewritten} 本のラベルを短い動詞句に書き換えた。衝突 ${collisions(v1)} 件`) +
        livePane(v("v2-32"), `省略のみ (32 文字)。衝突 ${collisions(v("v2-32").m)} 件`) +
        livePane(v("v6-32"), `auto + 省略 32。描くのは ${a32.labelsDrawn} 本、衝突 0 件`) +
        livePane(v("v5"), `writer 側 + auto。描くのは ${v5.labelsDrawn} 本、衝突 0 件`),
    },
    {
      title: "段 1 と段 2: node focus と edge hover",
      body:
        p(
          `<strong>段 1 (node focus)</strong>: domain の card に hover すると、その domain に出入りする edge だけが残り、他は薄くなります。` +
            `下は <code>Identity</code> に hover した状態です。`,
        ) +
        pane({ label: "node focus: Identity", image: dataUri(focusShot), note: "V6 auto + 省略 32 の上で card に hover" }) +
        p(
          `<strong>段 2 (edge hover)</strong>: 線に hover すると、省略または保留されていたラベルの全文が tooltip で出ます。` +
            `下は <code>${hoverTarget.join(" → ")}</code> に hover した状態で、全文は ${[...hoverLabel].length} 文字あります。` +
            `tooltip は SVG の外に置いた HTML です。edge は node より先に描かれるので、SVG の中で全文を出すと card の裏に回るためです。`,
        ) +
        pane({ label: `edge hover: ${hoverTarget.join(" → ")}`, image: dataUri(hoverShot), note: "他の edge は既存の peer dim (AT-1186) で薄くなる" }) +
        p(`node focus 中に見えるラベル同士の衝突を、node ごとに数えた結果です。対象はその node に出入りする edge のラベルと線、そして全 card です。`) +
        focusTable +
        p(
          `「省略のみ」の行は、focus した node のラベルを短い形で全部出す案の数値でもあります。` +
            `32 文字に詰めても合計 ${v("v2-32").focus.collisionsTotal} 件、最悪の node で ${v("v2-32").focus.collisionsWorstNode} 件衝突します。` +
            `edge を ${degree[0].in + degree[0].out} 本持つ hub では、短いラベルでも互いに重なるためです。` +
            `このため spike の node focus は線だけを絞り、ラベルの開示は edge hover に任せています。`,
        ),
    },
    {
      title: "段 3: focus canvas",
      body:
        p(
          `tooltip の次の段です。<strong>canvas の上にもう 1 枚 canvas を開き</strong>、そこには対象の card だけを置きます。` +
            `置くものが少ないので、ラベルは省略せず、自分の線のすぐ上に折り返して全文を描けます。` +
            `card はメインの canvas の card をそのまま複製したもので、core は何も描き直しません。`,
        ) +
        p(
          `<strong>edge をクリック</strong>すると、両端の card 2 枚と、その 2 つの間の edge が全部並びます。` +
            `下は <code>${hoverTarget.join(" → ")}</code> をクリックした状態です。`,
        ) +
        pane({ label: `edge をクリック: ${hoverTarget.join(" → ")}`, image: dataUri(focus.shots.edge), note: "1720 × 1000 の preview。背景がメインの canvas" }) +
        p(
          `同じ 2 つの間に逆向きの edge もあるときは、両方を別々の行に描きます。` +
            `この canvas で両方向の edge を持つ組は ${mutualPairs.size} 組あります。下は <code>${focus.mutual.join(" ↔ ")}</code> です。`,
        ) +
        pane({ label: `両方向の組: ${focus.mutual.join(" ↔ ")}`, svg: focus.canvases.mutual, note: "focus canvas そのもの (SVG)" }) +
        p(
          `<strong>node は、card に hover すると出る <code>⇄ Relations</code> から開きます。</strong>` +
            `card のクリックは drill-down に使われているので、別の入口が必要です。` +
            `hover 中は今までどおり、その node の edge だけが残ります。`,
        ) +
        pane({ label: `card に hover: ${focusNode}`, image: dataUri(focus.shots.pill), note: "card の右上に Relations が出る" }) +
        p(
          `開くと、中央に対象の node、<strong>左にそれに依存する node、右にそれが依存する node</strong> が並びます。` +
            `1 本の edge が 1 行で、ラベルは全文です。<code>${focusNode}</code> は ${focusOf.in} 本入り ${focusOf.out} 本出ています。`,
        ) +
        pane({ label: `node の focus canvas (3 列): ${focusNode}`, image: dataUri(focus.shots.columns), note: "1720 × 1000 の preview" }) +
        pane({ label: `3 列: ${focusNode}`, svg: focus.canvases.columns, note: `focus canvas そのもの。${size(focusOf.columns)} px` }) +
        p(
          `3 列は横に広く、<code>${focusNode}</code> で ${Math.round(focusOf.columns.width)} px あります。` +
            `preview がそれより狭いとき (文字が 80% 未満に縮むとき) は、<strong>縦 1 列</strong>に切り替えます。` +
            `接続先を全部左に並べ、依存する側は上から node の上辺へ、依存される側は node の下辺から下へ繋ぎます。` +
            `幅は約半分になり、縦に伸びた分は panel の中でスクロールします。開いたときは対象の node が中央に来る位置から始まります。`,
        ) +
        pane({ label: `node の focus canvas (縦 1 列): ${focusNode}`, image: dataUri(focus.shots.spine), note: "1100 × 950 の preview (エディタと並べたときの幅)" }) +
        pane({ label: `縦 1 列: ${focusNode}`, svg: focus.canvases.spine, note: `focus canvas そのもの。${size(focusOf.spine)} px` }) +
        p(`edge が最も多い <code>${focus.busiest}</code> (${busiestOf.in} 本入り ${busiestOf.out} 本出る) の 3 列です。`) +
        pane({ label: `3 列: ${focus.busiest}`, svg: focus.canvases.busiest, note: `${size(busiestOf.columns)} px` }) +
        p(
          `全 ${focus.nodes.length} 個の node を両方の並べ方で、全 ${focus.pairs.length} 組を edge の focus canvas で開き、ブラウザ上で衝突を数えました。` +
            `数えたのは、ラベルと card、ラベル同士、線とラベル、線と card の内側です。` +
            `<strong>合計 ${focusCollisions} 件</strong>でした (node の focus canvas だけで延べ ${focusLanes * 2} 行)。` +
            `メインの canvas で同じラベルを全文で描くと ${collisions(v0)} 件です。`,
        ) +
        focusNodeTable +
        p(
          `大きさは、3 列で最大 ${maxOf(columnsAll, "width")} × ${maxOf(columnsAll, "height")} px、` +
            `縦 1 列で最大 ${maxOf(spineAll, "width")} × ${maxOf(spineAll, "height")} px、` +
            `edge の focus canvas で最大 ${maxOf(focus.pairs, "width")} × ${maxOf(focus.pairs, "height")} px です。` +
            `幅のほとんどは card (この図では 1 枚 364 px) で、ラベルの欄は 300 px です。`,
        ) +
        p(
          `edge の focus canvas には弱点があります。<strong>線をクリックできない edge には開く入口がありません。</strong>` +
            `1720 × 1000 の preview で ${v0.edges} 本の線を 2% 刻みで調べると、${focus.unclickable.length} 本は、どの点でも card か他の edge の当たり判定の下にありました` +
            (focus.unclickable.length > 0 ? ` (${focus.unclickable.map((e) => `<code>${escapeHtml(e)}</code>`).join("、")})。` : `。`) +
            `node の focus canvas はこの edge にも届きます。どちらかの端の node を開けば、その edge は 1 行として並んでいます。`,
        ) +
        p(
          `focus canvas の中の card をクリックすると、その node の focus canvas に移ります。` +
            `node の focus canvas で行をクリックすると、その組の edge の focus canvas に移ります。<code>← Back</code> で戻れます。` +
            `下の図で試せます (レポートでは window 全体に開きます)。`,
        ) +
        livePane(v("v6-48"), `auto + 省略 48。線をクリック、または card に hover して Relations をクリック`),
    },
    {
      title: "線そのものの密度",
      body:
        p(
          `ラベルを全部消しても (V4)、${v0.edges} 本の線は残ります。` +
            `有向 edge ${v0.edges} 本は ${unorderedPairs.size} 組の domain の間に張られていて、そのうち ${mutualPairs.size} 組は両方向です。` +
            `domain ごとの本数は次のとおりです。`,
        ) +
        degreeTable +
        p(
          `${v0.edges} 本のうち ${hubEdges} 本が、上位 2 つの domain (${hubs.join(" と ")}) のどちらかに繋がっています。` +
            `node focus はこの偏りに対する答えで、domain を 1 つ選べばその線だけが残ります。` +
            `両方向の ${mutualPairs.size} 組を 1 本ずつにまとめれば、線は ${v0.edges} 本から ${unorderedPairs.size} 本に減ります。` +
            `別件として、${v0.edgesUnderForeignCard} 本の edge が、端点ではない domain の card の下を通っています。` +
            `これはラベルではなく配線の問題で、どの variant でも変わりません。`,
        ),
    },
    {
      title: "既存のモデルへの影響",
      body:
        p(
          `リポジトリの <code>examples/</code> にある ${corpus.files} ファイルを調べました。` +
            `手書きの edge ラベルは ${corpus.labels} 本で、最長は ${corpus.longest} 文字です。` +
            `32 文字を超えるものは ${corpus.over32} 本、24 文字を超えるものは ${corpus.over24} 本でした。`,
        ) +
        p(
          `単独でコンパイルできた ${corpus.rendered} 個の root view について、現状の出力と比べました。` +
            `40 文字の省略で変わった view は ${corpus.changedByTruncation40} 個、auto で変わった view は ${corpus.changedByAuto} 個、両方で ${corpus.changedByBoth} 個です。` +
            `これらの view には今日の時点で衝突が ${corpus.collisionsToday} 件しかなく、保留されたラベルは ${corpus.labelsWithheldByAuto} 本でした。` +
            `残りの ${corpus.skipped} ファイルは、複数ファイル構成か edge を持たないため対象外です。drill-down の各階層は比べていません。`,
        ),
    },
    {
      title: "この spike で決めていないこと",
      body:
        `<ul>` +
        `<li>既定値。spike は 40 文字 / auto を既定にしています。静的な SVG 出力でもラベルを保留してよいかは別の判断です。静的出力では、保留したラベルは <code>&lt;title&gt;</code> でしか読めません。</li>` +
        `<li>ghost edge と cyclic edge を配置パスに入れる範囲。spike では auto のときだけ入れています。</li>` +
        `<li>hop の持ち主を表す属性。spike は hop ごとに属性を足しました。この canvas では SVG が約 9% 大きくなります。hop の描き方は #2956 で設計中です。</li>` +
        `<li>spike では core のテストが 4,682 件中 2 件落ちます。新しい style property が spec に無いこと、ghost と cyclic の edge を配置パスに入れたことが原因で、どちらも意図した変更の帰結です。</li>` +
        `<li>focus canvas と既存の詳細パネルの関係。spike では、詳細パネルを開く edge (property block を持つもの、集約 edge) はそちらを優先し、focus canvas は開きません。description や link を focus canvas に載せるかは決めていません。</li>` +
        `<li>node の focus canvas の入口。spike は hover で出る <code>Relations</code> にしました。card の ⓘ から開く詳細パネルに置く案もあります。キーボードと touch からの入口はありません。</li>` +
        `<li>focus canvas を開いたまま source を編集したときの追従。spike では開いた時点の図のままです。</li>` +
        `<li>hub の線を既定で薄くする、両方向の 2 本を 1 本にまとめる、といった線側の集約。</li>` +
        `</ul>` +
        `<script>${focusScript}</script>`,
    },
  ],
};

writeFileSync(`${dir}index.html`, reportPage(options));
writeFileSync(`${dir}artifact.html`, reportFragment(options));
writeFileSync(
  `${dir}summary.json`,
  JSON.stringify(
    {
      variants: variants.map(({ id, name, m, focus }) => ({ id, name, ...m, focus })),
      focusCanvas: { nodes: focus.nodes, pairs: focus.pairs, collisions: focusCollisions, unclickable: focus.unclickable },
      degree,
      unorderedPairs: unorderedPairs.size,
      mutualPairs: mutualPairs.size,
      corpus,
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(`${dir}hover-edge.png`, hoverShot);
writeFileSync(`${dir}focus-node.png`, focusShot);
writeFileSync(`${dir}focus-canvas-edge.png`, focus.shots.edge);
writeFileSync(`${dir}focus-canvas-columns.png`, focus.shots.columns);
writeFileSync(`${dir}focus-canvas-spine.png`, focus.shots.spine);
writeFileSync(`${dir}focus-canvas-pill.png`, focus.shots.pill);
console.log(`wrote ${dir}index.html (${variants.length} variants)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
