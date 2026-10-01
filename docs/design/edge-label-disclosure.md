# Edge ラベルを段階的に開示する

- **日付**: 2026-10-01
- **ステータス**: 検討中
- **Issue**: [#3022](https://github.com/kompiro/karasu/issues/3022)
- **PR**: [#3025](https://github.com/kompiro/karasu/pull/3025)
- **関連**:
  - 引き金 Issue: [#3022](https://github.com/kompiro/karasu/issues/3022)（reader 側）、[#3018](https://github.com/kompiro/karasu/issues/3018)（writer 側。`reverse-architecture` スキルの文言修正）
  - 関連 ADR: [ADR-2048](../adr/2048-edge-label-collision-avoidance.md)（ラベルの自動衝突回避）, [ADR-2360](../adr/2360-label-placement-line-obstacles.md)（他の edge の線を障害物に含める）, [ADR-1184](../adr/1184-edge-label-position-offset.md)（`label-position` / `label-offset`）, [ADR-968](../adr/968-orthogonal-edge-routing-skip-layer.md)（ghost / cyclic edge を幾何パスから除外）, [ADR-1554](../adr/1554-edge-label-in-context-menu.md)（`data-edge-label` と context menu）, [ADR-2209](../adr/2209-edge-property-block.md)（edge の `description`）, [ADR-463](../adr/463-implicit-edge-detail-panel.md)（edge の詳細パネル）
  - 関連 Design Doc: [edge-hover-affordance.md](edge-hover-affordance.md)（#2632。hover affordance を identity から切り離す）
  - 関連 TPL: [TPL-3022](../test-perspectives/TPL-3022-withheld-content-stays-reachable.md)（本 PR で起こす proactive TPL）, [TPL-1227](../test-perspectives/TPL-1227-writer-reader-asymmetry.md), [TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md), [TPL-2048](../test-perspectives/TPL-2048-label-placement-measured-and-byte-stable.md), [TPL-2174](../test-perspectives/TPL-2174-opt-in-visual-layer-is-inert-when-off.md), [TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md), [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)
  - 受け入れテスト: [AT-1186](../acceptance/1186-edge-hover-highlight-dim.md)（edge hover の peer dim）
  - spike: `spike/3022-edge-label-disclosure`（本文の数値はこのブランチ上の計測スクリプトで再現できる）
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
  ファイルにある手書きラベルは 287 本で、最長は 30 文字。spike では、単独でコンパイル
  できた 56 個の root view（描かれるラベル 267 本、今日の時点で衝突 0 件）が 1 バイトも
  変わらなかった。drill-down の各階層と deploy view は比べていない。
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
| 同上 | node focus: 選んだ node に出入りする edge だけ | 他の edge を薄くする |
| 同上 | edge hover: authored ラベルの全文 | `data-edge-label` を tooltip に出す |
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

- 衝突が 0 になる。「描かれているラベルは読める」が構成上成り立つ。
- 衝突が無く、ラベルが上限文字数以下の図には何も起きない。`examples/` の root view 56 個は不変。
- 線の密度にも答えがある。node focus で 41 本が最大 16 本になる。

**デメリット**

- canvas に残るラベルは 41 本中 11 本（上限が 24 / 32 / 40 文字のどれでも同じ。writer 側の
  修正を重ねても 13 本）。残りは操作しないと読めない。
- 静的 SVG では保留したラベルが `<title>` の tooltip でしか読めない。画像に変換すると
  失われる。
- ghost / cyclic edge を配置パスに入れる必要があり、ADR-2048 と ADR-2360 の決定の一部を
  改める。

### 案4: 密な canvas ではラベルを全部隠す

canvas 単位の閾値（ラベル数、または面積比）を超えたら、全ラベルを hover まで出さない。

**メリット**

- 実装が単純。衝突は定義上 0。

**デメリット**

- 置ける 11 本も捨てる。
- 閾値の前後で図の見た目が不連続に変わる。edge を 1 本足しただけで全ラベルが消える
  ことがあり、writer から見て予測できない。
- 閾値という新しい定数が増える。案3 の判定は既存の配置パスの結果だけで決まる。

### 案5: ラベルのために canvas を広げる

ADR-2048 が却下済み。再検討しない。

## 比較

| 観点 | 案1 writer のみ | 案2 省略のみ (32) | 案3 auto + 省略 (32) | 案4 全部隠す |
| --- | --- | --- | --- | --- |
| canvas に描くラベル | 41 / 41 | 41 / 41 | 11 / 41 | 0 / 41 |
| ラベル面積 / canvas | 3.9 % | 5.5 % | 1.4 % | 0 % |
| 衝突計 | 18 | 25 | **0** | 0 |
| 既存モデルに効くか | 効かない | 効く | 効く | 効く |
| 衝突の無い図への影響 | なし | 上限を超えるラベルだけ | 上限を超えるラベルだけ | 閾値次第 |
| 新しい定数 | なし | 上限文字数 | 上限文字数 | 上限文字数 + 閾値 |
| 静的 SVG での全文 | 描かれる | `<title>` | `<title>` | `<title>` |

node focus 中に見えるラベルの衝突（card・ラベル・その node の線との衝突を 10 node で
合計）は、案2 が 40 件、案3 が 1 件（薄い ghost の線に掛かる 1 本）。

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

## 現時点の方針

**案3 を採用する。** 「canvas には読めるものだけを描き、描かなかったものは次の操作で必ず
出す」という規則 1 つで、長いラベルと密な線の両方に答えられる。案1 と案2 は計測上
衝突を残し、案4 は置けるラベルまで捨てて閾値を増やす。

#3018 は並行して進める。writer 側が短いラベルを書けば canvas に残る本数が増え
（11 → 13 本）、根拠が詳細パネルで読めるようになる。本設計はその完了を待たない。

### 段の定義

| 段 | 操作 | 出るもの | 実装場所 |
| --- | --- | --- | --- |
| 0 canvas | なし | 上限文字数までのラベルのうち、clear に置けるもの | core（`renderEdge` と配置パス） |
| 1 node focus | card に hover | その node に出入りする edge だけを残す。ラベルは増やさない | app |
| 2 edge hover | 線に hover | authored ラベルの全文（tooltip） | app。静的 SVG は `<title>` |
| 3 click | 線をクリック | `description` / `link`（既存） | app |
| 4 drill-down | card をクリック | 下の階層（既存） | core |

段 1 でラベルを増やさないのは計測の結果である。focus した node のラベルを短い形で全部
出すと、32 文字に省略しても合計 40 件、最悪の node で 13 件衝突する。内訳は card との
衝突が 28 件、その node の他の線との衝突が 11 件、ラベル同士が 1 件である。線を絞っても
card の位置は変わらず、edge を 16 本持つ hub では線も残るためで、ラベルの開示は 1 本ずつ
出す段 2 に任せる。

段 2 を SVG 内の隠し要素ではなく HTML の tooltip にするのも計測の結果である。edge は
node より先に描かれるので、edge グループの中で全文を出すと card の裏に回る。spike の
最初の版はこの形で、135 文字のラベルが card に隠れて読めなかった。

### style の lever

| property | 値 | 既定 | 意味 |
| --- | --- | --- | --- |
| `label-max-chars` | `<n>` \| `none` | `40` | canvas に描く文字数の上限。超えた分は単語境界で切って `…` を付ける |
| `label-display` | `auto` \| `always` \| `hover` | `auto` | `auto` は clear に置けるラベルだけ描く。`always` は今日の挙動。`hover` は canvas に描かない |

`label-position` / `label-offset` を書いたラベルは author の指定が勝ち、保留しない
（ADR-1184 の優先順位を踏襲）。

### 出荷の順序

canvas の段（core）が先で、app の 2 つの段はその後に続けられる。canvas の段は単独でも
情報を失わない。保留したラベルは `<title>` で読めるためである。node focus はラベルに
触らないので、canvas の段と独立に出せる。

1 つの PR で出すか複数の Issue に割るかは、方針が固まってから決める（下の未解決の問い）。

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
5. **tooltip の出し分け**: 保留した全文を `<title>` として出すかどうかは、
   「この surface が自前の tooltip を持つか」を表す render option で決める。spike は
   `interactive` に相乗りしたが、`nodeControls` を `interactive` に畳まなかったのと同じ
   理由で分ける。VS Code preview は edge 用の tooltip を持たず（node 用はある）、app の
   all-layers 表示は iframe で app の script が届かないので、どちらも `<title>` を受け取る。
   hop の持ち主を表す属性も、同じ option が立つ surface にだけ出す（spike は常に出して
   おり、この canvas の SVG が約 9 % 大きくなった）。hop の描き方は #2956 で設計中なので、
   属性の置き場所はその結果に合わせる。
6. **app**: node focus と tooltip は React を使わない DOM モジュール 1 つにまとめ、
   `PreviewPane` は attach するだけにする。focus の規則は `<style>` 要素に書き、
   tooltip は図の隣の `<div>` 1 つにする。どちらも React state ではなく、SVG の DOM に
   触らない（AT-1186 の AT-D）。hover の対象は `.krs-edge` 全体とし、
   `krs-edge--interactive` を条件にしない（edge-hover-affordance.md と同じ論法。
   ラベルを読むのは閲覧者の能力であり、author 側の identity ではない）。
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
   - e2e: edge hover で tooltip に全文が出ること、card hover で無関係な edge の実効
     opacity が下がること。`.krs-edge` の transition の収束を待つ。
9. **AT**: `docs/acceptance/` に新規ファイル。手動項目は、Umami 相当の密な canvas で
   段 0 → 1 → 2 の順に辿れること、pan 中に tooltip が出ないこと、の 2 件。
10. **ADR 昇格**: 実装完了後に `docs/adr/3022-edge-label-disclosure.md` として昇格し、
    本 Design Doc は同 PR で削除する。ghost / cyclic の扱いを改めた旨は新しい ADR の背景に
    書く。ADR-2048 と ADR-2360 は本文を変えず、frontmatter の `related_to` だけを足す
    （`.claude/rules/adr.md`「既存 ADR を覆すとき」）。

spike のコードは上の 1〜4 と 6 を実装済みで、core のテストは 4,682 件中 4,680 件が通る。
落ちる 2 件は、新しい property が spec に無いこと（指針 7）と、ghost / cyclic を配置パスに
入れたこと（指針 3）による。app の 1,462 件は全部通る。

### 影響範囲・マイグレーション

- **既存ユーザーへの影響**: ラベルが 40 文字を超える、またはラベルが衝突している図で、
  canvas の見た目が変わる。`examples/` に 40 文字を超えるラベルは無く、root view には衝突も
  無い（drill-down の各階層と deploy view の衝突は未計測）。今日の挙動に戻すには
  `edge { label-max-chars: none; label-display: always; }` を書く。
- **ドキュメント更新**: `docs/spec/style.md`（指針 7）。`docs/concepts.ja.md` の
  「集約」節に、ラベルも同じ原則で絞ることを 1 段落足すかは実装 PR で判断する。
- **テスト・examples への影響**: `label-placement.test.ts` の ghost / cyclic 除外の
  テストを `always` と `auto` の 2 ケースに分ける。examples の `.krs` は変更なし。

## 未解決の問い / 決めないこと

- **静的出力の既定を `auto` にしてよいか。** 推奨は「全 surface で同じ既定」。静的 SVG
  だけ `always` にすると、app で見た図と export した図が食い違う（TPL-219 の parity）。
  衝突したラベルは描いても読めないので、保留で失うものは小さい。ただし README に
  貼った SVG を画像化している利用者は、保留されたラベルを失う。レビューで決める。
- **既定の上限文字数。** 40 は `examples/` の最長（30 文字）を超え、Umami の中央値
  （76 文字）を半分にする値として置いた。計測した 24 / 32 / 40 文字は、`auto` の下では
  どれも衝突 0 件で、canvas に残るラベルも 11 本で同じ。残る 11 本の読みやすさで決める。
- **ラベルだけの edge をクリックしたときに詳細パネルを開くか。** hover の無い
  タッチ端末では、保留したラベルに届く経路が右クリック相当の操作しか無い。それも
  canonical id を持つ edge に限られ、ghost edge には経路が無い。
  edge-hover-affordance.md は「detail payload を持たない edge のクリックは何も
  起動しない」と決めているので、そちらの実装と合わせて決める。
- **合成ラベルを保留の対象にするか。** `N domain edges` や `W` / `R` は `data-edge-label` に
  載らない（ADR-1554）ので、保留すると app の tooltip から届かない。推奨は対象外にして、
  author 指定のラベルと同じく障害物としてだけ扱うこと。集約ラベルはクリックの的でもある。
- **1 PR で出すか、core と app で Issue を割るか。** 割る場合は
  `.claude/rules/program-slices.md` に従い、#3022 を親にして sub-issue を起こす。
- **deploy view への適用。** deploy の edge は全部 ghost なので、指針 3 の変更で初めて
  配置パスに入る。spike は deploy view を計測していない。canvas の段の実装で dify の
  deploy view を計測し、悪化するなら deploy では `always` を既定にする。
- **決めないこと**: 線側の集約（#3027）と、card の下を通る配線（#3026）。
