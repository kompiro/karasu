# Edge ラベルを段階的に開示する

- **日付**: 2026-10-01
- **ステータス**: 検討中（canvas の段は slice A [#3033](https://github.com/kompiro/karasu/pull/3033) で実装中。focus canvas は slice B、2 回目の spike 済み）
- **Issue**: [#3022](https://github.com/kompiro/karasu/issues/3022)
- **PR**: [#3025](https://github.com/kompiro/karasu/pull/3025)（本文）、[#3037](https://github.com/kompiro/karasu/pull/3037)（slice B の節）
- **関連**:
  - 引き金 Issue: [#3022](https://github.com/kompiro/karasu/issues/3022)（reader 側）、[#3018](https://github.com/kompiro/karasu/issues/3018)（writer 側。`reverse-architecture` スキルの文言修正）
  - 関連 ADR: [ADR-2048](../adr/2048-edge-label-collision-avoidance.md)（ラベルの自動衝突回避）, [ADR-2360](../adr/2360-label-placement-line-obstacles.md)（他の edge の線を障害物に含める）, [ADR-1184](../adr/1184-edge-label-position-offset.md)（`label-position` / `label-offset`）, [ADR-968](../adr/968-orthogonal-edge-routing-skip-layer.md)（ghost / cyclic edge を幾何パスから除外）, [ADR-1554](../adr/1554-edge-label-in-context-menu.md)（`data-edge-label` と context menu）, [ADR-2209](../adr/2209-edge-property-block.md)（edge の `description`）, [ADR-463](../adr/463-implicit-edge-detail-panel.md)（edge の詳細パネル）
  - 関連 Design Doc: [edge-hover-affordance.md](edge-hover-affordance.md)（#2632。hover affordance を identity から切り離す）
  - 関連 TPL: [TPL-3022](../test-perspectives/TPL-3022-withheld-content-stays-reachable.md)（本 PR で起こす proactive TPL）, [TPL-1227](../test-perspectives/TPL-1227-writer-reader-asymmetry.md), [TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md), [TPL-2048](../test-perspectives/TPL-2048-label-placement-measured-and-byte-stable.md), [TPL-2174](../test-perspectives/TPL-2174-opt-in-visual-layer-is-inert-when-off.md), [TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md), [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md), [TPL-1468](../test-perspectives/TPL-1468-overlay-z-index-scale.md)（slice B の overlay）
  - 受け入れテスト: [AT-1186](../acceptance/1186-edge-hover-highlight-dim.md)（edge hover の peer dim）, [edge-label-disclosure.md](../acceptance/edge-label-disclosure.md)（slice A）
  <!-- absent-path-next-line: spike branch 上のファイル。slice B が app に同名で作る (#3031) -->
  - spike: `spike/3022-edge-label-disclosure`（本文の数値はこのブランチ上の計測スクリプトで再現できる。focus canvas は同ブランチの `packages/app/src/components/focus-canvas.ts`）
  - コード: `packages/core/src/renderer/edge-routing.ts`, `packages/core/src/renderer/label-placement.ts`, `packages/core/src/renderer/svg-renderer.ts`, `packages/app/src/components/PreviewPane.tsx`, `packages/app/src/styles/components/preview.css`

## 背景・課題

`reverse-architecture` スキルで起こした Umami モデルの `UmamiApp` drill-down が読めない。
domain 10 個に対して domain 間 edge が 41 本あり、全部に根拠を書いた長いラベルが付いている。
ラベルは domain card の下に潜り、互いに重なり、線そのものも追えない。

spike で、描画済みの SVG を読み戻して計測した。衝突の判定は renderer 自身の関数
（`label-placement.ts` の `countLabel*`）をそのまま使っている。

| 指標（`UmamiApp` drill-down、`main`） | 値 |
| --- | --- |
| ラベル付き edge | 41 / 41 |
| ラベル長 中央値 / 最大 | 76 / 135 文字 |
| ラベル幅（推定）中央値 / 最大 | 405 / 717 px（canvas 幅は 1592 px） |
| ラベル面積 / canvas 面積 | 17.3 % |
| label ↔ node card の衝突 | 22 |
| label ↔ label の重なり | 20 |
| label ↔ 他の edge の線 | 24 |
| 端点ではない card の下を通る edge | 7 |

**読めない原因は 2 つあり、片方だけ直しても残る。**

1. **ラベルが長い。** 中央値で canvas 幅の 4 分の 1 を占める。既存の自動配置
   （ADR-2048）はラベルを約 90 px の範囲でしか動かせないので、この幅のラベルには効かない。
   ADR-2048 は「周辺の空きより幅広いラベルは clear できないことがある」をスコープ外に
   残しており、本件はその follow-up にあたる。
2. **線が多い。** 10 node に 41 本の線が走る canvas には、短いラベルにも置き場が無い。
   下の表のとおり、ラベルを 19 文字まで縮めても衝突は 18 件残る。

roadmap の「comprehension の残余」は progressive edges の promotion trigger を
「混雑の主因が node 数でなく edge 側だと corpus で確認できたら Issue 化」としている。
node 10 個で読めなくなる本件はその確認にあたる。

## 現状（インベントリ）

edge の情報を段階的に出す部品は既にあるが、互いに繋がっていない。

| 段 | 現状 |
| --- | --- |
| canvas | `renderEdge` は `edge.label` の全文を中点に描く。長さの上限は無い。node の `description` は `summarizeDescription` が 1 行目・50 文字で省略するので、node と edge で扱いが非対称 |
| 自動配置 | `resolveLabelPlacements` が ±6 段（1 段 = font size + 4 px）の範囲で clear な位置を探す。見つからなければ衝突が最も少ない位置に**描く**。ghost / cyclic edge は対象外（ADR-968） |
| hover | interactive な edge に hover すると他の edge が `opacity: 0.25` になる（AT-1186）。hover した edge について追加で出る情報は無い。hop（交差の弧）は別グループに描かれるので薄くならない |
| click | `EdgeDetailPanel` が開く経路は 2 つある。集約された implicit edge のラベルをクリックすると内訳が開く（ADR-463）。authored な edge は property block（`description` / `link`）を持つものだけが開く（#2543）。ラベルだけの authored edge では何も開かない |
| 右クリック | context menu のヘッダーが authored ラベルを折り返して全文表示する（ADR-1554）。開くのは canonical id を持つ edge だけで、ghost edge など id を持たない edge では開かない |
| 属性 | authored ラベルは `data-edge-label` として edge グループに常に載っている（ADR-1554） |
| 静的 SVG | 全文が描かれているだけで、開示の経路は無い |
| VS Code preview | edge 用の hover 規則を持たない（edge-hover-affordance.md のインベントリ） |

## 制約・前提

- **衝突が無い図は byte-stable に保つ**（ADR-2048 / TPL-2048）。`examples/` の全 85
  ファイルにある手書きラベルは 287 本で、最長は 30 文字。全ファイルの all-views バンドル
  （root・各 drill-down 階層・deploy・org）で、省略も保留も 1 件も起きない。バンドルが
  今日の出力と異なるのは 15 ファイルで、差分は ghost edge のラベル 35 本の位置だけである
  （drill-down で 34 本、deploy で 1 本）。どれも今日は ghost の card に重なっていた
  ラベルで、配置パスに入ったことで重ならない位置へ動いた。
- **ADR-1554 は context menu でのラベル省略を却下している。** 理由は「判読性の回復が目的の
  場所で長いラベルが読めなくなる」。本設計はこれと衝突しない。canvas は最初の段であり、
  回復の場所（tooltip・context menu・詳細パネル）は全文を折り返して出し続ける。
  この前提を崩さないことを TPL-3022 で縛る。
- **ADR-2048 は「レイアウトで node を離してラベル空間を作る」を却下している。** 本設計も
  canvas を広げる方向は取らない（TPL-1223 の密度上限とも逆行する）。
- **hover の表現は React state と図の DOM 変更を使わない**（AT-1186 の AT-D）。SVG の
  再注入や `useSystemView` の debounce と race しないため。
- **静的 SVG には script が無く、app の stylesheet も届かない。** 保留した情報が静的出力で
  取り出せなくなってはいけない。単一 view の出力は `<style>` を持たない。drill-down と
  all-views のバンドルは階層切り替え用の `<style>` を埋め込むので、CSS だけで全文を出す
  ことは原理上できるが、edge グループの中に置いた文字は node card の裏に回る
  （「段の定義」の後半）ので採らない。
- **writer に書き分けを要求しない**（TPL-1227）。#3018 は writer 側の改善だが、reader 側の
  読みやすさをその完了に依存させない。既に公開済みのモデルは直らないため。
- **opt-in の視覚レイヤは無効時にマーカーを出さない**（TPL-2174）。何も保留していない
  edge に新しい属性や要素を足さない。
- **out of scope**:
  - 線側の集約。両方向の 2 本を 1 本にまとめる、hub の線を既定で薄くする、など。
    41 本は 27 組の domain の間に張られていて、うち 14 組が両方向である。
    [#3027](https://github.com/kompiro/karasu/issues/3027) で扱う。
  - 端点ではない card の下を通る 7 本の配線。うち 5 本は、同じ行の 2 つの card を結ぶ
    edge が間の card を貫通している。ラベルとは独立の問題で、
    [#3026](https://github.com/kompiro/karasu/issues/3026) で扱う。残り 2 本は ghost edge で、
    配線の対象外（ADR-968）。
  - VS Code preview と、app の all-layers 表示の hover 表現（edge-hover-affordance.md と
    同じ扱い）。all-layers は `srcDoc` の iframe で、app の stylesheet も script も届かない。
    どちらも `<title>` を受け取る（指針 5）。
  - 複数行のラベル（ADR-1184 / ADR-2048 と同じく据え置き）。

### writer / reader / 自動変換

TPL-1227 の 3 列で書くと次のとおり。writer の列は今日と変わらない。

| writer が書くもの | reader が見るもの | karasu が自動でやること |
| --- | --- | --- |
| `A -> B "label"`（長さの制約なし） | canvas: 置ける場所があるラベルを、上限文字数まで | 省略と、座れないラベルの保留 |
| 同上 | node focus: 選んだ node に出入りする edge だけ | 他の edge を薄くし、`Relations` の入口を出す |
| 同上 | edge hover: authored ラベルの全文 | `<title>` をブラウザの tooltip に出す（slice A） |
| 同上 | focus canvas: 対象の card と edge だけを、ラベル全文で | canvas の上にもう 1 枚 canvas を組む |
| property block の `description` / `link` | click: 詳細パネル | 既存（#2543） |

## 検討した選択肢

数値はすべて `UmamiApp` drill-down のもの。「衝突計」は card・ラベル・他の線（実線）との
衝突の合計。

### 案1: writer 側だけ直す（#3018 のみ）

スキルが短い動詞句ラベルを書き、根拠を `description` に移す。renderer は変えない。
spike では 41 本を手で書き換えて再現した。

**メリット**

- renderer の変更が無い。根拠は詳細パネルで読めるようになる。

**デメリット**

- 衝突が 18 件残る（card 7 / ラベル 3 / 線 8）。ラベルの中央値を 19 文字にしても
  線の密度が解消しないため。
- 公開済みのモデルと、スキルを通らない手書きの長いラベルは直らない。

### 案2: canvas で省略するだけ

`label-max-chars` を超えるラベルを `…` 付きで描く。全文は hover で出す。

**メリット**

- writer に依存しない。ラベルが狭くなるので ADR-2048 の探索が効く範囲に戻る。

**デメリット**

- 衝突が残る。40 文字で 36 件、32 文字で 25 件、24 文字で 17 件。24 文字まで詰めると
  ラベルの意味がほぼ読めなくなるのに、0 にはならない。

### 案3: 置けるラベルだけ描き、残りは次の段で開示する

案2 の省略に加えて、自動配置が clear な位置を見つけられなかったラベルを canvas に
描かない（`label-display: auto`）。保留したラベルは edge hover の tooltip で全文を出す。
加えて、node の card に hover するとその node の edge だけを残す（node focus）。

**メリット**

- `UmamiApp` の計測で衝突が 0 になる。`auto` が配置するラベルについては「描かれている
  ラベルは読める」が構成上成り立つ。`label-position` / `label-offset` を書いたラベルは
  保留しない（author の指定が勝つ。ADR-1184）ので、指定した位置で衝突したまま描かれうる。
- 衝突が無く、ラベルが上限文字数以下の図には何も起きない。`examples/` では省略も保留も
  0 件で、変わるのは card に重なっていた ghost のラベル 35 本の位置だけ。
- 線の密度にも答えがある。node focus で 41 本が最大 16 本になる。

**デメリット**

- canvas に残るラベルは 41 本中 13 本（既定の 48 文字。32 文字なら 19 本、writer 側の修正を
  重ねると 25 本）。残りは操作しないと読めない。
- 静的 SVG では保留したラベルが `<title>` の tooltip でしか読めない。画像に変換すると
  失われる。
- ghost / cyclic edge を配置パスに入れる必要があり、ADR-2048 と ADR-2360 の決定の一部を
  改める。

### 案4: 密な canvas ではラベルを全部隠す

canvas 単位の閾値（ラベル数、または面積比）を超えたら、全ラベルを hover まで出さない。

**メリット**

- 実装が単純。衝突は定義上 0。

**デメリット**

- 置ける 13 本も捨てる。
- 閾値の前後で図の見た目が不連続に変わる。edge を 1 本足しただけで全ラベルが消える
  ことがあり、writer から見て予測できない。
- 閾値という新しい定数が増える。案3 の判定は既存の配置パスの結果だけで決まる。

### 案5: ラベルのために canvas を広げる

ADR-2048 が却下済み。再検討しない。

## 比較

| 観点 | 案1 writer のみ | 案2 省略のみ (32) | 案3 auto + 省略 (32) | 案4 全部隠す |
| --- | --- | --- | --- | --- |
| canvas に描くラベル | 41 / 41 | 41 / 41 | 19 / 41 | 0 / 41 |
| ラベル面積 / canvas | 4.1 % | 5.7 % | 2.5 % | 0 % |
| 衝突計 | 19 | 25 | **0** | 0 |
| 既存モデルに効くか | 効かない | 効く | 効く | 効く |
| 衝突の無い図への影響 | なし | 上限を超えるラベルだけ | 上限を超えるラベルだけ | 閾値次第 |
| 新しい定数 | なし | 上限文字数 | 上限文字数 | 上限文字数 + 閾値 |
| 静的 SVG での全文 | 描かれる | `<title>` | `<title>` | `<title>` |

node focus 中に見えるラベルの衝突（card・ラベル・その node の線との衝突を 10 node で
合計）は、案2 が 36 件、案3 が 1 件（薄い ghost の線に掛かる 1 本）。

この表と直上の 1 行は、slice A で実装した規則を fixture
（`packages/core/src/renderer/fixtures/dense-domain-canvas.krs`。Umami モデルを domain 階層に
縮約したもの）で測り直した値である。「検討した選択肢」の各案の数値は spike が元のモデルで
測ったもので、1〜2 件ずれる。

## Related TPLs

- [TPL-3022](../test-perspectives/TPL-3022-withheld-content-stays-reachable.md): 本 PR で起こす。
  canvas が省略・保留した authored 情報は、その surface 上で全文に到達できること。
- [TPL-2048](../test-perspectives/TPL-2048-label-placement-measured-and-byte-stable.md):
  衝突は数値で assert し、衝突の無い図は byte-stable に保つ。案3 の受け入れ条件の土台。
- [TPL-2174](../test-perspectives/TPL-2174-opt-in-visual-layer-is-inert-when-off.md):
  何も保留していない edge に `data-edge-label-withheld` や `<title>` を出さない。
  hop の持ち主属性も同じ規律で扱う（下の指針 5）。
- [TPL-1227](../test-perspectives/TPL-1227-writer-reader-asymmetry.md):
  writer の書き方を変えずに reader の段を増やす。上の 3 列表。
- [TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md):
  一目で把握できる解像度を保つ。視覚的密度の上限を、要素数ではなく衝突で定義する。
- [TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md) /
  [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md):
  canvas の段は `renderEdge` 1 箇所に置き、system / drill-down / all-layers / deploy で
  同じ規則にする。
- [TPL-1468](../test-perspectives/TPL-1468-overlay-z-index-scale.md):
  focus canvas の overlay と pill の重なり順は `--z-*` スケールから選ぶ（slice B の決めたこと 4）。

## 現時点の方針

**案3 を採用する。** 「canvas には読めるものだけを描き、描かなかったものは次の操作で必ず
出す」という規則 1 つで、長いラベルと密な線の両方に答えられる。案1 と案2 は計測上
衝突を残し、案4 は置けるラベルまで捨てて閾値を増やす。

#3018 は並行して進める。writer 側が短いラベルを書けば canvas に残る本数が増え
（13 → 25 本）、根拠が詳細パネルで読めるようになる。本設計はその完了を待たない。

### 段の定義

| 段 | 操作 | 出るもの | 実装場所 |
| --- | --- | --- | --- |
| 0 canvas | なし | 上限文字数までのラベルのうち、clear に置けるもの | core（`renderEdge` と配置パス） |
| 1 node focus | card に hover | その node に出入りする edge だけを残す。ラベルは増やさない。card の右上に `⇄ Relations N` が出る | app |
| 2 edge hover | 線に hover | authored ラベルの全文（ブラウザ標準の tooltip。`<title>`） | core（slice A。全 surface） |
| 3 focus canvas | 線をクリック（段 4 のパネルを開く edge を除く）、または `Relations` | canvas の上にもう 1 枚の canvas。edge なら両端の card とその 2 つの間の edge 全部、node ならその node と接続先の card。ラベルは全文 | app |
| 4 詳細パネル | 集約 edge のラベル、property block を持つ edge をクリック | 内訳 / `description` / `link`（既存） | app |
| 5 drill-down | card をクリック | 下の階層（既存） | core |

段 1 でラベルを増やさないのは計測の結果である。focus した node のラベルを短い形で全部
出すと、32 文字に省略しても合計 40 件、最悪の node で 13 件衝突する。内訳は card との
衝突が 28 件、その node の他の線との衝突が 11 件、ラベル同士が 1 件である。線を絞っても
card の位置は変わらず、edge を 16 本持つ hub では線も残るためで、ラベルの開示は段 3 の
focus canvas に任せる（1 回目の spike では段 2 の tooltip に任せていた）。

段 2 を SVG 内の隠し要素にしないのも計測の結果である。edge は node より先に描かれるので、
edge グループの中で全文を出すと card の裏に回る。spike の最初の版はこの形で、135 文字の
ラベルが card に隠れて読めなかった。1 回目の spike はその代わりに HTML の tooltip を app に
足したが、slice A が全 surface に `<title>` を出した時点でブラウザが同じ tooltip を出すので、
app の tooltip は作らない（「slice B: focus canvas」の検討した形 B1）。

段 3 は 2 回目の spike で形を決めた。「slice B: focus canvas」の節に書く。

### style の lever

| property | 値 | 既定 | 意味 |
| --- | --- | --- | --- |
| `label-max-chars` | `<n>` \| `none` | `48` | canvas に描く文字数の上限。超えた分は単語境界で切って `…` を付ける |
| `label-display` | `auto` \| `always` \| `hover` | `auto` | `auto` は clear に置けるラベルだけ描く。`always` は今日の挙動。`hover` は canvas に描かない |

`label-position` / `label-offset` を書いたラベルは author の指定が勝ち、保留しない
（ADR-1184 の優先順位を踏襲）。

### スライス（実装ステップ）

spike の差分は core と app を合わせて 373 行で、テストを 1 件も含まない。実装には
テスト・spec（英日）・AT・e2e が加わり、合計で spike の 4 倍前後になる。加えて、変更の
性質が 2 つに分かれる。canvas の段は全 surface の既定の出力を変えるので、byte-stability と
既存モデルへの影響を単独でレビューしたい。app の段は preview の操作だけを変える。
この 2 つを 1 本の PR に混ぜないために、次のように切る。

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** canvas の段（[#3030](https://github.com/kompiro/karasu/issues/3030)） | なし | 保留・省略したラベルは `<title>` で読めるので、app の変更が無くても情報は失われない。既定の出力が変わる部分をこの 1 本に閉じ込められる |
| **B** node focus と focus canvas（[#3031](https://github.com/kompiro/karasu/issues/3031)） | A | A が edge に残す `data-edge-label` と、card の `<g data-node-id>` を読むだけで、core の出力は変えない。edge の canvas と node の canvas は同じ理由（線をクリックできない edge がある）で一緒に出す必要があり、node の入口（hover の `Relations`）は node focus と同じ DOM モジュールに載るので、さらに分けない |

> 各スライスで何ができるようになるか / その時点でまだできないことは
> 親 Issue [#3022](https://github.com/kompiro/karasu/issues/3022) の `## Slice status` を参照。

指針の 1〜5・7 と、8〜9 のうち core に関わるものが A。B は「slice B: focus canvas」の節に指針・テスト・AT を分けて書く。

### 実装の指針

1. **省略**: `displayEdgeLabel(label, maxChars)` を依存の無い小さなモジュールに置き、
   配置パス（幅の計測）と `renderEdge`（描画）が同じ定義を読む。両者が別々に計算すると、
   配置パスが実際より広い箱を動かすことになる。
2. **保留**: `resolveLabelPlacements` で、最良の候補でもコストが 0 にならなかった
   `auto` のラベルを保留にする。保留したラベルは障害物に加えない。結果は入力の
   `LabelInput` に書き戻し、関数の signature は変えない（ADR-2360 の assumption が
   呼び出しの形を grep しているため）。
3. **ghost / cyclic edge**: `auto` のときは配置パスに入れる。パスが見ないラベルは保留
   できず、衝突したまま描かれるため（Umami で残った衝突は、すべて ghost の 3 本に関わるものだった）。
   ghost のラベルは実線のラベルの後に置き、ghost の線は引き続き障害物にしない
   （ADR-2360）。これは ADR-2048 の「ghost / cyclic は対象外」と、ADR-2360 の「移動対象
   からも引き続き外す」「best-effort の性格を維持する」を、`auto` について改める。
4. **edge グループの出力**: 保留または省略した edge にだけ
   `data-edge-label-withheld="deferred|truncated"` を付ける。何も保留していない edge の
   出力は今日と同一にする（TPL-2174）。
5. **`<title>`**: 保留・省略した edge には全 surface で `<title>` を出す（slice A で
   実装済み）。1 回目の spike は「この surface が自前の tooltip を持つか」を表す render
   option で出し分ける案だったが、app もブラウザの tooltip をそのまま使うので option は
   要らない。VS Code preview と app の all-layers 表示（iframe）も同じ `<title>` を受け取る。
   hop の持ち主を表す属性は出さない（「slice B」の決めたこと 5）。
6. **app**: hover の表現（node focus と `Relations` の入口）は React を使わない DOM
   モジュール 1 つにまとめ、`PreviewPane` は attach するだけにする。focus の規則は
   `<style>` 要素に書き、React state ではなく、SVG の DOM に触らない（AT-1186 の AT-D）。
   hover の対象は `.krs-edge` 全体とし、`krs-edge--interactive` を条件にしない
   （edge-hover-affordance.md と同じ論法。ラベルを読むのは閲覧者の能力であり、author 側の
   identity ではない）。focus canvas は「slice B」の指針。
7. **spec**: `docs/spec/style.md` に 2 つの property の節を足す。spec-audit の規則に
   従い、TPL-3022 と TPL-2048 を `> Related TPLs:` で紐付ける。
8. **テスト**:
   - 省略: 上限以下のラベルは入力と同一の文字列を返す。単語境界で切る。
   - 保留: 合成 fixture で、clear に置けないラベルが保留され、後続のラベルの障害物に
     ならないこと。保留後の衝突数が 0 であること（TPL-2048 の数値 assert）。
   - byte-stability: `examples/` の全 surface が `always` と `auto` で同一であること。
     spike は root view だけ比べたので、drill-down の各階層と deploy view を加える。
   - マーカーの不在: 何も保留していない図に `data-edge-label-withheld` と `<title>` が
     1 つも現れないこと（TPL-2174。変異で落ちることも確認する）。
   - 到達性: 保留した edge が、`<title>` か `data-edge-label` のどちらかで全文を持つこと
     を全 surface で assert する（TPL-3022）。
   - e2e: card hover で無関係な edge の実効 opacity が下がること。`.krs-edge` の
     transition の収束を待つ。focus canvas の e2e は「slice B」のテスト。
9. **AT**: slice A は `docs/acceptance/edge-label-disclosure.md`。B は「slice B」の AT。
10. **ADR 昇格**: 実装完了後に `docs/adr/3022-edge-label-disclosure.md` として昇格し、
    本 Design Doc は同 PR で削除する。ghost / cyclic の扱いを改めた旨は新しい ADR の背景に
    書く。ADR-2048 と ADR-2360 は本文を変えず、frontmatter の `related_to` だけを足す
    （`.claude/rules/adr.md`「既存 ADR を覆すとき」）。

1 回目の spike のコードは上の 1〜4 を実装し、slice A が引き継いだ。2 回目の spike は
focus canvas で、「slice B」の節に書く。

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: edge のラベルが 48 文字を超える、またはラベルが衝突している図で、
  canvas の見た目が変わる。`examples/` に 48 文字を超えるラベルは無く、保留されるラベルも
  無い。card に重なっていた ghost のラベル 35 本だけが動く。今日の挙動に戻すには
  `edge { label-max-chars: none; label-display: always; }` を書く。
- **ドキュメント更新**: `docs/spec/style.md`（指針 7）。`docs/concepts.ja.md` の
  「集約」節に、ラベルも同じ原則で絞ることを 1 段落足すかは実装 PR で判断する。
- **テスト・examples への影響**: `label-placement.test.ts` の ghost / cyclic 除外の
  テストを `always` と `auto` の 2 ケースに分ける。examples の `.krs` は変更なし。

## slice A で確定したこと

「未解決の問い」として残していたもののうち、canvas の段の実装で決めたもの。

- **静的出力も同じ既定（`auto`）にする。** surface ごとに既定を変えると、app で見た図と
  export した図が食い違う（TPL-219 の parity）。静的出力で保留したラベルは `<title>` で
  読める。SVG を画像に変換する利用者は保留したラベルを失うので、その用途では
  `edge { label-display: always; }` を書く。
- **保留するのは衝突するラベルだけ。** card・他のラベル・他の edge の実線のどれかに
  重なる位置しか無いラベルを外す。重なってはいないが自分の線より他の線に近い、という
  だけのラベルは今までどおり描く。この近さ（ADR-2360 の ambiguity）は置き場所を選ぶ
  ためのコストであって、描くかどうかの基準ではない。spike はこの場合も外していた。同じ
  上限 40 文字で比べると、canvas に残るのは spike の 11 本に対して 16 本で、衝突は同じく
  0 件である。
- **edge ラベルの既定の上限は 48 文字。** design の提案は 40 だったが、実モデルで測って
  変えた。上限を上げると、省略されていたラベルの多くが全文で描けるようになり、canvas から
  外れる本数の増加はその数分の 1 に留まる。56 を超えると全文で描けるラベルはほとんど
  増えず、ラベルが node card（約 364 px）より広くなる（1 文字は約 6.6 px）。密な canvas では
  上限が短いほど多く座るので、そういう図は `edge { label-max-chars: 32; }` のように図ごとに
  詰める。`examples/` の最長は 30 文字で、既存の例は省略されない。

  | モデル（全 view） | 上限 | 全文 | 省略 | 外れる |
  | --- | --- | --- | --- | --- |
  | wordpress | 40 | 1,606 | 117 | 271 |
  | | 48 | 1,647 | 64 | 283 |
  | | 56 | 1,686 | 22 | 286 |
  | twenty | 40 | 669 | 96 | 427 |
  | | 48 | 692 | 58 | 442 |
  | | 56 | 716 | 28 | 448 |
  | hato | 40 | 70 | 5 | 10 |
  | | 48 | 73 | 2 | 10 |
  | | 56 | 75 | 0 | 10 |
  | fixture | 40 | 0 | 19 | 25 |
  | | 48 | 3 | 13 | 28 |
  | | 56 | 2 | 13 | 29 |
- **合成ラベルと、集約 edge のクリック対象のラベルは保留も省略もしない。** `W` / `R` や
  `N domain edges` は `data-edge-label` に載らない（ADR-1554）ので、保留すると届く経路が
  無くなる（TPL-3022）。集約 edge のラベルは内訳パネルを開くクリックの的でもある。
- **deploy view も同じ既定にする。** 手元の reverse モデル 4 つ（dify / twenty / wordpress /
  hato。リポジトリ外）の deploy view は、ラベル付きの edge が合計 1 本しか無く、`auto` で
  何も変わらなかった。`examples/` の deploy view で変わるのは、card に重なっていた ghost の
  ラベル 1 本の位置だけである。
- **cyclic edge の線は `auto` のとき障害物に入れる。** cyclic edge は薄くない実線なので、
  その下のラベルは他の線の下と同じく読めない。ghost の線は引き続き入れない。
- **Issue は 2 つに割る**（上の「スライス」）。

同じ 4 つのモデルの system 側（全 drill-down 階層）で、描かれたラベルの衝突は次のように
減った。`auto` で残るのはすべて、保留の対象外にした `W` / `R` マーカーである。

| モデル | 階層 | 衝突（`always`） | 衝突（既定） | 保留 | 省略 |
| --- | --- | --- | --- | --- | --- |
| dify | 405 | 185 | 9 | 176 | 0 |
| twenty | 506 | 833 | 8 | 422 | 32 |
| wordpress | 1,031 | 169 | 6 | 151 | 6 |
| hato | 101 | 11 | 0 | 10 | 2 |

## slice B: focus canvas（2 回目の spike で決めたこと）

slice B は当初「node focus + edge hover の tooltip」だった。spike を触った結果、
「edge をクリックすると canvas の上に mini canvas が出て、node 2 つ・edge・省略なしの
ラベルを見やすく表示する」「node も同じく、node を中心に接続先を並べる」という形が
要望として出た。canvas が「mini」である必要はなく、段階的に開示できればよい。2 回目の
spike でこの形を作り、Umami の `UmamiApp` drill-down で測った。コードは次の 2 つで、
どちらも `spike/3022-edge-label-disclosure` 上にある。

<!-- absent-path-next-line: spike branch 上のファイル。slice B が app に同名で作る (#3031) -->
- `packages/app/src/components/focus-canvas.ts`（app のモジュール）
- `reports/3022-edge-label-disclosure/focus-capture.ts`（ブラウザで開いて測る計測）

### 何が開くか

- **edge をクリック**: 両端の card 2 枚を左右に置き、その 2 つの間の edge を向きに
  かかわらず全部、1 本 1 行で描く。クリックした向きが先頭。
- **card に hover して出る `⇄ Relations N` を押す**: 中央にその node、左にそれに依存する
  node（その node へ向かう edge の from）、右にそれが依存する node（その node から出る
  edge の to）を、1 edge 1 行で描く。`N` は edge の本数。
- どちらもラベルは全文を 300 px で折り返し、自分の線のすぐ上に置く。線は label の欄を
  水平に走り、card の側面へ入る。
- canvas の中の card をクリックするとその node の canvas に移り、node の canvas で行を
  クリックするとその組の edge の canvas に移る。`← Back` で 1 つ戻る。`✕ Close`・Esc・
  背景のクリックで閉じる。
- card はメインの canvas の `<g data-node-id>` を複製して置く。edge は `data-edge-from` /
  `data-edge-to` / `data-edge-label`（ADR-1554）と線の `stroke` / `stroke-dasharray` から
  読む。core は何も描き直さず、範囲は読者が見ている階層に閉じる（TPL-1223）。

node の canvas は 2 通りの並べ方を持ち、preview の幅で選ぶ。

| 並べ方 | 形 | 幅（`Identity`、13 本） | 選ぶとき |
| --- | --- | --- | --- |
| 3 列（columns） | 依存する側 \| node \| 依存される側 | 1,952 × 981 px | preview の幅が、3 列を 80 % に縮めた幅以上 |
| 縦 1 列（spine） | 接続先を全部左に積み、node を右に置く。依存する側の線は上から node の上辺へ下り、依存される側は下辺から出て下へ | 1,120 × 1,701 px | それ以外。開いたときは node が panel の中央に来る位置までスクロールしておく |

幅のほとんどは card（この図では 1 枚 364 px）で、label の欄は 300 px。縦 1 列は
横幅を半分にする代わりに縦に伸び、panel の中でスクロールする。

### 検討した形

| 案 | 形 | 却下 / 採用の理由 |
| --- | --- | --- |
| B1 HTML tooltip（1 回目の spike） | 線に hover すると図の隣の `<div>` に全文 | 一度に 1 本しか読めず、hover の無い端末に経路が無い。slice A が全 surface に `<title>` を出した時点でブラウザが同じ tooltip を出すので、app だけ自前の tooltip を持つと同じものが 2 つになる。**作らない** |
| B2 node の詳細パネルに関係の一覧 | ⓘ のパネルに in / out の edge をテキストで並べる | 図ではないので、両端の card と向きを一目で見られない。focus canvas の後に、キーボードや touch の経路として足す余地は残す |
| B3 focus canvas（採用） | 上の「何が開くか」 | 置くものが少ないので、ラベルを省略せず自分の線の隣に置ける。衝突は構成上 0（下の計測） |
| B3-a 接続先を小さな chip で描く | card の代わりに名前だけの chip | canvas を小さくできるが、要望は「mini でなくてよい」。card の複製なら見た目がメインの canvas と一致し、新しい描画を持たない。**card をそのまま置く** |
| B3-b 放射状に並べる | node を中心に接続先を円周に | 文字を置く場所が無く、edge を 16 本持つ hub ではメインの canvas と同じ衝突が起きる。**1 edge 1 行の列にする** |
| B4 core が部分グラフを通常の renderer で描く | `compile` に focus option を足す | 見た目は揃うが、通常の配置はラベルを線の中点に置くので、hub へ集まる 13 本のラベルは再び衝突する（「段の定義」の計測）。app が card を複製すれば足りる |

### 計測（`UmamiApp` drill-down、Chromium）

全 10 node を 2 通りの並べ方で、全 27 組を edge の canvas で開き、ブラウザ上で衝突を
数えた。数えたのはラベルと card、ラベル同士、線とラベル（自分のものを含む）、線と card の
内側。

| 開き方 | 大きさ（最大） | 衝突 |
| --- | --- | --- |
| node、3 列（10 node） | 1,952 × 1,101 px | 0 |
| node、縦 1 列（10 node） | 1,120 × 2,061 px | 0 |
| edge（27 組、14 組は両方向） | 1,164 × 192 px | 0 |

同じラベルをメインの canvas に全文で描くと 66 件衝突する。最長のラベル（135 文字）は
4 行に折り返る。

**41 本のうち 1 本（`Teams → Identity`）は、メインの canvas で線をクリックできる点が
無い。** 1720 × 1000 の preview で線に沿って 2 % 刻みに hit-test すると、どの点も card か
他の edge の当たり判定の下にある。edge のクリックだけを入口にするとこの edge には
届かない。node の canvas はどちらかの端から届くので、**edge の canvas と node の canvas は
同じスライスで出す**（TPL-3022 に失敗モードとして足した）。

### 決めたこと

1. **ラベルだけの edge のクリックは focus canvas を開く。** 「未解決の問い」にあった
   問いの答えで、hover の無い端末にも edge の経路ができる。既存の詳細パネルを開く edge
   （`data-domain-edges` を持つ集約 edge、`data-edge-description` / `data-edge-links` を
   持つ edge）は今までどおりパネルを開き、focus canvas は開かない。`description` / `link`
   を focus canvas に載せるかは後続で決める。
2. **node の入口は hover で出る `⇄ Relations N`。** card のクリックは drill-down、hover で
   開くと pointer が横切るたびに明滅する。pill は card の上辺の右端に跨がる位置に置き、
   card から pointer を離さずに届く。edge を 1 本も持たない node には出さない。pan 中
   （ボタンが押されている間）は出さない。キーボードと touch の入口は B では作らない
   （「未解決の問い」）。
3. **spike 1 回目の HTML tooltip は作らない。** 段 2 は slice A の `<title>` で足りる。
   指針 5 の「自前の tooltip を持つ surface」の render option も要らない。
4. **focus canvas は preview pane の中の、modal でない overlay。** エディタはそのまま
   使える。source を編集して図が変わったら、同じ focus を新しい図から組み直し、対象の
   node や edge が無くなったら閉じる。shadcn の `Dialog`（`.claude/rules/dialog.md`）は
   modal dialog のための規則で、`document.body` に portal して focus を閉じ込めるので、
   ここには当てはまらない。overlay と pill の `z-index` は `tokens.css` の `--z-*`
   スケールから選び（TPL-1468。spike は 95 / 91 の生の数を置いていた）、どちらも
   `--z-panel` の層に置く。context menu（`--z-context-menu`）より下なので、focus canvas の
   上で右クリックしても menu は隠れない。pill は overlay が開いている間は出さない。
5. **hop の持ち主属性は出さない。** node focus で hop（交差の弧）が薄くならないのは
   段 1 の小さな欠けで、SVG を約 9 % 大きくしてまで直さない。hop の描き方は #2956 で
   変わるので、そちらの結果に合わせる。
6. **並べ方の自動切替は 80 % で判定する。** 3 列を preview に収めるのに 80 % 未満へ
   縮めなければならないなら縦 1 列。12 px の文字が 9.6 px を下回ると読めないため。
7. **i18n**: `Relations` / `Back` / `Close` / `N in · M out` は `@karasu-tools/i18n` を通す
   （`docs/spec/i18n.md`）。

### 実装の指針（B）

1. **分担**: hover の表現（他の edge を薄くする、pill を出す）は React を使わない DOM
   モジュール `edge-disclosure.ts` に置く（AT-1186 の AT-D。hover のたびに `PreviewPane` を
   再描画しない）。focus canvas はクリックで開くので React でよく、`FocusCanvas` component
   が open / trail（Back 用の履歴）を state に持つ。既存の詳細パネルと同じ扱い。
2. **組み立ては純粋関数にする**: `buildFocusCanvas(input, focus, layout): string` に、card の
   markup と `<rect>` の `x / y / width / height`、edge の属性だけを渡し、SVG 文字列を返す。
   spike は `getBBox()` と canvas の `measureText()` を使ったが、どちらも jsdom に無く、
   runtime で結果が変わる。card の大きさは card の最初の `<rect>` から、文字幅は core の
   `estimateTextWidth`（`rendering-constants.ts`。index から export して app が使う）から
   取り、決定的にする。同じ関数を unit test が密な fixture で回し、
   衝突 0 を数値で assert する（TPL-2048 の規律を focus canvas にも当てる）。
3. **メインの canvas を汚さない**: 複製した card から `data-node-id` / `data-node-path` /
   `data-has-children` を外し、focus canvas の `<svg>` には固有の class を付ける。
   `PreviewPane` が `[data-node-id]` を数える経路（highlight、drill-down）が複製を拾わない。
   overlay と pill の `mousedown` / `mouseup` / `wheel` / `contextmenu` は伝播を止め、
   図の pan / zoom / context menu を起動しない。
4. **クリックと pan の区別**: 図は pointer に追従するので、pan も同じ要素の `click` で
   終わる。`mousedown` からの移動量が閾値（`PreviewPane` の `CLICK_THRESHOLD`）を超えた
   `click` では開かない。
5. **線の幾何**: label の欄を水平に走る区間の y にそろえて card の側面へ出入りし、
   そろえられない行だけ 12 px 以上の間隔で側面に分ける。3 列では中央の node の側面へ
   bezier で集め、縦 1 列では node の上辺 / 下辺へ、外側の行ほど外側で曲がるように
   入れ子にして交差を作らない。
6. **複製の限界**: renderer は card の `<g>` の中に `url(#…)` も `<use>` も出さない（`<defs>` を
   参照するのは edge の marker だけ）ので複製に `<defs>` は要らないが、念のためメインの
   `<defs>` を写す。multi-system root
   （#2917）で同じ id の card が 2 枚ある canvas では、`data-edge-from` / `data-edge-to` が
   bare id なので最初の 1 枚を使う。実装時に `data-node-path` で引けるか確かめ、引けない
   なら制限として AT に書く。

### テスト（B）

- unit（builder）: 密な fixture（`dense-domain-canvas.krs`）の全 node × 2 通りと全組で、
  ラベル↔card、ラベル↔ラベル、線↔ラベル、線↔card の衝突が 0。両方向の組が 2 行になる。
  上限文字数に関係なく全文が出る（`label-max-chars` を 8 にしても）。
- component（`FocusCanvas`）: edge のクリックで開く、pill で開く、Back、Esc、背景の
  クリック、図の差し替えへの追従、対象消失で閉じる、詳細パネルを開く edge では開かない。
  `afterEach(cleanup)` を明示する。
- e2e（Playwright）: 密なモデルで、線のクリック → 全文が 1 行で見える。card に hover →
  `Relations` → 行数が edge の本数と一致。pan の終わりでは開かない。狭い preview で
  縦 1 列になる。
- 到達性（TPL-3022）: 線に沿った hit-test で届かない edge を 1 本選び、node の canvas から
  その edge の全文に届くことを e2e で確かめる。

### AT（B）

`docs/acceptance/edge-label-focus-canvas.md` を B の PR で起こす。手動項目は、Umami 相当の
密な canvas で段 0 → 1 → 3 の順に辿れること、エディタと並べた幅で縦 1 列になること、
focus canvas を開いたまま source を編集して追従すること。

## 未解決の問い / 決めないこと

- **ラベルだけの edge をクリックしたときに何を開くか** は、focus canvas を開くと決めた
  （「slice B」の決めたこと 1）。edge-hover-affordance.md（#2632、未着手）が
  `PreviewPane.test.tsx` に固定する予定の契約「detail payload を持たない edge の、移動なしの
  クリックは detail panel を閉じる以外の action を起動しない」はこれで変わる。先に実装する
  側（B か #2632 か）が、その契約を「focus canvas を開く」に改めて書く。
- **node の入口のキーボードと touch。** `Relations` は hover で出るので、どちらからも
  届かない。edge は tap で開くが、線をクリックできない edge には届かない。候補は、ⓘ の
  詳細パネルに同じ入口を置くこと（検討した形 B2）。B の後で決める。
- **`description` / `link` を focus canvas に載せるか。** 載せれば edge の情報が 1 箇所に
  揃うが、集約 edge の内訳パネルとの関係を決める必要がある。B では既存のパネルを優先する。
- **focus canvas の中からの drill-down。** 中の card のクリックは refocus に使うので、
  下の階層へは行けない。閉じてからメインの canvas で行く。
- **決めないこと**: 線側の集約（#3027）と、card の下を通る配線（#3026）。静的 SVG に
  focus canvas 相当を持たせること（経路は `<title>` のみ）。
