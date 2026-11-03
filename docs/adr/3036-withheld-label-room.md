---
id: ADR-3036
title: 置けなかったラベルの分だけ、行間のチャネルと行内の隙間を開く（候補から選ぶ）
status: accepted
date: 2026-11-03
topic: renderer
refines: [ADR-2598, ADR-2611]
related_to: [ADR-2048, ADR-3022, ADR-2593, ADR-3027, ADR-2521]
scope:
  packages: [core]
assumptions:
  - "symbol: packages/core/src/renderer/label-room.ts :: chooseLabelRoom"
  - "symbol: packages/core/src/renderer/label-room.ts :: labelRoomInChannels"
  - "symbol: packages/core/src/renderer/label-room.ts :: labelRoomInRows"
  - "grep: packages/core/src/renderer/label-room.ts :: CHANNEL_LABEL_MARGIN = 2"
  - "grep: packages/core/src/renderer/label-room.ts :: ROW_LABEL_MARGIN = 8"
  - "symbol: packages/core/src/renderer/layout-reservations.ts :: channelLanes"
  - "symbol: packages/core/src/renderer/edge-layer.ts :: withheldLabelsOf"
  - "grep: packages/core/src/renderer/layout-types.ts :: placementPasses\\?: 1 \\| 2 \\| 3 \\| 4"
  - "grep: packages/core/src/renderer/layout-types.ts :: labelRoom\\?: \"channels\" \\| \"channels\\+rows\""
  - "file: docs/acceptance/3036-withheld-label-room.md"
  - "file: docs/test-perspectives/TPL-3036-reserved-room-kept-only-when-measured.md"
---

# ADR-3036: 置けなかったラベルの分だけ、行間のチャネルと行内の隙間を開く（候補から選ぶ）

- **日付**: 2026-11-03
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3036](https://github.com/kompiro/karasu/issues/3036)、設計 PR [#3562](https://github.com/kompiro/karasu/pull/3562)、実装 PR [#3576](https://github.com/kompiro/karasu/pull/3576)、前提の修正 [#3574](https://github.com/kompiro/karasu/pull/3574)（[#3569](https://github.com/kompiro/karasu/issues/3569)）
  - [ADR-2598](./2598-edge-routing-channel-capacity.md)（行間チャネルの容量と 2 パス配置。本 ADR は決定 3 のパス数の上限だけを改訂する）
  - [ADR-2611](./2611-layer-spanning-edge-columns.md)（行をまたぐ列の予約。本 ADR は決定 11 のパス数の上限だけを改訂する）
  - [ADR-2048](./2048-edge-label-collision-avoidance.md)（ラベル配置パス。「ノードを離してラベル空間を作る」を却下）、[ADR-3022](./3022-edge-label-disclosure.md)（`label-display: auto` の保留）、[ADR-2593](./2593-canvas-space-objective.md)（floor-first と候補探索）、[ADR-3027](./3027-mutual-edge-pair-merge.md)（相互ペアを 1 本で描く）、[ADR-2521](./2521-multi-system-pipeline-convergence.md)（共有ヘルパーに寸法フラグを足さない）
  - TPL: [TPL-3036](../test-perspectives/TPL-3036-reserved-room-kept-only-when-measured.md)、[TPL-2593](../test-perspectives/TPL-2593-layout-feedback-is-floor-first-and-monotone.md)、[TPL-2611](../test-perspectives/TPL-2611-feedback-key-survives-the-next-pass.md)、[TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)、[TPL-3022](../test-perspectives/TPL-3022-withheld-content-stays-reachable.md)
  - AT: [AT-3036](../acceptance/3036-withheld-label-room.md)
  - spike: `spike/3036-row-and-channel-label-room`（計測は #3036 のコメント。マージしない）
  - コード: `packages/core/src/renderer/label-room.ts`、`layout.ts`、`layout-reservations.ts`、`edge-layer.ts`、`svg-renderer.ts`、`layout-types.ts`

## 背景

#3036 は、行の中の 2 枚のカードの間隔（既定 60 px、icon mode では 36 px）が、そこを通るエッジに関係なく
一定であることを問題にした。行の上下の間隔は ADR-2598 で通行量に応じて広がるが、行の中は広がらない。
`label-display: auto`（ADR-3022）では、密な fixture（`packages/core/src/renderer/fixtures/dense-domain-canvas.krs`
の `UmamiApp`）で 41 本中 17 本しかラベルが置けなかった（2026-11-02 の `main`）。

Issue の前提は古くなっていた。今の `main` で行内の隙間を縦に通る線は 1〜2 本で、60 px に収まっている。
収まらない分（外側のガターへ出た長いエッジ）は ADR-2611 が列を開いている。置けないラベルの原因は線の本数ではなく、
ラベルの寸法（高さ約 15 px、幅は中央値で 230 px 前後）がレーンにもチャネルにも収まらないことだった。
置けなかった 24 本の既定のアンカーは、行間のチャネルに 17 本、行内の隙間に 7 本あった。

面積の増加は制約にしない。大きい canvas は縮小表示されるが、置けるラベルが増えるならその代償は受け入れる
（maintainer の判断、#3036）。

## 決定

幅予算の探索の後、1 回目の配置で `auto` のラベルが置けなかった図について、行間のチャネルをそのラベルの高さで開く
候補 A と、行内の隙間もそのラベルの幅で開く候補 B を配置し、renderer のラベル配置パスで置けないラベルが基準
（今日の配置）より厳密に少ない候補だけを採る。

決定の中身:

1. **測る関数は renderer のラベル配置パスそのもの**（TPL-219）。`edge-layer.ts` の `buildLabelInputs` →
   `frameBordersOf` → `resolveLabelPlacements` を 1 つの関数にし、描画と測定の両方が呼ぶ。レイアウトには
   `LayoutOptions.withheldLabels`（`withheldLabelsOf`）として渡す。返すのは置けなかったラベルの既定のアンカーと、
   衝突判定に使う `labelBox` の幅と高さ。`svg-renderer` が `styles` と `palette` を閉じ込めて作り、渡さない
   呼び出し元（draw.io export、素の `layout()`）では候補を作らない
2. **相互ペア（#3027）を分けてから測る。** 1 回目・基準・各候補の配置それぞれで、その配置の edge を分けてから
   ラベルを数える。返す配置の分割はそのまま最終の分割にし、分け直さない。ADR-2598 / ADR-2611 / #3154 の予約は
   今と同じく分ける前の 1 回目の結果から測る（チャネルのレーンの需要も分ける前の edge で数える）
3. **チャネルの需要。** 行序数 r のチャネルの帯は、frame の天井から最初の行の上端まで（r = 0）、行 r − 1 の下端から
   行 r の上端まで、最後の行の下端から frame の床まで（r = 行数）。既定のアンカーが帯の中にある置けなかったラベル
   について、どの x でもそこに重なる「箱の高さ + 2 px」の合計を取り、その最大値をラベルの需要とする。序数 r の
   需要は `レーン数 × LANE_PITCH + ラベルの需要` で、既定の間隔を超えた分だけ広げる。1 つの序数に ADR-2598 の
   チャネルが複数あるときは、`レーン数 × LANE_PITCH − 間隔` が最も大きいものを使う
4. **行内の隙間の需要。** 行の中の隣り合う 2 枚のカードの間（行の上端から下端まで）に既定のアンカーを持つ置けなかった
   ラベルのうち、最も幅の広い箱の幅 + 8 px × 2 を需要とし、隙間の幅を超えた分を右側のカードの前に開く
   （`extraGapBeforeCard`、カード id で鍵を持つ。TPL-2611）。ADR-2611 の列の予約が同じカードにあるときは大きい方を
   採る。行の外端は開かない。grouped view でも開く
5. **候補と基準。** 基準は今日の `layout()` が返す配置（1 回目、または構造の予約を入れた 2 回目）。候補 A は構造の
   予約に決定の中身 3 を、候補 B はさらに決定の中身 4 を加えたもの。需要が出なかった候補は作らない。幅予算は探索が
   選んだものをどの候補でも使い、探索をやり直さない。行の構成はどの候補でも 1 回目と同じ（ADR-2611 の決定 7）
6. **選び方。** A、B の順に配置して置けないラベルを数え、基準より厳密に少ないもののうち最も少ないものを採る。
   同数なら A を採る。どれも少なくなければ基準を返す（TPL-2593: 既定が先頭、厳密改善のみが勝つ）。置けなかった
   ラベルが無い図は候補を作らないので、配置の回数も出力も今と同じ
7. **パス数の上限を 4 にする。** 数えるのは幅予算の探索が終わった後の配置で、探索の勝者・構造の予約の 2 回目・
   候補 A・候補 B の最大 4 回。候補は 1 回目の結果だけから決まる有限の集合で、繰り返しは無い。これは ADR-2598 の
   決定 3 と ADR-2611 の決定 11（「配置は 2 回まで、`placementPasses` は 1 か 2」）を、ラベルの余地の候補に
   ついてだけ置き換える。`placementPasses` の型は `1 | 2 | 3 | 4`。採った候補は
   `LayoutResult.labelRoom`（`"channels"` / `"channels+rows"`、採らなかったときは無し）で報告する。どちらも出力で
   あって入力にはしない（ADR-2521）
8. **数えないもの。** `label-display: always` と `hover` のラベル、合成ラベル（`N domain edges` など）、ghost /
   cyclic のエッジのラベル。ghost のラベルは実線のラベルが残した余地にだけ置く dimmed な文脈なので、そのために
   図を広げない
9. **予約しない経路。** 複数 system の root view と deploy view（ADR-2598 と同じ）

## 理由

- **行内の隙間は、開くと経路が入ってくることがある。** 行内の隙間は ADR-2611 の到達性で内部の回廊になる。
  置けなかったラベルの幅で無条件に開くと（案2）、外側のガターを回っていたエッジが開いた隙間に入り、実モデルで
  置けるラベルが減った（WordPress の `WordPressApp` で 110 → 76、`WpDB` で 32 → 30、dify の `DifyDB` で
  206 → 204）。開けた空間を、測った需要とは別の種類の利用者（経路）が使う（TPL-3036）。チャネルの高さは縦に
  抜けられる回廊を増やさないので、チャネルだけを開く案（案3）はどの view でも置けるラベルを減らさなかった
- **それでも行内の隙間が効く図がある。** 密な fixture ではチャネルだけでは 21 本で、行内の隙間も開くと 30 本になる。
  問題は開くこと自体ではなく、効いたかを確かめずに採ることだった。両方を候補として配置し、測って選べば、各 view が
  自分に効く開き方を選べる。候補 B だけを基準と比べる形では、B が効かない view（`WordPressApp`）でチャネルの効果
  ごと失う
- **floor-first を保つ。** 置けなかったラベルが無い図、開いても置けるラベルが増えない図は今の配置を返すので、
  ADR-2048 が却下した「全レイアウトを変える」形にならない。`examples/` の全 view はバイト同一
- **候補は入力から決まる有限の集合で、繰り返さない。** 2 回目の結果から測り直して開け直す繰り返しは、需要と配分の
  綱引きになり停止性を失う（TPL-2593）。1 回目の結果だけから 2 つの候補を作って比べるので、上限は構成で決まる

実装 PR で測った数字（ラベルの箱の寸法で測る。spike は文字列の幅で測り、密な fixture 30・dify 216・WordPress 186
だった）:

| 図 | 置けるラベル（`main`） | 置けるラベル（本 ADR） | 採った候補 | 置けるラベルが減った view |
| --- | --- | --- | --- | --- |
| 密な fixture `UmamiApp` | 17 / 41 | 30 / 41 | B | 0 |
| dify（405 view） | 206 / 296 | 216 / 296（`DifyDB` +10） | A | 0 |
| WordPress（1,031 view） | 156 / 258 | 185 / 258（`WordPressApp` +27、`WpDB` +2） | A | 0 |
| `examples/` の全 view | — | バイト同一 | — | — |

時間は、ラベルを保留する図でだけ増える（中央値、同じ機械で `DifyDB` 173 → 403 ms、`WordPressApp` 173 → 298 ms、
密な fixture 6 → 15 ms）。

## 却下した案

- **案1: 行内の隙間を、通る線の本数で開く（Issue の提案そのまま）。** 今の `main` では需要が出ない（行内の隙間を通る
  線は 1〜2 本で 60 px に収まる）。置けないラベルの原因は線の本数ではないので、ラベルの問題に効かない
- **案2: 行内の隙間を、置けなかったラベルの幅で開く（単独、比較なし）。** 密な fixture では置けるラベルが 23 本に増えるが、
  実モデルで減る（上の理由の 1 つ目）
- **案3: 行間のチャネルだけを開く。** どの view でも置けるラベルを減らさないが、密な fixture で 21 本にとどまり、行内の隙間に
  アンカーを持つ 7 本には届かない。本 ADR の候補 A として残した
- **案4: `NODE_GAP` を一様に広げる。** 置けている図も含めてすべての図が伸び、全 snapshot が変わる。ADR-2048 が
  却下した形そのもので、floor-first に反する

## 残る限界

- **ラベルの配置の結果を renderer で使い回していない。** レイアウトは返す配置についてもラベル配置パスを走らせており、
  renderer がもう一度走らせるのは重複である。使い回せば時間のコストの一部が消えるが、`LayoutResult` にラベルの結果を
  持たせる形になる
- **候補は 2 つだけ。** 行内だけの候補や、行ごとに開くかを選ぶ候補は、配置の回数が増える。2 つで実モデルのどの view でも置けるラベルが
  減らないことは確かめたので、増やすのは効かない図が見つかってからにする
