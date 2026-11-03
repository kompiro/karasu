# 置けなかったラベルの分だけ行間のチャネルを開く（行内の隙間には需要を持たせない）

- **日付**: 2026-11-03
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3036](https://github.com/kompiro/karasu/issues/3036)（行内の 2 枚のカードの間隔を、そこを通るエッジで決める）
  - 関連 ADR: [ADR-2598](../adr/2598-edge-routing-channel-capacity.md)（行間チャネルの容量と 2 パス配置）、[ADR-2611](../adr/2611-layer-spanning-edge-columns.md)（行をまたぐ列の予約）、[ADR-2048](../adr/2048-edge-label-collision-avoidance.md)（ラベル配置パス。「ノードを離してラベル空間を作る」を却下）、[ADR-3022](../adr/3022-edge-label-disclosure.md)（`label-display: auto` の保留）、[ADR-2593](../adr/2593-canvas-space-objective.md)（floor-first）、[ADR-3027](../adr/3027-mutual-edge-pair-merge.md)（相互ペアを 1 本で描く）
  - 関連 TPL: [TPL-2593](../test-perspectives/TPL-2593-layout-feedback-is-floor-first-and-monotone.md)、[TPL-2611](../test-perspectives/TPL-2611-feedback-key-survives-the-next-pass.md)、[TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)、[TPL-2048](../test-perspectives/TPL-2048-label-placement-measured-and-byte-stable.md)、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)、[TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md)、[TPL-3022](../test-perspectives/TPL-3022-withheld-content-stays-reachable.md)、[TPL-3036](../test-perspectives/TPL-3036-reserved-room-must-not-attract-new-traffic.md)（本 PR で起こす proactive TPL）
  - コード: `packages/core/src/renderer/layout.ts`、`layout-reservations.ts`、`layer-layout-logics.ts`、`label-placement.ts`、`edge-layer.ts`、`svg-renderer.ts`、`layout-types.ts`

## 背景・課題

#3036 は、行の中の 2 枚のカードの間隔（既定 60 px、icon mode では 36 px）が、そこを通るエッジの本数に
関係なく一定であることを問題にした。行の上下の間隔は ADR-2598 で通行量に応じて広がるが、行の中は
広がらない。さらに、レーンは線 1 本ぶん（`LANE_PITCH = 14 px`）の幅しかなく、高さ約 15 px・幅最大
317 px のラベルはどちらの軸にも収まらない。`label-display: auto`（ADR-3022）では、密な fixture
（`packages/core/src/renderer/fixtures/dense-domain-canvas.krs` の `UmamiApp`）で 41 本中 13 本しか
ラベルが置けなかった。

Issue の受け入れ条件は 3 つある。

1. 行内の隙間について、何を需要と数えるか、ラベル付きのエッジが無いエッジより多くを求めるかを決める
2. 密な fixture で混んだ隙間が開き、空いた隙間は開かない。`auto` で置けたラベルの数を前後で示す
3. 隙間が既に通行量を賄っている `examples/` の図はバイト同一

本 Design Doc は 1 に答える。結論は「行内の隙間には需要を持たせない。ラベル付きのエッジが求める
余地は、行間のチャネルに開く」で、2 の対象を行内の隙間から行間のチャネルに移す。

## 現状（インベントリ）

`main`（47bf9786、2026-11-02）で測り直した。

| 観点 | 現状 |
| --- | --- |
| 行間のチャネル | `channelReservations`（ADR-2598）が、1 回目の配線で数えたレーン数 × `LANE_PITCH` が既定の間隔を超えた行の直前だけ広げ、`layoutInner` をもう 1 回だけ走らせる |
| 行内の隙間 | `columnReservations`（ADR-2611）が、外側のガターへ出た 2 行以上離れたエッジを target ごとに 1 本と数え、空きレーンが足りない行に `TRUNK_LANE_GAP`（24 px）の列を 1 本だけ開く。適用は `extraGapBeforeCard`（カード id で鍵を持つ） |
| `NODE_GAP` | 行内のカード間と、同じ層の折り返し（sub-row）の間の両方に使う定数。一様に広げると高さも伸びる |
| ラベルの配置 | `svg-renderer` の `edge-layer.ts` が、配置の**後**に `buildLabelInputs` → `resolveLabelPlacements` を走らせる（ADR-2048 / ADR-3022）。レイアウトはエッジのラベルの style（`label-display`・`label-max-chars`・`font-size`・位置）を受け取らない |
| 先例 | `LayoutOptions.edgeLineKey`（#3027）は、renderer が style から作った関数をレイアウトへ渡す。draw.io export と素の `layout()` は渡さず、その機能は働かない |

### 密な fixture の今の数字

Issue の表は `feat/3030-edge-label-canvas-tier` 上で測ったもので、その後 #3027（相互ペアを 1 本で描く）、
#3309 などが入って図が変わった。今の `main` では canvas が 1480 × 918、`auto` で置けるラベルは
**17 / 41** である。行内の隙間はどれも 60 px で、そこを縦に通る線は 1〜2 本しかない（24 px のレーンなら
2 本入る）。Issue の「5〜14 本」は残っていない。

置けなかった 24 本のラベルの既定のアンカー位置:

| どこ | 置けた | 置けなかった | ラベル幅（中央値） |
| --- | --- | --- | --- |
| 行間のチャネル（水平の run） | 7 | 15 | 232 px |
| 行間のチャネル（垂直の run） | 2 | 2 | 253 px |
| 行内の隙間（隣のカードへ渡る線） | 8 | 7 | 238 px |

## 制約・前提

- **floor-first**（ADR-2593 / TPL-2593）: 既定の配置でラベルが置けている図は 1 バイトも変えない
- **2 パスまで**（ADR-2598）: 予約は 1 回目の結果から測り、配置をもう 1 回だけ走らせる。3 回目は置かない
- **鍵は構造キー**（TPL-2611）: 予約の適用先は行序数・カード id で持ち、座標で持たない
- **ADR-2048 の却下との線引き**: ADR-2048 は「レイアウトでノードを離してラベル空間を作る」を「影響範囲が
  全レイアウト・全 snapshot に及び、cosmetic 修正には過大」として却下した。本件は、置けなかったラベルが
  ある図の、そのラベルがあるチャネルだけを広げる。置けている図は変わらない（下の計測で `examples/`
  85 本がバイト同一）
- **大きい canvas は縮小表示される**（TPL-1223）: 面積の増加は文字が小さくなることと引き換えになる
- **範囲外**: deploy view と複数 system の root view は ADR-2598 の時点で予約しない。本件もそれに従う

## 検討した選択肢

計測はすべて `main` に試作のパッチを当てて行った。コーパスは密な fixture（`UmamiApp`）、dify
（`/workspaces/dify/index.krs`、405 view・ラベル 296 本）、WordPress（1,031 view・ラベル 258 本）。
試作のスクリプトとパッチは `reports/3036/`（gitignore）にある。

### 案1: 行内の隙間を、通る線の本数で開く（Issue の提案そのまま）

隙間を縦に通る run の最大同時数 × レーン幅が隙間の幅を超えたら、超えた分だけ開く。

**メリット**

- 行間のチャネル（ADR-2598）と同じ形で、水平軸の対称性がとれる

**デメリット**

- 今の `main` では需要が出ない。密な fixture の行内の隙間を通る線は 1〜2 本で、60 px に収まっている。
  線のための列は ADR-2611 が既に開いている（外側のガターへ出た分だけ）
- ラベルの問題に効かない。置けないラベルの原因は線の本数ではない

### 案2: 行内の隙間を、置けなかったラベルの幅で開く

1 回目の配置にラベル配置パスを走らせ、置けなかったラベルのうち既定のアンカーが行内の隙間にあるものの
幅（+ 余白 8 px × 2）まで、その隙間を開く。

| | 密な fixture | dify | WordPress |
| --- | --- | --- | --- |
| `main` | 17 / 41（1480 × 918） | 206 / 296 | 156 / 258 |
| 案2 | 23 / 41（1828 × 918、面積 +24%） | **204** / 296 | **120** / 258 |

**メリット**

- 密な fixture には効く。`examples/` 85 本はバイト同一

**デメリット**

- **実モデルで置けるラベルが減る。** WordPress の `WordPressApp` で 110 → 76、`WpDB` で 32 → 30、
  dify の `DifyDB` で 206 → 204。増えた view は 1 つも無い。TPL-2593 の単調性に反する
- 減る仕組み: 隙間を広げると、外側のガターを回っていたエッジが内部の回廊（ADR-2611 の到達性）として
  その隙間に入ってくる。`WordPressApp` では、ガターの水平の run に乗るラベルが 31 → 12 本に減り、行内の
  隙間に乗るラベルが 12 → 25 本に増え、そのうち置けないものが 5 → 17 本になった。開けた空間を、測った
  需要とは別の経路が使う。行内の隙間は配線が配分する資源なので、ラベルのための予約にならない
  （[TPL-3036](../test-perspectives/TPL-3036-reserved-room-must-not-attract-new-traffic.md)）

### 案3: 行間のチャネルを、置けなかったラベルの行数で開く

1 回目の配置にラベル配置パスを走らせ、置けなかったラベルのうち既定のアンカーが行間のチャネルにある
ものを集める。その x 範囲（ラベルの箱の幅）を区間分割して、重なり合うラベルの最大数 k を数え、
チャネルの需要を `レーン数 × LANE_PITCH + k × ラベル 1 行の高さ` とする。既定の間隔（ADR-2598 の
予約を含む）を超えた分だけ、その行の直前を広げる。

| | 密な fixture | dify | WordPress |
| --- | --- | --- | --- |
| `main` | 17 / 41（1480 × 918） | 206 / 296 | 156 / 258 |
| 案3 | **22** / 41（1480 × 1058、面積 +15%） | **214** / 296 | **190** / 258 |

view ごと:

| view | ラベル | 面積 |
| --- | --- | --- |
| `WordPressApp` | 110 → 139 / 200 | 7.70 → 11.10 Mpx（+44%） |
| `WpDB` | 32 → 37 / 44 | 1.58 → 1.71 Mpx（+8%） |
| `DifyDB` | 206 → 214 / 296 | 19.93 → 24.98 Mpx（+25%） |

**メリット**

- **どの view でも置けるラベルが減らない。** 変わった view はすべて増えた
- `examples/` 85 本（全 view のバンドル）はバイト同一。置けないラベルがある view だけが変わる
- チャネルは行の構造で決まり、広げても新しい経路を呼び込まない。ADR-2598 の予約と同じ鍵（行序数）・
  同じ 2 パス目に乗る

**デメリット**

- 面積が伸びる view がある。`WordPressApp` は +44%
- 1 回目の配置でもラベル配置パスを走らせるので、ラベルのある view は遅くなる。`DifyDB` 196 → 254 ms、
  `WordPressApp` 217 → 239 ms、密な fixture 10 → 16 ms（3〜5 回の中央値）
- レイアウトがラベルの style を受け取る必要がある

### 案4: 間隔を一様に広げる

`NODE_GAP` を定数のまま大きくする（Issue の表の形）。

| `NODE_GAP` | 密な fixture のラベル | canvas | 面積 |
| --- | --- | --- | --- |
| 60（今） | 17 / 41 | 1480 × 918 | — |
| 100 | 25 / 41 | 1640 × 1108 | +34% |
| 140 | 27 / 41 | 1800 × 1308 | +73% |
| 200 | 31 / 41 | 2040 × 1608 | +141% |

**デメリット**

- 置けている図も含めてすべての図が伸びる。floor-first に反し、全 snapshot が変わる（ADR-2048 が
  却下した形そのもの）

### 案2 + 案3

密な fixture で 29 / 41（面積 +42%）と最も多いが、案2 の非単調性をそのまま持ち込む（WordPress 155 / 258 と
`main` より少ない）。

## 比較

| 観点 | 案1 | 案2 | 案3 | 案4 |
| --- | --- | --- | --- | --- |
| 密な fixture のラベル | 17（変化なし） | 23 | 22 | 25〜31 |
| 実モデルで減る view | なし | 3 | **なし** | 未計測 |
| `examples/` の差分 | なし | なし | **なし** | 全部 |
| 面積 | なし | +24%（密） | +15%（密）、最大 +44%（1 view） | +34〜141% |
| パス数 | 2 まで | 2 まで | 2 まで | 1 |

## 現時点の方針

**案3 を採用する。行内の隙間には需要を持たせず、ADR-2611 の列の予約を水平軸の唯一の予約として残す。**

受け入れ条件 1 への答え:

- **行内の隙間の需要は、線についても ADR-2611 の列で足りている。** 今の `main` で行内の隙間を通る線は
  60 px に収まり、収まらない分（外側のガターへ出た長いエッジ）は ADR-2611 が数えて列を開いている。
  線の本数を需要に足しても何も開かない（案1）
- **ラベル付きのエッジは、線より多くを求める。ただし求める先は行間のチャネルである。** 行内の隙間を
  ラベルのために開くと、開けた空間に配線が入ってきてラベルは減る（案2）。チャネルは配線が配分しない
  ので、開けた分がそのままラベルの余地になる（案3）

受け入れ条件 2 は、行内の隙間ではなく行間のチャネルについて示す（密な fixture で 17 → 22、混んだ
チャネルだけが開き、置けないラベルが無いチャネルは開かない）。受け入れ条件 3 は案3 で満たす。

### 決定の中身

1. **需要の入力。** 1 回目の配置（幅予算の探索が選んだもの）に、renderer と同じラベル配置パスを走らせる。
   `buildLabelInputs` → `resolveLabelPlacements` を、renderer と同じ引数（frame の境界を含む。#3155）で
   呼ぶ。同じ判定を 2 か所に書き分けない（TPL-219）。置けなかった（`deferred`）ラベルだけを数える
2. **ラベルの style はコールバックで受け取る。** `LayoutOptions` に `edgeLabelStyle?: (edge) =>
   ResolvedEdgeStyle` を足し、`svg-renderer` が `resolvedEdgeStyle(styles, edge)` を渡す（`edgeLineKey` と
   同じ形）。渡さない呼び出し元（draw.io export、素の `layout()`）では予約しない
3. **数え方。** 既定のアンカーが行間のチャネルの帯（上の行の下端と下の行の上端の間）にあるラベルを、
   その x 範囲で区間分割し、重なりの最大数 k を数える。ラベル 1 行の高さは、そのラベルの箱の高さ
   （`labelBox`）に余白を足したもの。需要は ADR-2598 のレーンと**合算**して 1 つの値にする
   （`レーン数 × LANE_PITCH + Σ ラベル行の高さ`）。2 つの予約を別々に最大値で合わせると、どちらかが
   相手の分を食う
4. **閾値は既定の間隔。** 需要が今の間隔に収まるチャネルは広げない（floor-first）
5. **鍵と適用は ADR-2598 のまま。** 行序数で持ち、同じ 2 パス目で適用する。`placementPasses` は 1 か 2
6. **数えないもの。** `label-display: always` と `hover` のラベル（`always` は置けなくても描かれ、
   `hover` は canvas に描かれない）、ghost / cyclic のエッジ、合成ラベル（`N domain edges` など。
   保留されないので `deferred` にならない）
7. **予約しない経路。** 複数 system の root view と deploy view（ADR-2598 の決定 4 と同じ）

### 実装の指針

1. `layout-types.ts`: `LayoutOptions.edgeLabelStyle` を足す
2. `layout-reservations.ts`: `channelReservations` に、置けなかったラベルの行数を需要として足す入力を
   加える（ラベルの入力は `layout.ts` で作って渡し、`layout-reservations.ts` はラベル配置パスを知らない
   形にするか、実装時に依存の向きを決める。`check:cycles` が通ること）
3. `layout.ts`: 1 回目の結果に対してラベル配置パスを走らせ、置けなかったラベルを集める。予約が空なら
   2 パス目を走らせない（今と同じ）
4. `svg-renderer.ts`: `edgeLabelStyle` を渡す
5. テスト:
   - 密な fixture で、置けるラベルが 17 → 22 以上、`placementPasses` が 2、置けないラベルが無い
     チャネルの間隔が変わらない
   - `edgeLabelStyle` を渡さない `layout()` の出力が今と同じ
   - `examples/` の全 view がバイト同一（既存の snapshot と examples の柵）
   - 置けないラベルがある view で、ラベルの数が減らない（TPL-2593。実モデルは repo に無いので、
     密な fixture と合成 fixture で固定し、dify / WordPress の数字は PR に記録する）
6. AT: `docs/acceptance/` に追加する。手動項目は preview で密な fixture を開き、混んだチャネルにラベルが
   増えていることを目で確かめる 1 件
7. changeset: `@karasu-tools/core` と `karasu` に minor（レイアウトの挙動が変わる）
8. ADR 昇格: 実装の PR がマージされたら `docs/adr/3036-channel-label-room.md` に昇格し、本 Design Doc を
   削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: `auto` でラベルが置けなかった図だけ、行間が広がってラベルが増える。置けていた図は
  変わらない
- ドキュメント更新: なし（`docs/spec/style.md` の `label-display` の説明は変わらない）
- テスト・examples への影響: 密な fixture の数を固定しているテスト（`edge-label-disclosure-surfaces.test.ts`、
  `mutual-pair.test.ts`）の期待値が変わる。`examples/` は変わらない

## 未解決の問い / 決めないこと

- **1 view あたりの伸びに上限を付けるか。** チャネルごとのラベル行を 1 行までにすると、`WordPressApp` は
  139 → 137 本・面積 +44% → +29%、`DifyDB` は 214 → 213 本・+25% → +22% になるが、密な fixture では 1 本も
  増えない（17 のまま。チャネルの今の間隔に 1 行ぶんの余地が既にある）。**本 Design Doc は上限を付けない**
  方針で出し、レビューで判断を仰ぐ。上限を付けるなら、密な fixture で効く値（3 行で 19 本）と実モデルの面積の
  兼ね合いで決める
- **1 回目のラベル配置の結果を renderer で使い回すか。** 予約が空の view では、1 回目の配置がそのまま最終の
  配置なので、renderer が同じパスをもう一度走らせるのは重複である。使い回せば案3 の時間のコストの大半が
  消えるが、`LayoutResult` にラベルの結果を持たせる形になる。性能の最適化として実装時に判断する
- **行内の隙間を開く別の方法。** 案2 の失敗は、開けた空間に配線が入ってくることだった。配線が使えない
  余地（ラベル専用の帯）として開く方法はありうるが、配線側に「使ってはいけない帯」を持たせる変更になり、
  本件の範囲を超える。必要になったら別の Issue で扱う
