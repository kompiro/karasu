/* eslint-disable no-console -- spike script */
/**
 * SPIKE — spike/width-budget-ladder, Issue #2761 option 3. NOT FOR MERGE.
 * Turns `data.json` (written by `harness.ts`) into the report page.
 *
 *   pnpm tsx reports/width-budget-ladder/build.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { escapeHtml, reportFragment, reportPage } from "../../scripts/report/index.ts";

interface Heavy {
  path: string;
  nodes: number;
  edges: number;
  renderMs: number;
  baselineRenderMs: number;
  candidates: number;
  replacements: number;
  placements: number;
  budget: number;
  baselineBudget: number;
  areaMpx: number;
  baselineAreaMpx: number;
}
interface Changed {
  path: string;
  nodes: number;
  edges: number;
  budget: number;
  baselineBudget: number;
  areaMpx: number;
  baselineAreaMpx: number;
  inBand: boolean;
  svgDiffersFromMain: boolean;
}
interface Result {
  id: string;
  label: string;
  note: string;
  env: string;
  levels: number;
  areaMpx: number;
  svgAreaMpx: number;
  outsideBand: number;
  placements: number;
  levelsBeyondFirst: number;
  budgetChanged: number;
  svgChanged: number;
  benchAllViewsMs: number;
  walkRenderMs: number;
  profile: {
    totalMs: number;
    extraCandidateMs: number;
    firstCandidateMs: number;
    searches: number;
    searchesBeyondFirst: number;
    candidates: number;
    replacements: number;
  };
  heaviest: Heavy[];
  changedLevels: Changed[];
}
interface Data {
  file: string;
  runs: number;
  generated: string;
  results: Result[];
}

const data = JSON.parse(
  readFileSync("reports/width-budget-ladder/data.json", "utf8"),
) as Data;

// Wall time comes from the repo benchmark run in its own process per
// configuration (`bench-sweep.ts`), not from the harness's in-process timer.
interface Bench {
  file: string;
  rounds: number;
  rows: Array<{ id: string; allViews: number; system: number }>;
}
const bench = JSON.parse(readFileSync("reports/width-budget-ladder/bench.json", "utf8")) as Bench;
const benchOf = (id: string): { allViews: number; system: number } =>
  bench.rows.find((r) => r.id === id)!;
for (const r of data.results) r.benchAllViewsMs = benchOf(r.id).allViews;

interface AllViews {
  file: string;
  rounds: number;
  rows: Array<{
    id: string;
    totalMs: number;
    extraCandidateMs: number;
    firstCandidateMs: number;
    candidates: number;
    spread: number[];
  }>;
}
const allViews = JSON.parse(
  readFileSync("reports/width-budget-ladder/allviews.json", "utf8"),
) as AllViews;
const avOf = (id: string): AllViews["rows"][number] => allViews.rows.find((r) => r.id === id)!;
// The harness's single-process profile and this multi-process sweep measure the
// same thing; the sweep is the one quoted, because each number comes from a
// process that has seen only its own configuration.
for (const r of data.results) {
  r.profile.totalMs = avOf(r.id).totalMs;
  r.profile.extraCandidateMs = avOf(r.id).extraCandidateMs;
  r.profile.firstCandidateMs = avOf(r.id).firstCandidateMs;
  r.profile.candidates = avOf(r.id).candidates;
}

interface Deploy {
  id: string;
  width: number;
  height: number;
  areaMpx: number;
  aspect: number;
  candidates: number;
  compileMs: number;
  hash: string;
}
const deploy = JSON.parse(
  readFileSync("reports/width-budget-ladder/deploy.json", "utf8"),
) as Deploy[];

interface Examples {
  files: string[];
  totalLevels: number;
  nondeterministic: number;
  rows: Array<{ id: string; changed: number; filesChanged: number }>;
}
const examples = JSON.parse(
  readFileSync("reports/width-budget-ladder/examples.json", "utf8"),
) as Examples;

const base = data.results[0];

const n1 = (v: number): string => v.toFixed(1);
const pct = (v: number, of: number): string => `${((v / of) * 100).toFixed(1)}%`;
const delta = (v: number, b: number, unit = ""): string =>
  Math.abs(v - b) < 5e-2
    ? "±0"
    : `${v > b ? "+" : "−"}${n1(Math.abs(v - b))}${unit} (${v > b ? "+" : "−"}${((Math.abs(v - b) / b) * 100).toFixed(1)}%)`;

function tbl(head: readonly string[], rows: readonly (readonly string[])[]): string {
  const th = head.map((h) => `<th>${h}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("\n");
  return `<table>\n<thead><tr>${th}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table>`;
}

const PROPS: Record<string, { deterministic: string; floorFirst: string }> = {
  today: { deterministic: "yes", floorFirst: "yes" },
  steps8: { deterministic: "yes", floorFirst: "yes (over a coarser candidate set)" },
  steps6: { deterministic: "yes", floorFirst: "yes (over a coarser candidate set)" },
  steps4: { deterministic: "yes", floorFirst: "yes (over a coarser candidate set)" },
  steps3: { deterministic: "yes", floorFirst: "yes (over a coarser candidate set)" },
  steps6m2: { deterministic: "yes", floorFirst: "yes (over a coarser candidate set)" },
  floor: { deterministic: "yes", floorFirst: "trivially — the floor always wins" },
  patience1: { deterministic: "yes", floorFirst: "yes, but the stop is not sound" },
  patience2: { deterministic: "yes", floorFirst: "yes, but the stop is not sound" },
};

const tradeOff = tbl(
  [
    "configuration",
    "total canvas area",
    "Δ vs today",
    "levels outside the band",
    "full placements",
    "candidate time attributed",
    "all-views wall time",
    "levels with a different budget",
    "levels whose SVG differs from main",
  ],
  data.results.map((r) => [
    `<strong>${escapeHtml(r.label)}</strong><br><span style="color:#5B6672;font-size:12px">${escapeHtml(r.note)}</span>`,
    `${n1(r.areaMpx)} Mpx`,
    r.id === base.id ? "—" : delta(r.areaMpx, base.areaMpx, " Mpx"),
    String(r.outsideBand),
    `${r.placements}${r.id === base.id ? "" : ` (${r.placements - base.placements >= 0 ? "+" : "−"}${Math.abs(r.placements - base.placements)})`}`,
    `${n1(r.profile.extraCandidateMs)} ms${r.id === base.id ? "" : ` (${r.profile.extraCandidateMs > base.profile.extraCandidateMs ? "+" : "−"}${n1(Math.abs(base.profile.extraCandidateMs - r.profile.extraCandidateMs))} ms)`}`,
    `${n1(r.profile.totalMs)} ms${r.id === base.id ? "" : ` (${r.profile.totalMs > base.profile.totalMs ? "+" : "−"}${n1(Math.abs(r.profile.totalMs - base.profile.totalMs))} ms)`}`,
    String(r.budgetChanged),
    String(r.svgChanged),
  ]),
);

const properties = tbl(
  ["configuration", "deterministic (same input → same SVG)", "floor-first (TPL-2593)", "stop rule"],
  data.results.map((r) => [
    escapeHtml(r.label),
    PROPS[r.id].deterministic,
    PROPS[r.id].floorFirst,
    r.id.startsWith("patience")
      ? "<strong>unsound</strong> — the canvas is not monotone in the budget (ADR-2593 removed exactly this stop)"
      : "<code>exhausted</code> only — sound",
  ]),
);

const heavyRows: string[][] = [];
for (const level of base.heaviest) {
  const cells = [
    `<code>${escapeHtml(level.path)}</code>`,
    String(level.nodes),
    String(level.edges),
    `${n1(level.baselineRenderMs)} ms`,
  ];
  for (const r of data.results) {
    const own = r.heaviest.find((h) => h.path === level.path)!;
    cells.push(String(own.placements));
  }
  heavyRows.push(cells);
}
const heaviest = tbl(
  ["level", "nodes", "edges", "render (today)", ...data.results.map((r) => escapeHtml(r.label))],
  heavyRows,
);

const fractionRows = data.results.map((r) => [
  escapeHtml(r.label),
  `${n1(r.profile.totalMs)} ms`,
  `${n1(r.profile.firstCandidateMs)} ms`,
  `${n1(r.profile.extraCandidateMs)} ms`,
  pct(r.profile.extraCandidateMs, r.profile.totalMs),
  `${r.profile.searchesBeyondFirst} / ${r.profile.searches}`,
  String(r.profile.replacements),
]);
const fraction = tbl(
  [
    "configuration",
    "buildAllViewsSvg (fresh process, best of 5 rounds × 7)",
    "first (floor) candidate",
    "candidates after the first",
    "share of the build",
    "searches that ran > 1 candidate",
    "re-placements",
  ],
  fractionRows,
);

function changedTable(r: Result): string {
  if (r.changedLevels.length === 0) return "<p>No level changes.</p>";
  const rows = r.changedLevels
    .slice()
    .sort((a, b) => b.areaMpx - b.baselineAreaMpx - (a.areaMpx - a.baselineAreaMpx))
    .map((c) => [
      `<code>${escapeHtml(c.path)}</code>`,
      `${c.nodes} / ${c.edges}`,
      `${c.baselineBudget} → ${c.budget}`,
      `${c.baselineAreaMpx.toFixed(2)} → ${c.areaMpx.toFixed(2)} Mpx`,
      c.areaMpx > c.baselineAreaMpx
        ? `<strong>+${(((c.areaMpx - c.baselineAreaMpx) / c.baselineAreaMpx) * 100).toFixed(0)}%</strong>`
        : `${(((c.areaMpx - c.baselineAreaMpx) / c.baselineAreaMpx) * 100).toFixed(0)}%`,
      c.inBand ? "in band" : "<strong>outside</strong>",
      c.svgDiffersFromMain ? "yes" : "no",
    ]);
  return tbl(
    ["level", "nodes / edges", "budget", "canvas area", "Δ area", "aspect band", "SVG differs from main"],
    rows,
  );
}

const changedSections = data.results
  .filter((r) => r.id !== base.id && r.changedLevels.length > 0)
  .map(
    (r) =>
      `<h3>${escapeHtml(r.label)} — ${r.changedLevels.length} levels pick a different budget, ${r.svgChanged} draw differently</h3>\n${changedTable(r)}`,
  )
  .join("\n");

const floor = data.results.find((r) => r.id === "floor")!;
/**
 * Area over just the levels that actually draw differently — where the whole
 * trade lives. A level that merely picks a different budget number and lands on
 * the same placement costs the reader nothing.
 */
function movedArea(r: Result): { before: number; after: number; levels: number } {
  const moved = r.changedLevels.filter((c) => c.svgDiffersFromMain);
  return {
    before: moved.reduce((a, c) => a + c.baselineAreaMpx, 0),
    after: moved.reduce((a, c) => a + c.areaMpx, 0),
    levels: moved.length,
  };
}
const movedTable = tbl(
  ["configuration", "levels that draw differently", "their area today", "their area here", "Δ on those levels"],
  data.results
    .filter((r) => r.id !== base.id)
    .map((r) => {
      const m = movedArea(r);
      return [
        escapeHtml(r.label),
        String(m.levels),
        `${n1(m.before)} Mpx`,
        `${n1(m.after)} Mpx`,
        m.levels === 0 ? "—" : delta(m.after, m.before, " Mpx"),
      ];
    }),
);
const extraShare = pct(base.profile.extraCandidateMs, base.profile.totalMs);

const options = {
  title: "Width-budget ladder: what a shorter search costs the reader",
  lang: "ja",
  subtitle:
    "Issue #2761 option 3 — re-measuring ADR-2593's canvas objective against the number of full placements the ladder buys.",
  meta: [
    "spike/width-budget-ladder",
    "Issue #2761 / #2757 slice D",
    `model: ${escapeHtml(data.file)}`,
    `${base.levels} drill-down levels`,
    `wall time: best of ${allViews.rounds} × 7`,
    escapeHtml(data.generated.slice(0, 10)),
  ],
  sections: [
    {
      title: "問い",
      body: `
<p><code>layout()</code> は <code>searchWidthBudget</code> の候補ごとに配置をまるごとやり直す
（<code>BUDGET_STEPS = 12</code>, <code>MAX_BUDGET_MULTIPLE = 6</code>、<code>exhausted</code> で早期終了）。
はしごを短くするのが <em>回数</em> を減らす唯一のレバーだが、出力が変わるので
<a href="https://github.com/kompiro/karasu/blob/main/docs/adr/2593-canvas-space-objective.md">ADR-2593</a>
の目的関数（帯の内側で最小キャンバス、floor-first）を仮定せず測り直す必要がある。</p>
<p>この spike は <strong>パッチではなくトレードオフ表</strong> を出す。各設定について、読者が失う
キャンバス空間と、レンダラが節約する時間を並べる。</p>`,
    },
    {
      title: "方法",
      body: `
<ul>
  <li>参照モデルは <code>${escapeHtml(data.file)}</code>（ADR-2593 / #2598 / #2585 が測った corpus）。
      <code>buildDrillDownSvg</code> と同じ歩き方で <strong>${base.levels} レベル</strong>すべてを描画する
      （walk は <code>scripts/bench/render.ts</code> から写した）。</li>
  <li>面積・帯・placement 回数は <code>harness.ts</code>（このディレクトリ）。
      <code>aspect-search.ts</code> / <code>layout.ts</code> にカウンタを入れた spike ビルドで走らせる。</li>
  <li>wall time は <strong>設定ごとに新しいプロセス</strong>で <code>buildAllViewsSvg</code> を
      best-of-7、それを ${allViews.rounds} ラウンド round-robin して最小を採る（<code>allviews-sweep.ts</code>）。
      同じプロセスの中で 1 個目より後の候補配置に入った時間も積む（attributed）。
      リポジトリ既存の <code>pnpm bench:render &lt;file&gt; --runs 5</code> も
      <code>KARASU_SPIKE_LADDER</code> 付きで 3 ラウンド回して突き合わせている（<code>bench-sweep.ts</code>）。</li>
  <li>「SVG が変わったレベル」は <strong>未改変の main</strong>（<code>origin/main</code>、計測時 <code>62208571</code>）で
      先に取った SHA-1 との突き合わせ。today 設定で 0 件になることが、計装が出力に影響していない証拠でもある。</li>
  <li>面積と帯の判定は探索が採点するのと同じ寸法（<code>LayoutResult.width/height</code>）。</li>
</ul>
<p><strong>ADR-2593 の表と数字を直接引き算しないこと。</strong> ADR は dify の 40 view（158.1 → 130.7 Mpx）を
測っており、ここは 405 drill-down レベルの合計なので母集団が違う。比較できるのは<em>形</em>と<em>百分率</em>。</p>`,
    },
    {
      title: "トレードオフ表",
      body: `${tradeOff}
<p style="font-size:13px;color:#5B6672">「full placements」= 候補配置 + チャネル予約の再配置の合計（${base.levels} レベル分）。
「candidate time attributed」は 1 個目より後の候補配置の中で使った時間を <code>buildAllViewsSvg</code> 1 回ぶんで積んだもの。
wall time と attributed はどちらも <strong>設定ごとに新しいプロセスを立て、5 ラウンド × best-of-7 の最小</strong>
（<code>allviews-sweep.ts</code>）。
「levels with a different budget」は today との比較、「SVG differs from main」は未改変 main との byte 比較。</p>
<p style="font-size:13px;color:#5B6672"><strong>ノイズについて。</strong> 同一設定でもラウンド間で 10% 前後ばらつく
（例: today = ${avOf("today").spread.join(" / ")} ms）。最小を採ってもなお、
<strong>差が 30 ms 程度の行は wall time だけでは区別できない</strong>。attributed 列は削減対象そのものを測っており、
両者の差分が概ね一致していることが妥当性の裏付けになる。</p>
${tbl(
  ["configuration", "リポジトリの <code>pnpm bench:render --runs 5</code>（3 ラウンド最小）", "single system view"],
  data.results.map((r) => [
    escapeHtml(r.label),
    `${n1(benchOf(r.id).allViews)} ms`,
    `${n1(benchOf(r.id).system)} ms`,
  ]),
)}
<p style="font-size:13px;color:#5B6672">参考: リポジトリ既存の <code>pnpm bench:render</code> を
<code>KARASU_SPIKE_LADDER</code> 付きで回した数字。上の表とは別の計測だが順序は一致する
（wall time のばらつきで steps3/steps4 と floor の間だけ入れ替わる）。単一 system view は
はしごの影響を受けない（root は 1 候補で <code>exhausted</code>）。</p>`,
    },
    {
      title: "決定性と floor-first",
      body: `${properties}
<p>はしごを短くしても TPL-2593 の 3 条件のうち「候補は入力だけで決まる」「既定候補が先頭で厳密改善のみが勝つ」
「打ち切りは単調性で説明できる（<code>exhausted</code> のみ）」はすべて保たれる。floor-first の意味は
<em>評価した候補の中で</em>厳密に小さいものだけが floor を置き換える、に変わる（未評価の予算にもっと小さい
キャンバスがありうる）。</p>
<p>一方 <strong>patience 系は打ち切りが単調性で説明できない</strong>。ADR-2593「実装で設計を覆した点」1 が
まさにこれを取り消している: 行の高さはその行の最も高いカードで決まるので、予算を広げると総高が増えうる。
下の表が示すとおり、patience は実測でも今日と違う予算を選ぶ。</p>`,
    },
    {
      title: "追加候補は wall time の何割か",
      body: `${fraction}
<p><strong>${base.profile.searchesBeyondFirst} / ${base.profile.searches}</strong> の探索しか 2 個目の候補に進まない
（残りは <code>exhausted</code> で 1 回で抜ける）が、その少数が all-views ビルドの
<strong>${extraShare}</strong>（${n1(base.profile.extraCandidateMs)} ms / ${n1(base.profile.totalMs)} ms）を占める。
1 個目（floor）の配置は 425 回すべて合わせても ${n1(base.profile.firstCandidateMs)} ms しかない。
<strong>コストは重いレベルにちょうど乗っている</strong>——これがこのレバーが効く理由でもあり、
削ると読者が損をするのがまさにその重いレベルだという理由でもある。</p>
<p style="font-size:13px;color:#5B6672">この表は <code>buildAllViewsSvg</code> の計測なので、drill-down レベルだけでなく
deploy view（<code>layoutDeploy</code> も同じ探索を使う）も含む。再配置（<code>layout()</code> の 2 パス目）は
<code>searchWidthBudget</code> の外なのでどちらの列にも入っていない。</p>`,
    },
    {
      title: "最も重い 10 レベルの placement 回数",
      body: `${heaviest}
<p style="font-size:13px;color:#5B6672">レベルは today のレンダリング時間で選び、行はそのレベルでの
「候補 + 再配置」の合計。</p>`,
    },
    {
      title: "deploy view（ADR-2593 の動機になった図）",
      body: `${tbl(
        ["configuration", "canvas", "area", "aspect", "candidates", "compile (best of 5)", "SVG"],
        deploy.map((d) => [
          escapeHtml(data.results.find((r) => r.id === d.id)!.label),
          `${Math.round(d.width)} × ${d.height}`,
          `${d.areaMpx.toFixed(2)} Mpx`,
          d.aspect.toFixed(2),
          String(d.candidates),
          `${n1(d.compileMs)} ms`,
          d.hash === deploy[0].hash ? "today と同一" : "<strong>異なる</strong>",
        ]),
      )}
<p><code>layoutDeploy</code> は <code>size()</code> に <code>exhausted</code> を渡していないので、
<strong>常に 12 候補すべてを配置する</strong>。dify の deploy view ではその 12 回が
<strong>1 バイトも出力を変えない</strong>（floor がそのまま勝つ）。11 回ぶんの余分は
compile で ${n1(deploy[0].compileMs - deploy[deploy.length - 3].compileMs)} ms 前後。
ADR-2593 が記録した deploy の改善（1274 × 3686 → 今日の
${Math.round(deploy[0].width)} × ${deploy[0].height}）は、<strong>少なくとも現在のコードでは幅予算の探索から来ていない</strong>。
同 ADR のもう半分（deploy コンテナ内 unit の <code>ceil(sqrt(n))</code> 列）か、その後の変更に由来するはず——
探索を切っても同じキャンバスが出るので。<em>断定は保留</em>: ADR 当時のコードでは探索が勝っていた可能性を、
この spike では確認していない。</p>
<p style="font-size:13px;color:#5B6672">drill-down の walk は論理ビューだけを回るので、上のトレードオフ表の
面積合計に deploy view は入っていない。ここで別に測っているのはそのため。</p>`,
    },
    {
      title: "examples corpus",
      body: `<p>${examples.files.length} モデル / ${examples.totalLevels} drill-down レベルを全設定で描画した結果、
<strong>どの設定でも today と 1 バイトも変わらない</strong>（floor only を含む）。
ADR-2593 が「束ねられた examples 104 view は無変化」と書いたとおり、探索は examples では一度も勝っていない。
#2761 の受け入れ条件「examples corpus で選ばれる予算が変わらないこと」は、はしごを 1 段まで削っても満たされる。</p>
<p>同じパスで決定性も確認した: 各設定・各モデルで 2 回歩いて、ハッシュ不一致は
<strong>${examples.nondeterministic}</strong> 件。</p>`,
    },
    {
      title: "どのレベルが動くのか",
      body: `<p>${base.levels} レベルのうち、そもそも 2 個目の候補に進むのは
<strong>${base.levelsBeyondFirst}</strong> レベルだけ。したがってはしごを短くして変わりうるのもその範囲で、
実測では下のとおり。floor only（探索を丸ごと外す）で
<strong>${floor.svgChanged}</strong> レベルの SVG が変わり、面積は
${delta(floor.areaMpx, base.areaMpx, " Mpx")} になる。</p>
${movedTable}
<p>母集団が 405 レベルなので全体比では小さく見えるが、<strong>動いたレベルの中では 2 桁 %</strong> の
差になる。読者が損をするのはそのレベルを開いたときで、平均ではない。</p>
${changedSections || "<p>どの設定でも変化なし。</p>"}`,
    },
    {
      title: "結論と推奨",
      body: `
<p><strong>回数を減らすためにはしごを短くするのは、割に合わない。</strong> 取るとしても 12 → 8 の 1 段だけで、
それ以上は明確に損。</p>
<ul>
  <li><strong>12 → 8</strong>: 面積 +0.3 Mpx（405 レベル合計で +0.1%、動く 9 レベルの中でも +0.5%）で
      <strong>60 ms</strong>（all-views の −9.6%）。この 1 段だけは実質タダに近い。</li>
  <li><strong>12 → 6</strong>: 面積 +8.8 Mpx（+2.2%、動く 12 レベルでは +8.4%）で 85 ms。</li>
  <li><strong>12 → 4 / 3</strong>: 面積 +24.7 Mpx（+6.3%、動く 19 レベルでは +17.7%）で 143〜147 ms。
      <strong>floor only の面積コストの 95% を払って、時間の節約は 68% しか取れない</strong>——
      中途半端な短縮はフロンティアの外にある。</li>
  <li><strong>floor only</strong>（= ADR-2593 の探索を丸ごと撤回）: 面積 +26.0 Mpx（+6.6%、動く 20 レベルでは
      <strong>+18.4%</strong>）で <strong>210 ms</strong>。#2761 の受け入れ条件「最重量レベルで placement を
      2 回以下」を満たすのはこの設定<em>だけ</em>。</li>
  <li><strong>patience（賢い打ち切り）は買うものが無い。</strong> patience 2 は出力を 1 バイトも変えないが
      節約は 19〜23 ms でノイズと同程度。patience 1 は 2 レベル動かして 48 ms。どちらも
      TPL-2593 の「打ち切りは単調性で説明できる」を壊す対価に見合わない。</li>
</ul>
<p><strong>「割に合わない」と言い切れる根拠は、賞金の中身が routing だということ。</strong>
追加候補の 188 ms は all-views の 30% だが、その中身は 1 回あたりの配置コストであって回数ではない。
同じ 188 ms は <a href="https://github.com/kompiro/karasu/issues/2790">#2790</a>（routing の障害物を索引化）と
#2760 が<strong>出力を 1 バイトも変えずに</strong>削りにいく対象そのもの。回数を減らす前に単価を下げる方が、
ADR も snapshot churn も要らない。</p>
<p><strong>逆に、どの数字なら見合うか。</strong> #2790 が入って 1 候補あたりの原価が半分になれば、
はしごの残り賞金は 90 ms 前後になり、ADR を 1 本書く価値は無くなる。逆に #2790 が入らず、
親 Issue の受け入れ条件（all-views を約 600 ms 以下）を今すぐ満たす必要があるなら、
<strong>12 → 8 の 1 段だけがその条件を単独で満たす最安手</strong>（628 → 568 ms）で、
面積の代償は測れる範囲で最小（+0.1%）。</p>
<p>ついでに、<strong>出力を変えずに取れる回数削減が 1 つ残っている</strong>:
<code>layoutDeploy</code> に <code>exhausted</code> を渡すこと（下記「副次的な事実」2）。</p>`,
    },
    {
      title: "計測中に見つかった副次的な事実",
      body: `
<ol>
  <li><strong><code>analyze()</code> が AST を書き換えるので、同一プロセス内で「同じ入力 → 同じ SVG」が崩れる。</strong>
      <code>packages/core/src/resolver/warnings.ts</code> は sync cycle 上の辺に <code>edge.cyclic = true</code> を
      立てる。<code>buildAllViewsSvg</code> はその <code>analyze</code> を呼ぶので、<em>同じ <code>KrsFile</code> を</em>
      その前後で描画すると 405 レベルすべての SVG が変わる（cyclic 辺の配線・スタイルが変わり、キャンバス寸法も動く）。
      最初これで計測が壊れた。ハーネスは設定ごとにパースし直し、パース直後に <code>analyze</code> を通すことで揃えている。
      <code>compile()</code> は毎回パースし直すので製品パスでは表面化しないが、<code>KrsFile</code> を使い回す
      呼び出し側（app の <code>useViewSvg</code> のような）には順序依存が潜在する。</li>
  <li><strong><code>layoutDeploy</code> は <code>exhausted</code> を報告しない</strong>ので、deploy view は
      必ず 12 候補を配置する。上の表のとおり dify では出力が floor と同一なので、これは<em>出力を変えずに</em>
      減らせる回数（option 1/2 と同じ性質の作業で、option 3 のトレードオフを踏まない）。</li>
  <li><strong>#2761 本文の「386 of 405 levels exit after one placement」は実測と合わない。</strong>
      同じ計装で数えると、2 個目の候補へ進むのは <strong>${base.levelsBeyondFirst} レベル</strong>
      （drill-down ${base.levels} レベル中）、all-views 全体では
      <strong>${base.profile.searchesBeyondFirst} / ${base.profile.searches}</strong> 探索。
      探索・候補・再配置の総数（${base.profile.searches} / ${base.profile.candidates} / ${base.profile.replacements}）は
      Issue の数字と完全一致するので、計装ではなく Issue の一文の方が誤り。結論の向きは変わらない
      （それでも大多数のレベルは 1 回で抜ける）。</li>
</ol>`,
    },
  ],
};

writeFileSync("reports/width-budget-ladder/index.html", reportPage(options));
writeFileSync("reports/width-budget-ladder/artifact.html", reportFragment(options));
console.log("wrote reports/width-budget-ladder/index.html + artifact.html");
