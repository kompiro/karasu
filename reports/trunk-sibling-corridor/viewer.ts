// SPIKE (#2631 slice E): the whole dify root view, pannable and zoomable, so the
// decision can be taken on the real picture rather than on fixed-size crops.
//
// Six renders are embedded: three grouping axes x {today, proposal A at hop
// radius 6}. Only one is visible at a time; pan with drag, zoom with the wheel
// or the buttons.
//
// Run: pnpm exec tsx reports/trunk-sibling-corridor/viewer.ts

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderKrs } from "../../scripts/report/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIFY = "/workspaces/dify/index.krs";

type Axis = { key: string; label: string; groupBy?: "team" | "boundary" };
const AXES: Axis[] = [
  { key: "none", label: "Group by: none" },
  { key: "team", label: "Group by: team" },
  { key: "boundary", label: "Group by: boundary", groupBy: "boundary" },
];
AXES[1].groupBy = "team";

type Mode = {
  key: string;
  label: string;
  legibility: string;
  hopRadius?: number;
  outTrunk?: boolean;
};
const MODES: Mode[] = [
  { key: "today", label: "現行", legibility: "off" },
  { key: "a", label: "案A（本数 tip + 帯、アーチ 6px）", legibility: "tip", hopRadius: 6 },
  { key: "b", label: "案B（本数 tip、アーチ 6px、帯なし）", legibility: "tiponly", hopRadius: 6 },
  {
    key: "c",
    label: "案A + fan-out trunk（出ていく束も 1 本に）",
    legibility: "tip",
    hopRadius: 6,
    outTrunk: true,
  },
];

/** Namespaces every id so six copies of one diagram can share a page. */
function isolate(svg: string, prefix: string): string {
  return svg
    .replaceAll(/\bid="([^"]+)"/g, (_m, id) => `id="${prefix}-${id}"`)
    .replaceAll(/url\(#([^)]+)\)/g, (_m, id) => `url(#${prefix}-${id})`)
    .replaceAll(/\bhref="#([^"]+)"/g, (_m, id) => `href="#${prefix}-${id}"`);
}

const source = readFileSync(DIFY, "utf8");
const panes: string[] = [];
for (const axis of AXES) {
  for (const mode of MODES) {
    process.env.KARASU_TRUNK_VARIANT = "shared";
    process.env.KARASU_OUT_TRUNK = mode.outTrunk ? "1" : "0";
    process.env.KARASU_TRUNK_LEGIBILITY = mode.legibility;
    if (mode.hopRadius === undefined) delete process.env.KARASU_HOP_RADIUS;
    else process.env.KARASU_HOP_RADIUS = String(mode.hopRadius);
    const svg = renderKrs(source, axis.groupBy ? { groupBy: axis.groupBy } : {});
    const id = `${axis.key}-${mode.key}`;
    panes.push(
      `<div class="pane" data-pane="${id}" hidden><div class="canvas">${isolate(svg, id)}</div></div>`,
    );
    console.log(`rendered ${id}: ${(svg.length / 1024).toFixed(0)}KB`);
  }
}

const STYLE = `
:root { color-scheme: dark; }
html, body { height: 100%; }
body { margin: 0; background: #0B1220; color: #E2E8F0; display: flex;
  flex-direction: column; overflow: hidden;
  font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif; }
header { flex: 0 0 auto; z-index: 5; background: #0F172A;
  border-bottom: 1px solid #1E293B; padding: 10px 14px; display: flex;
  gap: 18px; align-items: center; flex-wrap: wrap; }
h1 { font-size: 15px; margin: 0 8px 0 0; font-weight: 600; letter-spacing: .02em; }
.group { display: flex; gap: 6px; align-items: center; }
.group span.lab { font-size: 11.5px; color: #94A3B8; margin-right: 2px; }
button { font: inherit; font-size: 12.5px; padding: 4px 11px; border-radius: 999px;
  border: 1px solid #334155; background: #111C2E; color: #CBD5E1; cursor: pointer; }
button:hover { border-color: #64748B; }
button[aria-pressed="true"] { background: #1D4ED8; border-color: #1D4ED8; color: #fff; }
.zoom { font-variant-numeric: tabular-nums; font-size: 12px; color: #94A3B8; min-width: 56px; }
.hint { font-size: 11.5px; color: #64748B; }
.stage { flex: 1 1 auto; position: relative; overflow: hidden; cursor: grab;
  background: #0B1220; background-image:
    linear-gradient(#131F33 1px, transparent 1px),
    linear-gradient(90deg, #131F33 1px, transparent 1px);
  background-size: 40px 40px; }
.stage.dragging { cursor: grabbing; }
.pane { position: absolute; inset: 0; }
.pane[hidden] { display: none !important; }
.canvas { position: absolute; transform-origin: 0 0; will-change: transform; }
.canvas svg { display: block; }
`.trim();

const SCRIPT = `
(function () {
  var stage = document.getElementById("stage");
  var zoomOut = document.getElementById("zoom-label");
  var axis = "boundary";
  var mode = "a";
  var view = {};              // per pane: { k, x, y }
  function paneId() { return axis + "-" + mode; }
  function pane() { return document.querySelector('[data-pane="' + paneId() + '"]'); }
  function canvas() { return pane().querySelector(".canvas"); }
  function state() {
    if (!view[paneId()]) view[paneId()] = { k: 1, x: 0, y: 0 };
    return view[paneId()];
  }
  function apply() {
    var s = state();
    canvas().style.transform = "translate(" + s.x + "px," + s.y + "px) scale(" + s.k + ")";
    zoomOut.textContent = Math.round(s.k * 100) + "%";
  }
  function fit() {
    var svg = pane().querySelector("svg");
    var w = svg.width.baseVal.value || svg.viewBox.baseVal.width;
    var h = svg.height.baseVal.value || svg.viewBox.baseVal.height;
    var k = Math.min((stage.clientWidth - 32) / w, (stage.clientHeight - 32) / h);
    var s = state();
    s.k = k;
    s.x = (stage.clientWidth - w * k) / 2;
    s.y = (stage.clientHeight - h * k) / 2;
    apply();
  }
  function show(next) {
    document.querySelectorAll(".pane").forEach(function (p) { p.hidden = true; });
    pane().hidden = false;
    if (!view[paneId()]) { fit(); } else { apply(); }
    if (next) fitIfFresh();
  }
  function fitIfFresh() {}
  // Controls
  document.querySelectorAll("[data-axis]").forEach(function (b) {
    b.addEventListener("click", function () {
      var prev = state();
      axis = b.dataset.axis;
      document.querySelectorAll("[data-axis]").forEach(function (o) {
        o.setAttribute("aria-pressed", String(o === b));
      });
      // Carry the current zoom across a switch so the two are comparable.
      if (!view[paneId()]) view[paneId()] = { k: prev.k, x: prev.x, y: prev.y };
      show();
    });
  });
  document.querySelectorAll("[data-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      var prev = state();
      mode = b.dataset.mode;
      document.querySelectorAll("[data-mode]").forEach(function (o) {
        o.setAttribute("aria-pressed", String(o === b));
      });
      // Same framing on both sides of the comparison — that is the whole point.
      view[paneId()] = { k: prev.k, x: prev.x, y: prev.y };
      show();
    });
  });
  document.getElementById("fit").addEventListener("click", fit);
  document.getElementById("reset").addEventListener("click", function () {
    var s = state(); s.k = 1; s.x = 16; s.y = 16; apply();
  });
  document.getElementById("in").addEventListener("click", function () { zoomBy(1.25); });
  document.getElementById("out").addEventListener("click", function () { zoomBy(1 / 1.25); });
  function zoomBy(f, cx, cy) {
    var s = state();
    var rect = stage.getBoundingClientRect();
    var px = cx === undefined ? rect.width / 2 : cx - rect.left;
    var py = cy === undefined ? rect.height / 2 : cy - rect.top;
    var k2 = Math.min(8, Math.max(0.05, s.k * f));
    s.x = px - ((px - s.x) * k2) / s.k;
    s.y = py - ((py - s.y) * k2) / s.k;
    s.k = k2;
    apply();
  }
  stage.addEventListener("wheel", function (e) {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
  }, { passive: false });
  var drag = null;
  stage.addEventListener("pointerdown", function (e) {
    drag = { x: e.clientX, y: e.clientY, sx: state().x, sy: state().y };
    stage.classList.add("dragging");
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var s = state();
    s.x = drag.sx + (e.clientX - drag.x);
    s.y = drag.sy + (e.clientY - drag.y);
    apply();
  });
  function endDrag() { drag = null; stage.classList.remove("dragging"); }
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  window.addEventListener("resize", function () { if (state().k) apply(); });
  show();
  fit();
})();
`.trim();

const BODY = `
<header>
  <h1>dify root view — #2631 slice E</h1>
  <div class="group">
    <span class="lab">軸</span>
    <button data-axis="none" aria-pressed="false">none</button>
    <button data-axis="team" aria-pressed="false">team</button>
    <button data-axis="boundary" aria-pressed="true">boundary</button>
  </div>
  <div class="group">
    <span class="lab">描画</span>
    <button data-mode="today" aria-pressed="false">現行</button>
    <button data-mode="a" aria-pressed="true">案A（tip + 帯）</button>
    <button data-mode="b" aria-pressed="false">案B（tip のみ）</button>
    <button data-mode="c" aria-pressed="false">案A + fan-out</button>
  </div>
  <div class="group">
    <button id="out">−</button>
    <span class="zoom" id="zoom-label">100%</span>
    <button id="in">＋</button>
    <button id="fit">全体</button>
    <button id="reset">100%</button>
  </div>
  <span class="hint">ドラッグで移動 / ホイールで拡大縮小。軸と描画を切り替えても表示位置は保たれます。案A・案B はどちらもアーチ 6px・ラベルは各エッジの stub 上。</span>
</header>
<div class="stage" id="stage">
${panes.join("\n")}
</div>
`.trim();

const page =
  `<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n` +
  `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
  `<title>dify root view — #2631 slice E</title>\n<style>\n${STYLE}\n</style>\n</head>\n<body>\n` +
  `${BODY}\n<script>\n${SCRIPT}\n</script>\n</body>\n</html>\n`;

const fragment = `<title>dify root view — #2631 slice E</title>\n<style>\n${STYLE}\n</style>\n${BODY}\n<script>\n${SCRIPT}\n</script>\n`;

mkdirSync(HERE, { recursive: true });
writeFileSync(resolve(HERE, "viewer.html"), page);
writeFileSync(resolve(HERE, "viewer-artifact.html"), fragment);
console.log("wrote reports/trunk-sibling-corridor/{viewer,viewer-artifact}.html");
