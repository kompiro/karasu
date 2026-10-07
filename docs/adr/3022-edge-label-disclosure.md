---
id: ADR-3022
title: "edge ラベルを段階的に開示する — canvas は置けるラベルだけを描き、全文は focus canvas で読む"
status: accepted
date: 2026-10-05
topic: renderer
related_to:
  - ADR-2048
  - ADR-2360
  - ADR-1184
  - ADR-968
  - ADR-1554
  - ADR-463
scope:
  packages: [core, app]
assumptions:
  - "file: packages/core/src/renderer/edge-label-disclosure.ts"
  - "symbol: packages/core/src/renderer/edge-label-disclosure.ts :: displayEdgeLabel"
  - "symbol: packages/core/src/renderer/edge-label-disclosure.ts :: canvasLabel"
  - "grep: packages/core/src/resolver/style-resolver.ts :: labelMaxChars: 48"
  - "grep: packages/core/src/resolver/style-resolver.ts :: labelDisplay: \"auto\""
  - "grep: packages/core/src/renderer/edge-routing.ts :: data-edge-label-withheld"
  - "symbol: packages/core/src/index.ts :: estimateTextWidth"
  - "file: packages/app/src/components/focus-canvas/build.ts"
  - "symbol: packages/app/src/components/focus-canvas/build.ts :: buildFocusCanvas"
  - "symbol: packages/app/src/components/focus-canvas/node-focus.ts :: attachNodeFocus"
  - "file: packages/app/src/components/focus-canvas/FocusCanvas.tsx"
  - "file: packages/core/src/renderer/fixtures/dense-domain-canvas.krs"
---

# ADR-3022: edge ラベルを段階的に開示する — canvas は置けるラベルだけを描き、全文は focus canvas で読む

- **日付**: 2026-10-05
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3022](https://github.com/kompiro/karasu/issues/3022)（親）、slice A [#3030](https://github.com/kompiro/karasu/issues/3030)、slice B [#3031](https://github.com/kompiro/karasu/issues/3031)
  - PR: design [#3025](https://github.com/kompiro/karasu/pull/3025) / [#3037](https://github.com/kompiro/karasu/pull/3037)、実装 [#3033](https://github.com/kompiro/karasu/pull/3033)（slice A）/ [#3055](https://github.com/kompiro/karasu/pull/3055)（slice B）
  - writer 側: [#3018](https://github.com/kompiro/karasu/issues/3018)（`reverse-architecture` スキルが短いラベルを書く）
  - 関連 ADR: [ADR-2048](2048-edge-label-collision-avoidance.md)（ラベルの自動衝突回避）, [ADR-2360](2360-label-placement-line-obstacles.md)（他の edge の線を障害物に含める）, [ADR-1184](1184-edge-label-position-offset.md)（`label-position` / `label-offset`）, [ADR-968](968-orthogonal-edge-routing-skip-layer.md)（ghost / cyclic edge を幾何パスから除外）, [ADR-1554](1554-edge-label-in-context-menu.md)（`data-edge-label`）, [ADR-463](463-implicit-edge-detail-panel.md)（edge の詳細パネル）
  - TPL: [TPL-3022](../test-perspectives/TPL-3022-withheld-content-stays-reachable.md)（本件で起こした proactive TPL）, [TPL-2048](../test-perspectives/TPL-2048-label-placement-measured-and-byte-stable.md), [TPL-2174](../test-perspectives/TPL-2174-opt-in-visual-layer-is-inert-when-off.md), [TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md), [TPL-1227](../test-perspectives/TPL-1227-writer-reader-asymmetry.md), [TPL-1468](../test-perspectives/TPL-1468-overlay-z-index-scale.md), [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)
  - 受け入れテスト: [edge-label-disclosure.md](../acceptance/edge-label-disclosure.md)（slice A）, [edge-label-focus-canvas.md](../acceptance/edge-label-focus-canvas.md)（slice B）
  - spike: `spike/3022-edge-label-disclosure`（計測スクリプトと 2 回の試作）

## 背景

`reverse-architecture` スキルで起こした Umami モデルの `UmamiApp` drill-down が読めなかった。
domain 10 個に対して domain 間 edge が 41 本あり、全部に根拠を書いた長いラベルが付いている
（中央値 76 文字、最長 135 文字）。renderer 自身の判定（`label-placement.ts` の `countLabel*`）で
数えると、ラベルと card の衝突が 22 件、ラベル同士が 20 件、ラベルと他の edge の線が 24 件あった。

読めない原因は 2 つあり、片方だけ直しても残る。

1. **ラベルが長い。** ADR-2048 の自動配置は約 90 px の範囲でしかラベルを動かせず、canvas 幅の
   4 分の 1 を占めるラベルには効かない。ADR-2048 はこの場合をスコープ外に残していた。
2. **線が多い。** 10 node に 41 本の線が走る canvas には、短いラベルにも置き場が無い。ラベルを
   24 文字まで縮めても衝突は 17 件残った。

roadmap は progressive edges を「混雑の主因が edge 側だと確認できたら Issue 化」としており、
node 10 個で読めなくなる本件がその確認にあたる。

本 ADR は ADR-2048 の「ghost / cyclic edge は配置パスの対象外」と、ADR-2360 の「移動対象から
引き続き外す」「best-effort の性格を維持する」を、`label-display: auto` について改める
（「決定」の 3）。ラベルを保留できるのは配置パスが見たラベルだけで、パスが見ないラベルは衝突
したまま描かれるため、この前提を変える必要が生じた。

## 決定

**canvas は「重ならずに置けるラベルを、上限文字数まで」だけ描き、描かなかったものは edge 自身が
全文を持ち続ける。全文は段階的な操作で必ず読めるようにし、その最後の段として、対象の card と
edge だけをラベル全文で描く 2 枚目の canvas（focus canvas）を preview の上に開く。**

### 段の定義

| 段 | 操作 | 出るもの | 実装 |
| --- | --- | --- | --- |
| 0 canvas | なし | 上限文字数までのラベルのうち、衝突せずに置けるもの | core（`renderEdge` と配置パス） |
| 1 node focus | card に hover | その node に繋がらない edge を薄くする。card の右上に `⇄ Relations N` | app |
| 2 edge hover | 線に hover | ブラウザ標準の tooltip（`<title>`）で全文 | core（全 surface） |
| 3 focus canvas | 線をクリック、または `Relations` | 対象の card と edge だけをラベル全文で描く 2 枚目の canvas | app |
| 4 詳細パネル | 集約 edge のラベル、property block を持つ edge をクリック | 内訳 / `description` / `link`（既存） | app |
| 5 drill-down | card をクリック | 下の階層（既存） | core |

### canvas の段（slice A、core）

1. **2 つの style property。** `label-max-chars: <n> | none`（既定 `48`）と
   `label-display: auto | always | hover`（既定 `auto`）。`always` は従来の挙動、`hover` は
   canvas に描かない。今日の挙動に戻すには `edge { label-max-chars: none; label-display: always; }`。
2. **省略。** 上限を超えるラベルは単語の境界で切って `…` を付ける。`…` を含めて上限を超えず、
   結合文字や絵文字の連結の途中では切らない。描く文字列の定義は `canvasLabel` /
   `displayEdgeLabel` の 1 箇所に置き、配置パス（幅の計測）と `renderEdge`（描画）が同じものを読む。
3. **保留。** `auto` のラベルは、最良の候補でも card・他のラベル・他の edge の実線と**衝突する**
   ときだけ描かない。自分の線より他の線に近いだけ（ADR-2360 の ambiguity）では外さない。
   保留したラベルは後続のラベルの障害物にならない。`auto` のときは ghost / cyclic edge の
   ラベルも配置パスに入れ、ghost のラベルは実線のラベルの後に置く。ghost の線は引き続き障害物に
   しない。cyclic の線は、canvas に `auto` のラベルが 1 本でもあれば、ラベルの有無にかかわらず
   障害物にする。`resolveLabelPlacements` の signature は変えず、結果は入力に書き戻す
   （ADR-2360 の assumption が呼び出しの形を grep しているため）。
4. **保留しないもの。** 機械生成のラベル（`W` / `R`、`N domain edges`）は `data-edge-label` に
   載らない（ADR-1554）ので、保留も省略もしない。集約 edge のラベルは内訳パネルを開くクリックの
   的なので保留しない。`label-position` / `label-offset` を書いたラベルは author の指定が勝つ
   （ADR-1184）。
5. **到達の経路。** 保留・省略した edge にだけ `data-edge-label-withheld="deferred|truncated"` と
   `<title>`（全文）を付ける。`data-edge-label` は従来どおり全 edge にある。何も保留していない
   edge の出力は変えない（TPL-2174）。静的出力・drill-down・all-views・deploy も同じ既定で、
   どの surface でも `<title>` で全文に届く（TPL-219、TPL-3022）。

### focus canvas の段（slice B、app）

6. **何が開くか。** edge のクリックで、両端の card と、その 2 つの間の edge 全部（逆向きも）が
   1 本 1 行で開く。クリックした向きが先頭。`Relations` で、中央にその node、左にそれに依存する
   node、右にそれが依存する node が 1 edge 1 行で開く。ラベルは上限文字数にかかわらず全文を
   300 px で折り返し、自分の線のすぐ上に置く。中の card でその node へ、node の canvas の行で
   その組へ移り、`← Back` で戻る。`✕ Close`・Esc（入力欄とエディタの中を除く）・背景のクリックで
   閉じる。
7. **入口。** ラベルだけの edge のクリックは focus canvas を開く。既存の詳細パネルを開く edge
   （集約 edge、`data-edge-description` / `data-edge-links` を持つ edge）は今までどおりパネルを
   開く。node の入口は hover で出る `⇄ Relations N`（card のクリックは drill-down なので使えない）。
   edge の canvas と node の canvas は一緒に出す。線をクリックできる点が 1 つも無い edge があり
   （Umami で 41 本中 1 本）、node の canvas はその edge にも両端から届くため（TPL-3022）。
8. **組み立て。** focus canvas は、画面上の SVG から読む純粋関数（`buildFocusCanvas`）で作る。
   card は `[data-node-id]` の group を複製し、`data-*` 属性をすべて外して置く（複製や pill が
   card を探す query に当たらないように）。card の大きさは描画に頼らず、card が描く図形
   （rect・楕円・多角形・弧や曲線を含む path・平行移動）から計算する。database の円柱や queue
   のように `<rect>` を持たない card も同じに読む。文字幅は core の `estimateTextWidth` を使う。
   これで同じ入力はどの環境でも同じ配置になり、衝突の数を unit test で数えられる。
   `Relations` の数は「両端が card の edge」だけを数え、開いたときの行数と一致させる。
9. **並べ方は幅で変えない。** focus canvas は地図として読む。同じ node はどの幅の preview でも
   同じ絵になり、原寸のまま panel の中でスクロールする。開いたときは対象（node、または edge の
   組の中央）が panel の中央に来る。縮小もしない。
10. **操作。** メインの canvas と同じく、ドラッグで表示範囲を動かす。動かしたドラッグは、離した
    位置の card や行のクリックにならない。ラベルと card の文字の上で押したときはドラッグせず、
    文字を選択できる。選択を終えたクリックでは移動しない。
11. **重なり方。** preview pane の中の、modal でない overlay にする。エディタはそのまま使え、
    source を編集すると開いたまま追従し、対象が無くなったら閉じる。`z-index` は `--z-panel`
    （TPL-1468）。hover の表現（edge を薄くする規則と pill）は React state を使わない DOM
    モジュール（`node-focus.ts`）に置く（AT-1186 の AT-D）。

## 理由

- **衝突が 0 になる。** fixture（`dense-domain-canvas.krs`。Umami を domain 階層に縮約したもの）で、
  衝突は 66 件から 0 件になり、canvas に 13 本のラベルが残る。手元の reverse モデルの system 側
  （全 drill-down 階層）でも、dify 185 → 9、twenty 833 → 8、wordpress 169 → 6、hato 11 → 0 件に
  減った。残るのはすべて保留の対象外にした `W` / `R` マーカーである。
- **既存の図は変わらない。** `examples/` の全 all-views バンドルで省略も保留も 0 件。変わるのは
  card に重なっていた ghost のラベル 35 本の位置だけで、どれも重ならない位置へ動いた。
- **48 文字は実モデルで選んだ。** 上限を上げると省略されていたラベルの多くが全文で描け、canvas
  から外れる本数の増加はその数分の 1 に留まる。56 を超えると全文で描けるラベルはほとんど増えず、
  ラベルが node card（約 364 px）より広くなる。密な図は図ごとに `label-max-chars` を詰める。
- **focus canvas では何も重ならない。** fixture の全 10 node と全 27 組（うち 14 組は両方向）で、
  ラベルと card、ラベル同士、線とラベル、線と card の内側の衝突が 0 件。builder の配置定数を
  壊すとこの unit test が落ちる。
- **全文に届く経路がどの surface にもある。** 静的出力は `<title>`、app は `<title>` と focus
  canvas。focus canvas の中では省略しない（ADR-1554 が context menu での省略を却下したのと同じ理由）。
- **writer に依存しない**（TPL-1227）。#3018 で writer 側が短いラベルを書けば canvas に残る本数は
  増えるが、既に公開されたモデルと手書きのモデルにも本件は効く。

## 却下した案

- **writer 側だけ直す（#3018 のみ）。** 衝突が 18 件残る。線の密度が解消しないため。公開済みの
  モデルにも効かない。
- **canvas で省略するだけ。** 40 文字で 36 件、24 文字でも 17 件の衝突が残る。24 文字ではラベルの
  意味がほぼ読めない。
- **密な canvas ではラベルを全部隠す。** 置ける 13 本も捨てる。閾値の前後で図が不連続に変わり、
  edge を 1 本足しただけで全ラベルが消えることがある。
- **ラベルのために canvas を広げる。** ADR-2048 が却下済み（TPL-1223 の密度上限とも逆行する）。
- **衝突しないが曖昧なラベルも外す。** 1 回目の spike はこうしていた。同じ 40 文字で比べると
  canvas に残るのが 11 本に対して 16 本で、衝突はどちらも 0 件。近さは置き場所を選ぶための
  コストで、描くかどうかの基準ではない。
- **node focus でラベルを短い形で全部出す。** 32 文字に省略しても合計 40 件、最悪の node で
  13 件衝突する。線を絞っても card の位置は変わらないため。ラベルの開示は focus canvas に任せる。
- **app 独自の HTML tooltip（1 回目の spike）。** 一度に 1 本しか読めず、hover の無い端末に経路が
  無い。全 surface に `<title>` を出した時点でブラウザが同じ tooltip を出すので、同じものが 2 つに
  なる。SVG の中に全文を隠し持つ形は、edge が node より先に描かれるので card の裏に回った。
- **「surface が自前の tooltip を持つか」を表す render option。** app もブラウザの tooltip を使う
  ので要らない。
- **hop（交差の弧）の持ち主属性を出し、node focus で hop も薄くする。** SVG が約 9 % 大きくなる。
  hop の描き方は #2956 で変わるので、そちらに合わせる。
- **focus canvas の接続先を小さな chip で描く / 放射状に並べる。** 要望は「mini でなくてよい、
  段階的に開示できればよい」で、card の複製なら見た目がメインの canvas と一致する。放射状では
  文字を置く場所が無く、hub ではメインの canvas と同じ衝突が起きる。
- **core が部分グラフを通常の renderer で描く。** 通常の配置はラベルを線の中点に置くので、hub に
  集まるラベルが再び衝突する。app が card を複製すれば足りる。
- **preview の幅で並べ方を切り替える（3 列 / 縦 1 列、spike）。** 地図として不自然。境界を動かした
  だけで絵が組み変わる。原寸のままスクロールする（ユーザー判断、2026-10-04）。
- **`getBBox()` で card の大きさを測る（spike）。** 描画されていない文書では 0 になり、jsdom にも
  無い。属性から計算する。

## 残した問い

- node の入口のキーボードと touch。`Relations` は hover で出るので、どちらからも届かない。候補は
  ⓘ の詳細パネルに同じ入口を置くこと。
- `description` / `link` を focus canvas に載せるか。今は既存の詳細パネルを優先する。
- focus canvas の中からの drill-down。中の card のクリックは移動に使うので、閉じてから行く。
- [edge-hover-affordance.md](../design/edge-hover-affordance.md)（#2632、未着手）が固定する予定の
  契約「detail payload を持たない edge のクリックは何も起動しない」は、本 ADR の決定 7 で変わった。
  #2632 を実装するときはこの契約を「focus canvas を開く」として書く。
- 線側の集約（[#3027](https://github.com/kompiro/karasu/issues/3027)）と、card の下を通る配線
  （[#3026](https://github.com/kompiro/karasu/issues/3026)）は本 ADR の範囲外。
