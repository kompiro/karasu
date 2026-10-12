---
id: ADR-3026
title: 同じ行の 2 枚を結ぶエッジを、行の上下の行間チャネルで回す
status: accepted
date: 2026-10-12
topic: renderer
refines: [ADR-968]
related_to: [ADR-1728, ADR-1859, ADR-2330, ADR-2598, ADR-2611, ADR-3088]
scope:
  packages:
    - core
assumptions:
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: trySameRowChannelRoute"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: channelStub"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: settledRoutes"
  - "symbol: packages/core/src/renderer/edge-geometry.ts :: countPolylineCrossings"
  - "symbol: packages/core/src/renderer/edge-routing-lanes.ts :: distributeChannelLanes"
  - "grep: packages/core/src/renderer/routing-parity.test.ts :: same-row pair around the card between"
  - "file: packages/core/src/renderer/edge-routing-same-row.test.ts"
  - "file: docs/test-perspectives/TPL-3026-candidate-chain-covers-every-endpoint-relation.md"
---

# ADR-3026: 同じ行の 2 枚を結ぶエッジを、行の上下の行間チャネルで回す

- **日付**: 2026-10-12
- **ステータス**: 決定済み
- **関連**:
  - Issue #3026（起点。#3022 の計測中に見つかった）、設計 PR #3135（本 ADR に集約し削除: `docs/design/same-row-channel-route.md`）、実装 PR #3136
  - [ADR-968](968-orthogonal-edge-routing-skip-layer.md)（行間チャネルの直交ルーティング。「同層は対象外」としていた範囲を本 ADR で広げる）、[ADR-1859](1859-system-view-p2c-grouped-edge-routing-and-marks.md)（ガター / mixed route。交差は表現で無害化し、交差数の最小化は追わない）、[ADR-2330](2330-ungrouped-routing-parity.md)（両モードが 1 本の候補列を共有し、計測柵で保証する）、[ADR-2598](2598-edge-routing-channel-capacity.md)（行間チャネルのレーンと容量予約）、[ADR-2611](2611-layer-spanning-edge-columns.md)（corridor のチャネル stub と staircase）、[ADR-3088](3088-channel-lane-order-by-turn.md)（チャネルのレーンの上下順）
  - TPL: [TPL-3026](../test-perspectives/TPL-3026-candidate-chain-covers-every-endpoint-relation.md)（設計 PR で起こした retrospective TPL）、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)、[TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)
  - AT: `docs/acceptance/3026-same-row-channel-route.md`
  - 派生 Issue: #3132（チャネルの帯が drill-down の枠をまたぐ）、#3133（Dify system ビューの斜めの直線）、#3134（両方向の staircase の共線）
  - コード: `packages/core/src/renderer/edge-routing-groups.ts`（`trySameRowChannelRoute` / `channelStub` / `settledRoutes`）、`edge-routing-lanes.ts`（`distributeChannelLanes`）、`edge-geometry.ts`（`countPolylineCrossings`）

## 背景

drill-down で同じ行に並んだ 2 枚のカードを結ぶエッジが、間に立つカードを直線で突き抜けて描かれていた。カードの下に隠れた区間は見えないので、読み手には間のカードに 2 本の短い線が刺さっているように見え、そのカード自身のエッジだと読める。

`runRoutingChain` の候補は「直線（clear なら触らない）→ channel-L → corridor → staircase → 側面ガター / mixed」の順で、最初に clear になったものを採る。各候補は端点の位置関係に前提条件を持ち、**端点が縦に重なる組（同じ行）を受け付ける候補が 1 つも無かった**。

| 候補 | 同じ行の組で失敗する理由 |
| --- | --- |
| channel-L（`routeOrthogonalEdges`） | 下向きのエッジだけを扱う |
| corridor（`tryCorridorRoute`） | 側面 stub が corridor に届くには間にカードが無いことが要り、塞がれた stub のチャネル迂回は `!forward && !backward` で null |
| staircase（`tryStaircaseRoute`） | 2 行以上離れた組だけ |
| 側面ガター（`planGutterRoute`） | 遠い側の端点の横 stub が間のカードを横切る |
| mixed（`planMixedRoute`） | 冒頭の `!forward && !backward` で null |

どれも成立しないので、never worse によりエッジは直線のまま残った。ADR-968 は Phase 2 のスコープとして同層を対象外にしており、その後の候補（mixed、corridor、staircase）もこの位置関係を拾っていなかった。

4 つの逆生成モデル（umami / dify / twenty / wordpress、計 1,542 ビュー）で、同じ行の組の貫通は 19 件（umami 5、dify 3、twenty 3、wordpress 8）。`examples/` には 0 件で、routing-parity の柵は green のまま見逃していた（TPL-2598、TPL-3026）。

## 決定

**端点が縦に重なる組に、行のすぐ上か下の行間チャネルを U 字に回る候補を足す。** 片方のカードの上辺（または下辺）から出て、行の上（または下）のチャネルを横に走り、もう片方のカードの上辺（または下辺）に入る。

1. **位置**: `routeGroupedEdges` の corridor の後、staircase の前。直線が clear な組と ghost / cyclic は従来どおり先に抜ける。全体の polyline が clear で、stub が claim 済みの線分と衝突しないときだけ適用する（AC-1）。
2. **ungrouped（枠の無いキャンバス）に限る。** チャネルの y をカードだけから測るので、grouped では枠の見出しや、両端が属する枠の外に落ちうる。corridor / staircase と同じ扱いで、grouped の同じ行の組は従来どおり直線のまま残る。
3. **チャネルの y は、2 枚と、x 方向でその間に立つカードの縦の範囲から測る。** 2 枚だけで測ると、間に背の高いカードがあるとき下側のチャネルがそのカードに落ちる。間に立たないカードは取り込まない（側面列（ADR-1728）は行に揃わず並ぶので、取り込むと行が次の行まで伸びる）。取り込みは増えなくなるまで繰り返し、走査順に依らない。
4. **上下の選び方**: 両側とも clear なときだけ、経路が確定した他のエッジ（waypoint を持つもの、clear で動かない直線）との交差を数え、少ない側を採る。同数なら時計回り（右向きは上、左向きは下）。交差は真の交差だけを数える（`countPolylineCrossings`。接触・端点の共有・共線は数えない）。
5. **stub の決め方を共有する**: mixed / corridor のチャネル stub の規則（カード中央、claim 済みなら lane pitch ずつ横へ）を `channelStub` に切り出し、3 つの経路で使う（TPL-219）。
6. **片側が開いたチャネルのレーン**: 最上段の上・最下段の下のチャネルでは、`distributeChannelLanes` がレーンを中心から両側へ広げず、行から離れる向きに積む。行に最も近いレーンは router が置いた y に残る。2 行の間のチャネルは従来どおり。

## 理由

- **欠けていた位置関係を埋める最短の形。** run は既存のチャネル run なので、レーン分け・容量予約（ADR-2598）・レーン順（ADR-3088）がそのまま効き、アンカーも `fanOutGutterPorts` が上下辺のアタッチとして扱う（TPL-1954）。計測で同じ行の貫通 19 → 0、collinear overlap は増えず、経路が変わるのは 5 ビューだけ。`examples/` と既存のスナップショットは無変更。
- **上下の選び方は計測で決めた。** main からの交差の増分（4 モデル合計）:

  | 選び方 | umami | dify | twenty | wordpress | 合計 |
  | --- | --- | --- | --- | --- | --- |
  | 常に上 | +50 | +102 | +92 | +117 | +361 |
  | 常に下 | +32 | +4 | +21 | +94 | +151 |
  | 時計回り | +51 | +98 | +76 | +91 | +316 |
  | 反時計回り | +36 | +18 | +53 | +113 | +220 |
  | 交差の少ない側（未配線の直線も数える） | +13 | +22 | +19 | +95 | +149 |
  | **交差の少ない側（経路が確定したエッジだけ数える、採用）** | +13 | +4 | +19 | +95 | **+131** |

  固定の側はどれも 4 モデルすべてで最少にはならない。未配線の直線は、これから回り道に変わる弦なので、数えると描かれない幾何で側を選ぶことになる（dify で +22。実装 PR のレビューで指摘を受けて絞った）。
- **ADR-1859 の却下案（交差数の最小化）とは別物。** 交差数は clear な 2 候補のどちらを採るかの基準に使うだけで、候補を増やしたり経路を最適化したりしない。柵は従来どおり「全交差に hop が付く」で、交差数は pin しない。
- **同数のとき時計回りにすると、両方向のエッジがループになる。** 同じ側に送ると入れ子になり、一方が他方をカードの手前で横切る（試作の初版で umami の 2 組に出た）。
- **片側が開いたチャネルを中心に置くと、レーンが行に戻る。** 同じ行を回る経路が 5 本並ぶとレーンがカードの上端に載り、6 本で内側に入った（実装 PR のレビューで指摘）。

### 柵

- `routing-parity.test.ts`「same-row pair around the card between」: 互いに両方向で依存する domain を 1 行に並べた fixture 3 種（3 枚、中央だけ背の高い 3 枚、5 枚）。貫通 0、両軸の共線 0、行を回る経路の折れ点がすべて行の外、3 枚の 2 種でループ、5 枚で交差に hop。候補を外すと 5 件、レーン配置を戻すと 1 件、2 枚だけで測ると 1 件落ちることを確認した。
- `edge-routing-same-row.test.ts`: 手で置いたカードで、側面列のカードを取り込まないこと、取り込みが走査順に依らないこと（修正前は 2 件とも落ちる）。
- `edge-geometry.test.ts`: `countPolylineCrossings` の数え方。

## 却下した案

### 側面ガターへ逃がす（Issue の示唆）

素のガター経路は遠い側の横 stub が間のカードを横切るので clear にならない。両端をチャネル stub にしてガターでつなげば clear にはできるが、content の端まで出て戻るので長く、横走りが長いほど行間を縦に通るエッジと多く交差する。

### 配置を変えて、結ぶ 2 枚を隣に置く

ADR-968 の却下案 B4 と同じ（ノードではなくエッジが避ける）。3 枚が互いに依存する行では、どう並べても 1 組は隣にならない。

### 上下を固定の規則で選ぶ

上・下・時計回り・反時計回りのどれも、4 モデルすべてで最少にはならなかった（上の表）。

### grouped キャンバスでも使う

設計 PR の時点では両モードで使う予定だった。チャネルの y が枠を見ないため、枠の見出しを横切る経路になりうるので、実装 PR のレビューで ungrouped に限った。grouped で使うには、チャネルを枠の内側で測る必要がある。

### チャネルの帯の計算から ghost カードを外す

最下段の下のチャネルが枠の外の ghost カードまでを帯として測られ、レーンが drill-down の枠に寄る（#3132）。ghost を外す案は twenty の `TwentyServer` に新しい貫通を 8 件出し、umami のレーンも動かなかったので採らなかった。

## 影響

- 既存ユーザー: Group by を使っていないキャンバスで、同じ行の組が間のカードを貫通していたビューだけ、経路が U 字に変わる。容量予約で行間が広がるビューでは、カードの位置もずれる。`.krs` の構文は変えない。
- 片側が開いたチャネルのレーンは行から離れる向きに積むので、中心に置いていた頃より 2 倍遠くまで伸びる。drill-down の親の枠は障害物ではないため、`UmamiApp` では最上段の上に 7 本を超えると run が枠の外へ出る。帯が枠をまたぐ件として #3132 で扱う。
- 同じ行ではない貫通（dify の system ビューの 14 件）は扱っていない（#3133）。
