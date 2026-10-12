---
id: ADR-3088
title: 行間チャネルのレーンを、run がつながる縦線の向きで並べる
status: accepted
date: 2026-10-11
topic: renderer
refines: [ADR-2598]
related_to: [ADR-2958, ADR-1859]
scope:
  packages:
    - core
assumptions:
  - "symbol: packages/core/src/renderer/edge-routing-lanes.ts :: laneOrder"
  - "symbol: packages/core/src/renderer/edge-routing-lanes.ts :: distributeChannelLanes"
  - "grep: packages/core/src/renderer/routing-parity.test.ts :: channel lane order — corridors that touch in one channel"
  - "file: docs/test-perspectives/TPL-3088-later-pass-moves-ends-in-the-direction-earlier-separation-assumed.md"
---

# ADR-3088: 行間チャネルのレーンを、run がつながる縦線の向きで並べる

- **日付**: 2026-10-11
- **ステータス**: 決定済み
- **関連**:
  - Issue #3088（起点）、設計 PR #3095（本 ADR に集約し削除: `docs/design/channel-lane-order-by-turn.md`）、実装 PR #3110
  - [ADR-2598](2598-edge-routing-channel-capacity.md)（行間チャネルのレーン。決定 1・2 で run を x 範囲の区間分割でレーンに割る。本 ADR はそのレーンの上下順を決める）、[ADR-2958](2958-gutter-lane-bundling.md)（ガターの lane bundle。#3088 はその飽和フィクスチャで見つかった）、[ADR-1859](1859-system-view-p2c-grouped-edge-routing-and-marks.md)（ガター corridor のレーン分割、#1927）
  - TPL: [TPL-3088](../test-perspectives/TPL-3088-later-pass-moves-ends-in-the-direction-earlier-separation-assumed.md)（実装 PR で起こした retrospective TPL）、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)、[TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)、[TPL-2958](../test-perspectives/TPL-2958-bundle-shared-geometry-survives-later-passes.md)
  - AT: `docs/acceptance/3088-channel-lane-order.md`
  - コード: `packages/core/src/renderer/edge-routing-lanes.ts`（`laneOrder` / `distributeChannelLanes`）、`routing-parity.test.ts`、`edge-routing-lanes.test.ts`

## 背景

同じガターのレーンに載った 2 本の縦線が、14px だけ重なって 1 本に見えることがあった（兄弟以外の共線ペア、TPL-1927）。

1. `assignGutterLanes` は、y 範囲が**接するだけ**の corridor を「重ならない」とみなして同じレーンに置く。上の corridor の下端と下の corridor の上端が、同じ行間チャネルの同じ y で接している場合である。
2. その後で `distributeChannelLanes` が、同じチャネルを通る水平 run を x 範囲の区間分割でレーンに分け、`LANE_PITCH`（14px）ずつ上下にずらす。2 本の corridor につながる run は同じ x で終わるので、必ず別のレーンになる。
3. レーンの上下順は区間分割の都合で決まり、縦線の向きを見ていなかった。上から来る corridor の run が下のレーンに入ると、2 本の縦線がレーンの間隔だけ重なる。

main で既に起きていたが、Dify の全階層と `examples/en` には届く入力がなく、合成入力（ADR-2958 の飽和フィクスチャの table 4 本版、相方付き hub）でだけ計 6 件出ていた。

## 決定

**ガターのレーンは変えず、行間チャネルのレーンの上下順を、run がつながる縦線の向きで決める。** 同じ x で端を共有する 2 本の run のうち、その x から上へ続く run のレーンを、下へ続く run のレーンより上に置く。

1. **制約の収集**: 各 run の両端で、その x から続く縦線の向き（上 / 下）を求め、端の x ごとに索引する。同じ x に上向きと下向きのレーンがあれば「上向きのレーンを上に」の制約を立てる。
2. **並べ方**: レーンは丸ごと動かす。同じレーンに載った run どうしが触れないという区間分割の不変条件と、lane bundle の共有 run が 1 レーンにまとまっていること（ADR-2958、TPL-2958）は崩れない。制約が無いチャネルはレーンを割った順のまま。
3. **循環**: 制約のグラフを強連結成分に縮約し、成分どうしの制約は安定なトポロジカル順序で守る（同順位は成分内の最小のレーン番号）。各成分の中は元のレーン番号順に並べる。循環が無ければ成分はすべて 1 レーンで、通常のトポロジカル順序と一致する。
4. **循環で残る重なりは受け入れる。** 循環は、2 本の run が同じ 2 本の縦の列を端に持ち、それぞれの列で逆の順を求める形で、どの順でもどちらかの列が重なる。直すにはガターのレーンか列そのものを動かす必要があり、チャネルのレーンを決める段階の範囲を超える（再配線のループは ADR-2598 が却下している）。残った重なりは兄弟以外の共線ペアの柵で検出する。
5. `collectChannels` が返すレーン数（配置の予約に使う）は変えない。

これはポートの扇（`fanOutGutterPorts`）が行き先の向きで入れ子にしている規則を、行間チャネルにも当てたものである。

## 理由

- **実在の図を 1 つも変えずに重なりを 0 にする唯一の案だった。** 計測（675 view: Dify 全階層、`examples/en` 全ファイル、ルートは team / boundary も、合成入力）で、合成入力の縦の共線ペアは 6 → 0、実在の図は SVG のハッシュが修正前と一致した。
- **原因に当たっている。** 重なりの原因は、チャネルのレーンの並び順が縦線の向きを見ていないことにあった。ガター側で予防的に分ける案は症状を消すが、偶然正しい順だった図まで広げる。
- **循環の外の制約を必ず守る。** 「行き詰まったら番号の最も小さいレーンを置く」とすると、循環の外の制約まで破る（A と B が循環し B を C の上に置く制約があるとき、C が先に置かれる）。強連結成分の縮約ならそれが起きない（設計 PR #3095 のレビューで指摘を受けて採った）。
- 計測した 675 view で制約の循環は 0 件。2 列のカードを X 字に渡るエッジの入力でも、2 本のエッジが同じ列を共有する経路にならず、循環は作れなかった。
- `bench:render` の Dify 全体は main と誤差の範囲（502〜515 ms 対 507〜532 ms）。

### 柵

- `routing-parity.test.ts`「channel lane order — corridors that touch in one channel」: 飽和フィクスチャの table 4 本版と相方付き hub（それぞれ main で 1 件重なっていた）で、兄弟以外の共線 0・貫通 0。修正を外すと落ちる。
- `edge-routing-lanes.test.ts`「channel lane order (#3088)」: 区間分割が逆順に割ったチャネルで上向きの run が上に来ること、制約が無ければ元の順のままであること、循環と循環の外の制約が並ぶときに外の制約が守られること（図を通した循環の入力は作れなかったので、手で組んだ run で規則を固定する）。

## 却下した案

### 接するだけでも別のガターレーンにする

`assignGutterLanes` の判定を `end < lo` にする。合成入力の 6 件は 0 になるが、Dify `ApiBackend.Knowledge` の面積が +10.2%、getting-started（team）が +2.1% 広がった。接するだけの corridor の多くは、チャネルのレーンがたまたま正しい順で重なっていなかった。

### 接する点が行間チャネルの角のときだけ別のガターレーンにする

ポートで接する場合は扇が正しく並べるので、チャネルの run につながる端どうしで接するときだけ分ける。getting-started は変わらなくなったが、Dify Knowledge は +10.2% のままだった。チャネルの角で接していても、並び順が正しければ重ならないからである。

### 制約が循環したらチャネル全体を元の順に戻す

設計の初版の扱い。元の順は循環を満たさないので安全な代替ではなく、循環の外の制約まで捨てる（設計 PR #3095 のレビューで指摘）。

## 影響

- 既存ユーザー: チャネルの run の上下順が向きと矛盾していた図だけ、そのチャネルの run の y が入れ替わる。計測した実在の図では 0 件。`.krs` の構文は変えない。
- 接してはいないが近い corridor がチャネルのずらし幅で重なるケースは扱っていない。router は 1 本のチャネルの run を同じ y に置くので、今の経路形状では起きない（計測した全入力で 0）。
