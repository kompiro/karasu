// SPIKE (#2631 slice E): the fan-in trunk stays (aggregation is the intended
// reading), and the two things a reader cannot get from the junction dot alone
// are added on top. Two spike-only switches select what is drawn:
//
//   KARASU_TRUNK_VARIANT    shared (today) | bundle | none     — geometry
//   KARASU_TRUNK_LEGIBILITY off (today) | label | bus | count | tip | tipentry
//
// Run: pnpm exec tsx reports/trunk-sibling-corridor/build.ts

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml, pane, renderKrs, reportFragment, reportPage } from "../../scripts/report/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIFY = "/workspaces/dify/index.krs";

type Variant = "shared" | "bundle" | "none";
type Legibility =
  | "off"
  | "label"
  | "bus"
  | "count"
  | "tip"
  | "tiponly"
  | "tipentry"
  | "tipside";

const LEGIBILITY_LABEL: Record<Legibility, string> = {
  off: "現行（dot だけ）",
  tip: "案A: 本数 tip + 帯（entry まで）",
  tiponly: "案B: 本数 tip のみ（帯なし）",
  tipside: "案B: dot を残し数字を spine の脇に",
  tipentry: "案A + entry にも総数 tip",
  label: "参考: ラベルを stub へ（本数は示さない）",
  bus: "参考: 太さのみ（dot 併存、entry は細い）",
  count: "参考: entry の総数のみ（dot 併存）",
};

const VARIANT_LABEL: Record<Variant, string> = {
  shared: "trunk あり（現行）",
  bundle: "spine を 10px ピッチで分ける",
  none: "trunk を廃して完全分離",
};

function render(
  source: string,
  opts: {
    variant?: Variant;
    legibility?: Legibility;
    groupBy?: "team" | "boundary";
    hopRadius?: number;
    outTrunk?: boolean;
  },
): string {
  process.env.KARASU_TRUNK_VARIANT = opts.variant ?? "shared";
  process.env.KARASU_TRUNK_LEGIBILITY = opts.legibility ?? "off";
  process.env.KARASU_OUT_TRUNK = opts.outTrunk ? "1" : "0";
  if (opts.hopRadius === undefined) delete process.env.KARASU_HOP_RADIUS;
  else process.env.KARASU_HOP_RADIUS = String(opts.hopRadius);
  return renderKrs(source, opts.groupBy ? { groupBy: opts.groupBy } : {});
}

/** Namespaces ids so several copies of one diagram share a page safely. */
function isolate(svg: string, prefix: string): string {
  return svg
    .replaceAll(/\bid="([^"]+)"/g, (_m, id) => `id="${prefix}-${id}"`)
    .replaceAll(/url\(#([^)]+)\)/g, (_m, id) => `url(#${prefix}-${id})`)
    .replaceAll(/\bhref="#([^"]+)"/g, (_m, id) => `href="#${prefix}-${id}"`);
}

/** Re-frames an SVG onto `[x, y, w, h]` of its own coordinate system. */
function crop(svg: string, x: number, y: number, w: number, h: number, zoom = 1): string {
  return svg.replace(
    /^<svg[^>]*?viewBox="[^"]*"\s+width="[^"]*"\s+height="[^"]*"/,
    (m) =>
      m
        .replace(/viewBox="[^"]*"/, `viewBox="${x} ${y} ${w} ${h}"`)
        .replace(
          /width="[^"]*"\s+height="[^"]*"/,
          `width="${w * zoom}" height="${h * zoom}"`,
        ),
  );
}

let seq = 0;
function art(svg: string, label: string, note?: string) {
  return { label, svg: isolate(svg, `v${seq++}`), note };
}

/** N panes in a row — the built-in `pair()` only does two. */
function row(panes: { label: string; svg: string; note?: string }[], caption: string): string {
  const cells = panes
    .map(
      (p) =>
        `<figure class="pane"><div class="label">${escapeHtml(p.label)}</div>` +
        `<div class="art dark">${p.svg}</div>` +
        (p.note ? `<div class="note">${escapeHtml(p.note)}</div>` : "") +
        `</figure>`,
    )
    .join("\n");
  return (
    `<div class="pair" style="grid-template-columns: repeat(${panes.length}, 1fr);">\n${cells}\n</div>` +
    `<figcaption>${escapeHtml(caption)}</figcaption>`
  );
}

const fanin3 = readFileSync(resolve(HERE, "fanin3.krs"), "utf8");
const fanin8 = readFileSync(resolve(HERE, "fanin8.krs"), "utf8");
const dify = readFileSync(DIFY, "utf8");

const MAIN: Legibility[] = ["off", "tip", "tipside"];
const REFERENCE: Legibility[] = ["label", "bus", "count", "tipentry"];

// --- Sections -------------------------------------------------------------

const intro = `
<p><strong>方向。</strong> trunk（集約）は ADR-1859 P2c-B のとおり残す。ただし合流点のマークは
<em>dot から本数 tip へ置き換える</em>。dot だけでは読めない 2 つを、幾何を変えずに足す。</p>
<ol>
  <li><strong>どのラベルがどのエッジか。</strong> trunk エッジのラベルは既定の「最長セグメントの中点」
  規則に従うため、最長である <em>共有 spine</em> の中点に落ちる。N 本ぶんのラベルが、誰のものでもない
  1 本の線の脇に縦に並ぶ。→ 各エッジの <em>stub</em>（そのエッジだけの横線）へ移す。</li>
  <li><strong>合流後の 1 本が何本ぶんか。</strong> → 合流点の dot を「いま何本ぶんか」の tip に置き換え、
  spine を本数ぶん太くし、その帯を <em>target へ入る共有の横線（entry）まで L 字で延ばす</em>。</li>
</ol>
<pre><code>x=1060        1460      1572
                          │        ← 1 本
 DifyCli ─────────────────┤ y=355     stub は DifyCli だけのもの → ラベルはここ
                          │
 ThirdParty ──────────────②  y=2116   ← dot の代わりに「2」（ここから 2 本ぶん）
                          ┃           ← 太さも 2 本ぶん
    Gateway ◀━━━━━━━━━━━━━┛ y=2860    ← entry も 2 本ぶんの帯（512px）</code></pre>
<p>以下はすべて spike ブランチで実装して描いたもの。</p>
`;

const smallRow = row(
  MAIN.map((l) =>
    art(render(fanin3, { legibility: l, groupBy: "team" }), LEGIBILITY_LABEL[l]),
  ),
  "3 サービスが 1 つの ShopDB に入る例（Group by: team、うち 2 本が trunk）。現行の 2 つの “write” は共有 spine の脇に浮いていて、Checkout のものか Billing のものか読めない。採用案では各エッジの stub の上に戻り、合流点の dot が「2」になり、entry まで 2 本ぶんの帯が続く。",
);

const bigRow = row(
  MAIN.map((l) =>
    art(render(fanin8, { legibility: l, groupBy: "team" }), LEGIBILITY_LABEL[l]),
  ),
  "8 サービスが 1 つの ShopDB に入る例（うち 7 本が trunk）。現行はラベル 7 つが spine の脇に一列に並び対応が失われる。採用案は tip が 2→3→4→5→6→7 と上がり、帯も同じ刻みで太くなる。右端は entry にも総数 tip を置いた場合。",
);

const crossing = readFileSync(resolve(HERE, "crossing.krs"), "utf8");

/** Renders `crossing.krs` with the hop-clearance adjustment turned off. */
function renderUnfixed(legibility: Legibility, source: string): string {
  process.env.KARASU_TRUNK_HOPFIX = "0";
  const svg = render(source, { legibility, groupBy: "team" });
  delete process.env.KARASU_TRUNK_HOPFIX;
  return svg;
}

const crossSpine = row(
  [
    art(crop(render(crossing, { legibility: "off", groupBy: "team" }), 680, 850, 110, 100), "現行（帯なし）"),
    art(crop(renderUnfixed("tip", crossing), 680, 850, 110, 100), "帯あり・アーチ未対応"),
    art(crop(render(crossing, { legibility: "tip", groupBy: "team" }), 680, 850, 110, 100), LEGIBILITY_LABEL.tip),
    art(crop(render(crossing, { legibility: "tipside", groupBy: "team" }), 680, 850, 110, 100), LEGIBILITY_LABEL.tipside),
  ],
  "4 本ぶん（帯 10px）の spine を 2 本の外向きエッジが横切るところ。左端が現行。2 枚目は帯を足しただけの状態で、8px のアーチが帯に埋もれ、さらに本数 tip が交差点そのものを覆っている（交差＝非接続が、合流＝接続のマークに隠れる）。3・4 枚目が対策後。",
);

const crossEntry = row(
  [
    art(crop(render(crossing, { legibility: "off", groupBy: "team" }), 640, 2050, 180, 90), "現行（帯なし）"),
    art(crop(renderUnfixed("tip", crossing), 640, 2050, 180, 90), "帯あり・アーチ未対応"),
    art(crop(render(crossing, { legibility: "tip", groupBy: "team" }), 640, 2050, 180, 90), LEGIBILITY_LABEL.tip),
  ],
  "7 本ぶん（帯 19px）の共有 entry を縦のエッジが横切るところ。未対応だとアーチが完全に消え、縦線が帯に合流したように読める。対策後はアーチが帯の外へ出る。",
);

const difyFull = row(
  MAIN.map((l) =>
    art(render(dify, { legibility: l, groupBy: "boundary" }), LEGIBILITY_LABEL[l]),
  ),
  "実モデル（reverse-engineered dify、root view、Group by: boundary）。全体像。このモデルの service 間エッジはラベルを持たないので、ラベル移動の効果はここには出ない（ラベルのないモデルでは現行と 1 バイト差ない）。",
);

const difyEntry = MAIN
  .map((l) => {
    const a = art(
      crop(render(dify, { legibility: l, groupBy: "boundary" }), 700, 2700, 960, 320),
      LEGIBILITY_LABEL[l],
    );
    return pane({ label: a.label, svg: a.svg, background: "dark" });
  })
  .join("\n");

const fanout8 = readFileSync(resolve(HERE, "fanout8.krs"), "utf8");

const outTrunkRow = row(
  [
    art(render(fanout8, { legibility: "off", groupBy: "team" }), "現行"),
    art(render(fanout8, { legibility: "tip", groupBy: "team", hopRadius: 6 }), "案A（fan-in のみ）"),
    art(
      render(fanout8, { legibility: "tip", groupBy: "team", hopRadius: 6, outTrunk: true }),
      "案A + fan-out trunk",
    ),
  ],
  "1 つの Gateway から 8 本が出る例（Group by: team）。現行と案A では 7 本がカード辺に扇状に並び、それぞれ独自の回廊を取る。fan-out trunk では 1 本の spine として出て、各 target の行で枝が抜けるたびに tip が 7→6→5→4→3→2 と減り、帯も同じ刻みで細くなる。ラベルは枝ごとの stub に乗る。",
);

const outTrunk = `
<p>fan-in（同じ target へ入る束）を扱う P2c-B の<strong>鏡像</strong>。同じ source から出るガター経路を
1 本の spine にまとめ、各 target の行で枝を落とす。合流ではなく分岐なので、tip は下るほど<strong>減っていく</strong>。</p>
${outTrunkRow}
<p><strong>計測（dify、アーチ 6px・案A の描画で固定）。</strong> 非兄弟の重なりと貫通は 0 のまま:</p>
<table>
  <tr><th>ビュー</th><th>fan-out した本数</th><th>hop 数</th><th>アーチ同士の近接</th><th>キャンバス</th></tr>
  <tr><td>team（現状）</td><td>0</td><td>147</td><td>36</td><td>2176x3373 / 7.34Mpx</td></tr>
  <tr><td>team（fan-out 有効）</td><td>8</td><td><strong>122</strong></td><td><strong>4</strong></td><td>2104x3373 / <strong>7.10Mpx</strong></td></tr>
  <tr><td>boundary（現状）</td><td>0</td><td>156</td><td>39</td><td>1824x2935 / 5.35Mpx</td></tr>
  <tr><td>boundary（fan-out 有効）</td><td>5</td><td><strong>123</strong></td><td><strong>0</strong></td><td>1752x2935 / <strong>5.14Mpx</strong></td></tr>
  <tr><td>合成 fan-out 8（現状 → 有効）</td><td>0 → 7</td><td>—</td><td>—</td><td>468 → <strong>348</strong> 幅 / 1.05 → <strong>0.78</strong>Mpx</td></tr>
</table>
<p>交差が 2 割減り、キャンバスも 3〜4% 縮む。ガター回廊を 1 本ずつ取っていたものが 1 本にまとまるので、
レーンが空くのがそのまま幅の縮小になる。examples と、source が別々の合成 fixture では 1 バイトも変わらない
（束が成立しないので何も起きない）。</p>
<p><strong>これは ADR-1859 AC-2 の拡張ではなく新しい決定。</strong> AC-2 は「同一 target への複数エッジを
1 トランクに」としており、source 側は対象外。出口を共有することの意味（「この node からまとめて出る」）を
notation としてどう位置づけるかは、slice E とは別に決める必要がある。</p>
`;

const AB = ["off", "tip", "tiponly"] as Legibility[];

const abBig = row(
  AB.map((l) =>
    art(render(fanin8, { legibility: l, groupBy: "team", hopRadius: 6 }), LEGIBILITY_LABEL[l]),
  ),
  "fan-in 8（うち 7 本が trunk）、アーチはどちらの案も 6px。案A は帯の太さでも本数を示し、共有 entry まで束として続く。案B は tip の数字だけで示し、線の太さは現行のまま。ラベルが各エッジの stub に乗るのは両案共通。",
);

const abEntry = AB.map((l) => {
  const a = art(
    crop(render(dify, { legibility: l, groupBy: "boundary", hopRadius: 6 }), 700, 2700, 960, 320, 1),
    LEGIBILITY_LABEL[l],
  );
  return pane({ label: a.label, svg: a.svg, background: "dark" });
}).join("\n");

const ab = `
<p>案B は案A から<strong>帯だけを外した</strong>もの。合流点の dot を本数 tip に置き換える点、アーチ 6px、
ラベルを stub に移す点は共通で、違いは「合流後の 1 本を太く描くかどうか」だけ。</p>
<ul>
  <li><strong>案A</strong> — 本数が線の太さに出るので、図を俯瞰したときに「ここが束だ」と分かる。共有 entry も
  束として描かれる。そのぶん装飾が増え、帯の上の交差アーチは帯の外へ出す調整が要る（前節）。</li>
  <li><strong>案B</strong> — 増えるのは合流点の数字だけ。現行の線の細さを保ったまま「何本ぶんか」が読める。
  俯瞰では束であることが分からず、数字を読むために寄る必要がある。帯が無いので交差アーチの調整も不要。</li>
</ul>
${abBig}
${abEntry}
`;

const RADII = [4, 6, 8, 9];

const arcSizeLanes = row(
  RADII.map((r) =>
    art(
      crop(render(dify, { legibility: "tip", groupBy: "team", hopRadius: r }), 1840, 1140, 110, 60, 6),
      `半径 ${r}px${r === 4 ? "（現行）" : r === 9 ? "（tip と同じ大きさ）" : ""}`,
    ),
  ),
  "dify / Group by: team。約 10px 間隔で並ぶ横線が縦の回廊を横切るところを 6 倍に拡大。半径 4 は小さすぎて見落としやすく、6 は各アーチが自分の線の上に収まる。8 で上の線に迫り、9 では上の線に届いてアーチの帯が連なり、どの線のアーチなのか分からなくなる。",
);

const arcSizePorts = row(
  [4, 6, 9].map((r) =>
    art(
      crop(render(dify, { legibility: "off", hopRadius: r }), 840, 975, 70, 60, 6),
      `半径 ${r}px${r === 4 ? "（現行）" : ""}`,
    ),
  ),
  "dify / Group by: none（帯は存在しない）。1 つのカード辺から 8 本が扇状に出る最混雑部を 6 倍に拡大。半径 5 以上でアーチの足がカード際のギャップに食い込み始める。",
);

const arcSize = `
<p>ご要望の「tip と同じ大きさ（半径 9px）の半円」を含めて半径を振り、機械的に測った。
判定項目は 3 つ:</p>
<ul>
  <li><strong>隣の平行線に触る</strong> — アーチの立ち上がりが隣の線に届くと、どちらの線のアーチか読めない</li>
  <li><strong>カードに食い込む</strong> — アーチの矩形が、そのエッジの端点でないカードに重なる</li>
  <li><strong>ポート際のギャップ</strong> — host 線に空くギャップ（幅 2 × 半径）が接続点まで届き、線がカードから外れて見える</li>
</ul>
<table>
  <tr><th>半径</th><th colspan="3">Group by: none</th><th colspan="3">team</th><th colspan="3">boundary</th></tr>
  <tr><th></th><th>隣に触る</th><th>カード</th><th>ポート</th><th>隣に触る</th><th>カード</th><th>ポート</th><th>隣に触る</th><th>カード</th><th>ポート</th></tr>
  <tr><td>4（現行）</td><td>2</td><td>0</td><td>2</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
  <tr><td>5</td><td>2</td><td>1</td><td>8</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
  <tr><td>6</td><td>2</td><td>4</td><td>8</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
  <tr><td>7</td><td>11</td><td>4</td><td>9</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
  <tr><td>8</td><td>20</td><td>4</td><td>9</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
  <tr><td>9（tip と同じ）</td><td>20</td><td>4</td><td>9</td><td><strong>45</strong></td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
</table>
<p>examples/ の 4 モデル（hato / hr-tool / getting-started / ec-platform 04）は半径 9 でも全項目 0。
つまり問題が出るのは 10,000 行規模の実モデルの最混雑部だけ。</p>
<p><strong>拘束しているのは lane pitch ではなくポート fan の間隔だった。</strong>
<code>LANE_PITCH</code>（14px）を 22px に広げても team の 45 件は 1 件も減らず、面積も変わらない
（7.34Mpx のまま）。実際に触っている相手は <code>fanOutGutterPorts</code> が 1 つのカード辺に
並べた線で、その間隔は「辺の使える長さ ÷ 本数」なので混雑した辺では 9.6px まで詰まる。
tip と同じ 9px を通すには fan の間隔に下限を設ける必要があり、それは配置に返る変更（slice E の外）。</p>
${arcSizeLanes}
${arcSizePorts}
`;

const metrics = `
<p><strong>幾何は 1px も動かない。</strong> 変えているのはラベルのアンカーと装飾だけで、経路・ポート・
キャンバスは現行のまま。dify root view（Group by: boundary）の計測:</p>
<table>
  <tr><th>案</th><th>重なり v</th><th>重なり h</th><th>貫通</th><th>合流マーク</th><th>キャンバス</th><th>再描画</th></tr>
  <tr><td>現行（dot）</td><td>1</td><td>2</td><td>0</td><td>● 2 個</td><td>1824x2935</td><td>stable</td></tr>
  <tr><td>採用案（tip）</td><td>1</td><td>2</td><td>0</td><td>tip 2 個（dot は 0）</td><td>1824x2935</td><td>stable</td></tr>
  <tr><td>採用案 + entry tip</td><td>1</td><td>2</td><td>0</td><td>tip 2 + entry 2</td><td>1824x2935</td><td>stable</td></tr>
</table>
<p>残る重なり v=1 / h=2 は trunk 兄弟が spine と entry を設計どおり共有しているぶん。これを
「バグ」ではなく「集約の表現」と確定するのが本スライスの判断で、上の手当てはその表現を読めるようにするもの。</p>
<p>ラベルを持たないモデル（dify を含む）ではラベル移動ぶんの差分は出ない（同一ハッシュ）。
差分が出るのは trunk エッジにラベルがあるモデルだけ。</p>
<p><strong>交差マークの生存。</strong> 帯に載る hop を機械的に数えた結果:</p>
<table>
  <tr><th>モデル</th><th>帯に載る hop</th><th>アーチ未対応</th><th>対策後</th></tr>
  <tr><td>dify root / boundary（帯は 2 本ぶん = 4px）</td><td>6</td><td>6 visible</td><td>6 visible</td></tr>
  <tr><td>合成 crossing（帯は 4 本ぶん = 10px, 7 本ぶん = 19px）</td><td>2</td><td>2 SWALLOWED</td><td>2 visible</td></tr>
</table>
<p>判定は「アーチの高さ・幅が帯の半幅を超えるか」。対策は hop を帯の半幅 + 3px まで広げ・高くするだけで、
交差の位置も host セグメントの選び方も変えない。core のテスト 4580 件は全て通ったまま（既定は
<code>off</code> なので既定経路は不変）。</p>
`;

const appendix = `
<p>採用案に至るまでに描いた中間案。いずれも dot を残したままなので、合流マークが 2 種類
（dot と数字 / 太さ）になる。</p>
${row(
  REFERENCE.map((l) => art(render(fanin8, { legibility: l, groupBy: "team" }), LEGIBILITY_LABEL[l])),
  "fan-in 8。左: ラベルだけ直した状態（本数は不明）。中: 太さだけ（entry は細いまま）。右: entry の総数だけ。",
)}
<p>trunk そのものをやめる 2 案も測った。どちらも重なりは 0 になるが、
<strong>junction dot / tip が 1 つも描けなくなる</strong>（合流マークは「spine がその点より上へ伸びる
T 字」にだけ打つ設計なので、spine を分けると T 字が消える）。つまり「集約である」という情報を
図から落とす。</p>
${row(
  (["shared", "bundle", "none"] as Variant[]).map((v) =>
    art(render(fanin8, { variant: v, groupBy: "team" }), VARIANT_LABEL[v]),
  ),
  "fan-in 8。幅は 348px →（bundle）408px →（none）468px。合流マークはそれぞれ 6 / 0 / 0。",
)}
`;

const open = `
<h3>実装前に詰めるところ</h3>
<ul>
  <li><strong>帯の角。</strong> spine と entry の帯は butt cap で突き合わせているので、外側の角に
  小さな切り欠きが出る。1 本のポリゴン（テーパー付き）で描くか、角に丸めを入れるか。</li>
  <li><strong>帯の太さの刻み。</strong> 現在は 1 本増えるごとに +3px、8 本ぶんで頭打ち、不透明度 0.4。
  fan-in の大きいモデルでの上限は要調整（sqrt にすると 7 本でも差が読めなくなったので線形にした）。</li>
  <li><strong>stub が短いとラベルが溢れる。</strong> dify で 112px、上の合成例で 69px。長いラベルは
  カードに被りうるので #2048 の衝突回避との噛み合わせを詰める。</li>
  <li><strong>案A と案B のどちらにするか。</strong> 案A（tip が dot を置き換える）は交差と衝突したとき
  tip を spine 上で 21px ずらして避ける。案B（dot を残して数字を脇に置く）は構造的に衝突しない代わりに、
  マークが 2 つに分かれる。</li>
  <li><strong>entry tip の位置。</strong> entry 帯の中点に置いている。矢印寄りの方が良いかもしれない。</li>
  <li><strong>アーチの既定半径をいくつにするか。</strong> 上の節のとおり、grouped を現行水準に保てる
  上限は 8px、examples だけ見るなら 9px でも破綻しない。1.5 倍の 6px が安全側。</li>
</ul>
`;

const options = {
  title: "#2631 slice E — trunk の合流を本数 tip と帯で読ませる",
  lang: "ja",
  subtitle: "dot を本数 tip に置き換え、spine の太さで本数を示し、共有 entry まで帯を延ばす",
  meta: ["spike/trunk-sibling-corridor", "Issue #2631", "ADR-1859 P2c-B / ADR-2598"],
  sections: [
    { title: "前提", body: intro },
    { title: "最小の例（fan-in 3）", body: smallRow },
    { title: "混雑した例（fan-in 8）", body: bigRow },
    { title: "案A と案B", body: ab },
    { title: "出ていく束も同じ形にできるか（fan-out trunk）", body: outTrunk },
    { title: "交差マークは生き残るか — spine", body: crossSpine },
    { title: "交差マークは生き残るか — 共有 entry", body: crossEntry },
    { title: "実モデル: dify root（Group by: boundary）", body: difyFull },
    { title: "同じ図の拡大 — Gateway の entry", body: difyEntry },
    { title: "アーチをどこまで大きくできるか", body: arcSize },
    { title: "計測", body: metrics },
    { title: "詰めるところ", body: open },
    { title: "参考: 中間案と trunk をやめる案", body: appendix },
  ],
};

mkdirSync(HERE, { recursive: true });
writeFileSync(resolve(HERE, "index.html"), reportPage(options));
writeFileSync(resolve(HERE, "artifact.html"), reportFragment(options));
console.log("wrote reports/trunk-sibling-corridor/{index,artifact}.html");
