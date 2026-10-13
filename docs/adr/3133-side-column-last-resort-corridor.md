---
id: ADR-3133
title: 側面列の端点へのエッジは、どの候補も成立しないとき、端点の間の空き列で通す
status: accepted
date: 2026-10-13
topic: renderer
refines: [ADR-2611]
related_to: [ADR-968, ADR-1728, ADR-1859, ADR-2330, ADR-3026]
scope:
  packages:
    - core
assumptions:
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: freeColumnLanes"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: lanesAcross"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: channelBelow"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: channelAbove"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: ChannelBasis"
  - "grep: packages/core/src/renderer/edge-routing-groups.ts :: MAX_CORRIDOR_TRIES = 8"
  - "grep: packages/core/src/renderer/routing-parity.test.ts :: edge into a side column"
  - "file: packages/core/src/renderer/edge-routing-side-column.test.ts"
  - "file: docs/test-perspectives/TPL-3026-candidate-chain-covers-every-endpoint-relation.md"
---

# ADR-3133: 側面列の端点へのエッジは、どの候補も成立しないとき、端点の間の空き列で通す

- **日付**: 2026-10-13
- **ステータス**: 決定済み
- **関連**:
  - Issue #3133（起点。#3026 の計測中に見つかった）、実装 PR #3153。Design Doc は書かず、選択肢は実装 PR の中でユーザーが決めた
  - [ADR-2611](2611-layer-spanning-edge-columns.md)（corridor のチャネル stub と staircase。本 ADR は corridor に最後の候補を足す）、[ADR-1728](1728-external-on-sides-layout.md)（`[external]` の側面列）、[ADR-3026](3026-same-row-channel-route.md)（同じ行の候補。チャネルの測り方と ungrouped 限定の理由を共有する）、[ADR-968](968-orthogonal-edge-routing-skip-layer.md)（行間チャネル）、[ADR-1859](1859-system-view-p2c-grouped-edge-routing-and-marks.md)（ガター / mixed route。交差は表現で無害化する）、[ADR-2330](2330-ungrouped-routing-parity.md)（計測柵で保証する）
  - TPL: [TPL-3026](../test-perspectives/TPL-3026-candidate-chain-covers-every-endpoint-relation.md)（本件の失敗モードと対処パターンを追記した）、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)
  - AT: `docs/acceptance/3133-side-column-corridor.md`
  - コード: `packages/core/src/renderer/edge-routing-groups.ts`（`routeGroupedEdges` の最後の候補、`freeColumnLanes`、`lanesAcross`、`channelBelow` / `channelAbove`、`mixedEnd` の `ChannelBasis`）

## 背景

dify の system ビューで、`Gateway` との間の 3 本のエッジ（`Console -> Gateway`、`PublishedApp -> Gateway`、`Gateway -> WebFrontend`）が斜めの直線のまま 7 枚のカードを貫通していた。root ビューと `Dify` ビューの 2 か所で同じなので計 14 件。`Gateway` は `[external]` の側面列（ADR-1728）の下端にあり、もう片方の端点はグリッドの中にある。TPL-3026 の位置関係の表でいう「片方が側面列にある」組で、ADR-3026 の同じ行の候補は扱っていない。

原因は 2 つあった。

1. **corridor の上限が、ガター経路を当てにしていた。** corridor は端点の中点に近い順に 8 本（`MAX_CORRIDOR_TRIES`）だけ試す。遠い corridor は外側のガター経路とほとんど長さが変わらない、というのが上限の根拠である。側面列は隙間なく積まれたカードの列なので、ガターへ出る stub はどれも側面列かグリッドを横切り、ガター経路も mixed route も成立しない。側面列とグリッドの間には 100px の空いた列（`EXTERNAL_SIDE_GAP`）があるのに、中点から遠いので上限の外に落ちていた。その列の候補も、行ごとの隙間の中央は行が揃わないので出ず、両脇のカードの縁から半ガター離れた 2 本しかなかった。
2. **行間チャネルを側面列のカードからも測っていた。** `channelBelow` / `channelAbove` はキャンバス全体で最も近いカードを見る。側面列のカードは行と別の段で並ぶので、チャネルが端点自身の行の中（背の高い隣のカードの中）に落ち、横走りがそのカードを横切って候補が拒否された。

どの候補も成立しないので、never worse によりエッジは直線のまま残った。

## 決定

**ガターと mixed route がどちらも成立しなかったエッジに限り、端点の間でカードが立たない列のレーンをすべて試す、最後の候補を足す。**

1. **位置**: `routeGroupedEdges` の最後、エッジを直線のまま残す直前。それまでの候補で経路が決まったエッジには届かないので、今日成立している経路は 1 本も動かない。
2. **候補の列**: 端点の向かい合う辺の間の縦の範囲に入るカードを x で並べ、content の内側で覆われていない区間を空き列とする（`freeColumnLanes`）。範囲の上か下にしかないカードは列を塞がないので、行が揃わない側面列の脇の隙間も 1 本の列として見つかる。各列は `TRUNK_LANE_GAP` 間隔のレーンに切る。切り方は staircase の行の隙間と同じ `lanesAcross` を共有する（TPL-219）。中点に近い順に、既存の `tryCorridorRoute` で試す。
3. **チャネルは横走りの下のカードから測る**（`ChannelBasis = "under-run"`）: この候補の中でだけ、端点のチャネル stub の y を、端点からレーンまでの x 範囲に入るカードだけから測る。その範囲では行も丸ごと測り、端点の辺を越えて伸びる隣のカードがあれば、その下端（上向きなら上端）までを行とする。伸びるカードが増えなくなるまで繰り返す。
4. **ungrouped に限る。** 空き列もチャネルもカードだけから測るので、grouped では枠の見出しや両端の枠の外に落ちうる。ADR-3026 の同じ行の候補、corridor、staircase と同じ扱い。
5. **端点が縦に重なる組は対象外。** 向かい合う辺の間の範囲が空なので、空き列が定義できない。同じ行の組は ADR-3026 の候補が受け持つ。

## 理由

- **最後に置くので、変わるのは貫通していたエッジだけ。** 4 つの逆生成モデル（1,542 ビュー）で、経路が変わるのは dify の system ビューの 2 ビュー・12 本だけ。貫通は 14 → 0、collinear overlap は増えない。twenty / wordpress / umami は出力がバイト単位で同じ。dify の交差は 38,147 → 38,176（+29）で、すべてに hop が付く（ADR-1859 に従い交差数は pin しない）。4 モデルの描画時間は誤差の範囲。
- **上限そのものは変えない。** 上限の根拠（遠い corridor はガター経路と変わらない）は、ガター経路があるかぎり正しい。崩れるのはガター経路が無いときだけなので、そのときにだけ上限の外を試す。上限の前に候補を絞り込む、または上限を外すと、ガターで成立していたエッジの経路も変わる。
- **チャネルの測り方を変えるのは、この候補の中だけ。** 横走りが通らないカードでチャネルを決めるのは、どの呼び出し元でも理屈の上では誤りである。ただし全体を直すと影響範囲が大きい（下の却下案）。この候補の中では、側面列のカードを外さないとチャネルが端点の行に落ちるので、外すことが成立の条件になる。
- **行を丸ごと測るのはスパンがあるときだけ。** スパンが無いと、側面列のカードが行に入り、行が次の行まで伸びる（ADR-3026 が同じ行の候補で記録した問題）。スパンの中では行に揃うカードしか残らないので、行の高さを正しく測れる。CodeRabbit のレビューで、隣のカードが行間の中点を越えると候補が拒否される穴を指摘されて足した。

### 柵

- `routing-parity.test.ts`「edge into a side column」: dify の system ビューから自動で縮め、名前を一般化した fixture。`Gateway` が左の側面列にあり中心どうしの直線がカードを貫通すること（fixture が形に届いている）、貫通 0・両軸の共線 0、`Storefront -> Gateway` の縦の区間が側面列とグリッドの間を通ること。修正前は 3 件中 2 件、チャネルを全カードから測ると同じ 2 件が落ちる。
- `edge-routing-side-column.test.ts`: 手で置いたカードで、側面列の奥へのエッジが間の空き列を通ること、チャネルを横走りの下の行全体から測ること（隣のカードの高さ 120）、grouped キャンバスでは使わないこと。修正前、チャネルを全カードから測るツリー、行を丸ごと測らないツリー、grouped の条件を外したツリーで、それぞれ該当するテストが落ちる。

## 却下した案

### チャネルを、すべての `mixedEnd` で横走りの下のカードから測る

理屈の上では正しく、dify は同じく 14 → 0、4 モデルの交差は合計 −14 になる。ただし 4 モデルで 13 ビューが変わり、grouped の drill-down ではカードの配置ごと動く（1 ビューで 139 本）。今日貫通していないビューまで動かすのは本件の範囲を超えるので採らなかった。全体を直す場合は、チャネルの帯の計算（ADR-3026 / #3132）と合わせて別に扱う。

### corridor の上限を外す、または候補を上限の前に絞り込む

ガター経路で成立していたエッジも、より遠い corridor を取るようになり、経路が広く動く。上限の根拠はガター経路があるかぎり正しいので、上限は残した。

### corridor の候補に、側面列の脇の隙間を常に加える

隙間の中央の候補を行ごとの計算に足す形。中点に近い順の上限 8 本に入る保証はなく、入ったときは他のエッジの経路を変える。足すなら最後の候補と同じ列の定義になるので、最後の候補として置くほうが影響が閉じる。

### staircase を側面列に対応させる

staircase は行を y の一致で数えるので、側面列の各カードが 1 枚だけの「行」になり、行間チャネルが端点の行の中に落ちうる（コードを読んでの判断で、計測はしていない）。行の定義から側面列を外すには、側面列の判定をルーターまで渡す必要がある（LayoutNode は側面列かどうかを持たない）。空き列の候補で足りたので変えていない。

## 影響

- 既存ユーザー: Group by を使っていないキャンバスで、側面列のカードとの間のエッジがカードを貫通していたビューだけ、経路が直交の迂回に変わる。それ以外のビューは変わらない。`.krs` の構文は変えない。
- grouped キャンバスの同じ位置関係は、従来どおり直線のまま残りうる。
- TPL-3026 の位置関係の表のうち「片方が側面列にある」行に、候補ができた。「片方が in-place 展開の枠にある」行は本件では確かめていない。
