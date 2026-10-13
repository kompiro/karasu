---
id: ADR-3134
title: 同じ行間チャネルに降りる corridor / mixed route を、チャネルの中で 1 本の run につなぐ
status: accepted
date: 2026-10-13
topic: renderer
refines: [ADR-2611]
related_to: [ADR-1859, ADR-2598, ADR-3026, ADR-3088]
scope:
  packages:
    - core
assumptions:
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: joinEnds"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: sharedChannelY"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: joinInChannel"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: cheapestSide"
  - "symbol: packages/core/src/renderer/edge-routing-lanes.ts :: distributeChannelLanes"
  - "file: packages/core/src/renderer/edge-routing-same-channel.test.ts"
  - "file: docs/test-perspectives/TPL-3134-zero-length-segment-escapes-claim-and-gains-length-later.md"
---

# ADR-3134: 同じ行間チャネルに降りる corridor / mixed route を、チャネルの中で 1 本の run につなぐ

- **日付**: 2026-10-13
- **ステータス**: 決定済み
- **関連**:
  - Issue #3134（起点。#3026 の計測中に見つかった）、設計 PR #3149（本 ADR に集約し削除: `docs/design/same-channel-fold.md`）、実装 PR #3161
  - [ADR-2611](2611-layer-spanning-edge-columns.md)（corridor のチャネル stub と列の claim。本 ADR はその経路の組み立てを詰める）、[ADR-1859](1859-system-view-p2c-grouped-edge-routing-and-marks.md)（mixed route。後段のパスに参加しない素朴な channel routing の却下）、[ADR-2598](2598-edge-routing-channel-capacity.md)（行間チャネルのレーンと容量予約）、[ADR-3026](3026-same-row-channel-route.md)（同じ行の U 字と `channelStub` の共有）、[ADR-3088](3088-channel-lane-order-by-turn.md)（チャネルのレーンの上下順）
  - TPL: [TPL-3134](../test-perspectives/TPL-3134-zero-length-segment-escapes-claim-and-gains-length-later.md)（実装 PR で起こした retrospective TPL）、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)、[TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)、[TPL-3088](../test-perspectives/TPL-3088-later-pass-moves-ends-in-the-direction-earlier-separation-assumed.md)
  - コード: `packages/core/src/renderer/edge-routing-groups.ts`（`joinEnds` / `sharedChannelY` / `joinInChannel` / `cheapestSide`）、`edge-routing-lanes.ts`（`distributeChannelLanes`）

## 背景

Umami の `UmamiApp` drill-down で、同じ 2 枚のカードを双方向に結ぶエッジの組が 2 組、1 本の x 上で縦線を約 28px 共有していた（兄弟以外の共線ペア、TPL-1927）。

| 組 | x | y 範囲 |
| --- | --- | --- |
| `SessionReplay -> TrackedEntities` / `TrackedEntities -> SessionReplay` | 952.2 | 289..331 / 303..345 |
| `Sharing -> Teams` / `Teams -> Sharing` | 599.8 | 482..524 / 510..538 |

Issue は「claim で離した 2 本の縦線を `distributeChannelLanes` が寄せた」可能性を挙げていたが、2 本の縦線はそもそも claim されていなかった。

2 枚のカードは**隣り合う行**にあり、1 つの層を行に折り返した drill-down なので、エッジは向かい合う側面から出る。経路を組んだのは corridor 候補（`tryCorridorRoute`）である。

1. 両端とも横の stub が同じ行の兄弟に塞がれるので、`mixedEnd` は両端を top/bottom port からチャネルへ降ろす。隣り合う行なので、source が降りる下のチャネルと target が降りる上のチャネルは**同じチャネル**になる。
2. 経路は `port → (cx, cy) → (corridorX, cy) → (corridorX, cy) → (cx', cy) → port` になり、corridor の縦線は長さ 0 になる。
3. `claimedSegmentsOf` は長さ 0 の線分を claim しない。逆向きのエッジも同じ `corridorX` を選び、衝突は検出されない。
4. `channelRunsOf` は長さ 0 の縦線の所で run を 2 本に分ける。2 本は `corridorX` で接しているので、`distributeChannelLanes` は別々のレーンに置く。長さ 0 だった縦線がレーン間隔ぶんの長さを持つ。
5. 逆向きのエッジでも同じことが起き、2 本の縦線が同じ x で重なる。

重ならない場合でも、1 本の run で済むエッジがチャネルの中で折り返し（以下「折り返し」）、レーンを 2 本使って意味の無い段差を描く。同じ形は mixed route（`planMixedRoute`）でも起き、そこではガターまで出て戻っていた。WordPress の `WordPressApp` に残っていた共線 3 組のうち 2 組はこれだった。

実装の draft レビューで、もう 1 つの形が見つかった。`channelBelow` は上のカード自身の下端から、`channelAbove` は上の行で最も低い下端から測るので、上のカードが同じ行の他のカードより背が低いと、同じチャネルでも両端の `cy` が一致しない。`cy` の一致だけで判定すると、短い corridor が残って折り返しが消えない。

## 決定

corridor route と mixed route は両端を 1 つの関数（`joinEnds`）でつなぎ、両端がチャネル stub で同じ行間チャネルに降りるときは corridor / ガターの 2 点を入れず、チャネルの中で 1 本の run につなぐ。同じチャネルかどうかは `cy` の一致ではなく行間の帯で判定する。

- **同じチャネルの判定**（`sharedChannelY`）: 両端がチャネル stub で、`cy` が一致するか、両方が同じ行間の帯（`channelBandsOf`）の中にあれば同じチャネルとする。一致すればその y、帯で判定したときは帯の中央でつなぐ。
- **つなぎ方**（`joinInChannel`）: 各 stub の x から y へ降り、y で横へ渡る。2 本の stub が同じ x に降りるときは折れ点を 1 つにし、長さ 0 の水平区間を作らない。同じ行の U 字（`trySameRowChannelRoute`、ADR-3026）も同じ関数でつなぐ（TPL-219）。
- **ガターの選択**（`cheapestSide`）: ガターまで出なくなった mixed route は corridor を持たない。混み具合 0 として長さだけで比べ、戻り値の `corridor` は `null` になる。呼び出し側（`routeGroupedEdges`）は corridor があるときだけ `occupancy` に積む。
- **柵**: `edge-routing-same-channel.test.ts` がカードを手で置いた 2 行の図 5 種で `runRoutingChain` 全体（レーン分けを含む）を通す。corridor が列を通るもの、隙間を通るもの、mixed route の 3 種に、後の 2 種で上のカードが行より背が低いものを加える。各エッジがチャネルの中の 1 本の run になること、2 本が縦線を共有しないこと、カードを貫通しないことを assert する。

## 理由

- **原因を経路を組む段で取り除く。** 長さ 0 の区間は claim からも重なりの検出からも漏れ、後段のパスが長さを与える（TPL-3134）。後段で辻褄を合わせると、点が経路に残ってレーン順・交差マーク・ラベル配置など他のパスが引き続き見る。
- **計測で最も良い。** 4 つの逆生成モデル（Umami、Dify、Twenty、WordPress）の全ビューで、実装の base commit と比べた。

  | モデル | 共線（縦） | 交差 | 貫通 | 変わったビュー |
  | --- | --- | --- | --- | --- |
  | Umami | 2 → 0 | 5266 → 5262 | 0 → 0 | 1（`UmamiApp`、面積 −5.6%） |
  | WordPress | 3 → 0 | 70987 → 70970 | 0 → 0 | 1（`WordPressApp`） |
  | Dify / Twenty | 0 → 0 | 不変 | 不変 | 0 |

  Umami の面積が減るのは、1 本の run で済むようになり、行間の予約（ADR-2598）がレーン 1 本ぶん減るからである。
- **後段のパスに参加したまま。** つないだ run は channel run としてレーン分けに参加し、stub は従来どおり claim される（TPL-1954）。ADR-1859 が却下した「top/bottom port 固定で後段のパスに参加しない channel routing」には当たらない。障害物の判定は、組んだ経路に対して各候補がそのまま行う（AC-1）。
- **corridor と mixed で同じ規則。** 両端の入り方は `mixedEnd` / `channelStub` で共有済みで、つなぎ方も 1 つの関数にした。片方だけ直すと mixed route の折り返し（WordPress の 2 組）が残る。
- **柵は手で置いた図にした。** 設計では `routing-parity.test.ts` に配置を通す合成入力を足す予定だった。小さなモデル 700 個（grouped / ungrouped）をランダムに探したが、この入力に届くものは無かった。配置は双方向の組を隣に置くので、折り返しが起きるのは他のエッジに引かれて組が離れた大きな図だけである。届かない corpus の柵は何も保証しない（TPL-2598）ので、カードを手で置いて配線のチェーン全体を通す。修正を外すと 10 件中 8 件が、帯での判定だけを外すと背の低い 2 件が落ちる。

## 却下した案

- **長さ 0 の縦線も claim する。** チャネルの中にある長さ 0 の縦線もチャネル全体ぶん claim し、逆向きのエッジに別の x を選ばせる。変更は 1 行だが折り返しは残り、各エッジは段差を描いたまま 2 本のレーンを使う。ガターの x は claim で調停されないので mixed route の折り返しは直らず、WordPress の共線は 3 から 2 にしか減らなかった。
- **corridor だけ直す。** Umami の 2 組は直るが、WordPress のガター 2 組が残る。
- **レーン分けの側で吸収する。** `channelRunsOf` が長さ 0 の縦線をまたいで run をつなぐ。どの候補が作った折り返しでも拾えるが、点はエッジに残り、後段の他のパスが見る。corridor の x が両端の外にあるときの行って戻る区間も残る。
- **同じチャネルを `cy` の一致で判定する。** 設計時の判定。上のカードが行より背が低いと同じチャネルでも `cy` がずれ、短い corridor と折り返しが残る（draft レビューで発見）。

実装の draft レビューでは、「同じチャネルの 1 本の run」を corridor やガターの候補から切り離し、それらより先に試す独立した候補にする案も出た。corridor の x やガターの側面 stub の通り方に左右されずに選べるが、候補の並びを変えることになり、本 Issue の範囲（回帰ではない）を超えるので見送った。

## 影響

- 隣り合う行の組で、両端が同じチャネルに降りる経路の段差と、ガターまで出て戻る迂回が消える。行間の予約が減ってビューが小さくなることがある。
- 既存の snapshot は変わらない（既存のフィクスチャはこの入力に届いていなかった）。
- 背の低いカードの形（帯での判定）は、計測した 4 モデルには現れなかった。柵の合成入力だけが届く。
