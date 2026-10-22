---
id: TPL-3132
title: "枠の中で分け合う資源（チャネル・レーン）は、その枠の内側を境界として測り、足りなければ枠を広げる"
status: active
date: 2026-10-13
applicable_to:
  - "枠（ドリルダウンの枠、group 枠、system 枠）の中のエッジに割り当てる通路やレーンで、位置や幅を周囲の障害物から測るもの"
  - "枠の寸法が配置の時点で決まり、その後の配線が枠の中の余白を使うパイプライン"
  - "同じ資源を複数のパス（ルーターの y、レーンの配置、予約）がそれぞれ測るもの"
known_consumers:
  - routing-parity
  - renderer
discovered_from:
  - issue: "#3132"
  - issue: "#3154"
  - root_cause_file: "packages/core/src/renderer/edge-routing-lanes.ts"
  - root_cause_file: "packages/core/src/renderer/edge-routing-groups.ts"
related_to:
  - TPL-219
  - TPL-2598
  - TPL-3026
topic: renderer
scope:
  packages:
    - core
---

# TPL-3132: 枠の中で分け合う資源（チャネル・レーン）は、その枠の内側を境界として測り、足りなければ枠を広げる

## 観点

チャネルやレーンの幅は、周囲の障害物の中で最も近いものから測ることが多い。枠がすべてのカードを囲んでいるとき、枠は障害物として数えても何も区切らない（すべての run が枠の内側にある）。その結果、枠の外側の端にあるチャネルは**枠の外の物**か**何も無い空間**で幅が決まり、レーンが枠の線に載るか、枠の外へ出る。

したがって枠の中の資源を測るときは、**枠を「内側に境界線を持つもの」として数える**。上はタイトル帯の下端、下は枠の下端、左右は枠の側面である。境界が決まれば、足りないときに広げる場所（予約）も枠の内側に取れる。

確認は 2 つに分かれる:

1. **境界**: 枠の外側の端にあるチャネル・レーンが、枠の線で閉じているか。枠の外の物（ghost カードなど）が境界になっていないか。
2. **容量**: 枠の余白より多くの本数が要るとき、枠が広がるか。境界だけ足して容量を足さないと、レーンは帯の中に詰め込まれて読めなくなる（ADR-2598 の「ピッチと予約は組」）。

同じ資源を測るパスが複数ある（ルーターが置く y、レーンの並べ方、予約の量）なら、すべてが同じ境界を使うこと（TPL-219）。

## 想定される失敗モード

- **枠の外の ghost カードが境界になる**（#3132）: ドリルダウンの最下段の下のチャネルが、枠の外に置かれた ghost カードまでの帯として測られた。Umami の `UmamiApp` では 2 本のレーンが y 745 / 759 に置かれ、枠の下端（762）にほぼ重なり、ラベルは枠の外に描かれた。
- **片側が開いたチャネルが枠を越える**（#3132 のコメント）: 最上段の上に何も無いと、レーンは行から離れる向きに積まれ、7 本目から枠の外に出た。相互依存の 1 行 fixture では、run が枠の上端の 44px 上、下端の 74px 下まで伸びた。
- **横方向の同型**（#3154）: ガターのレーンは `maxRight + GUTTER_GAP + レーン × 24` で外へ伸び、枠の左右の余白（40px）を見ない。4 つの逆生成モデルのドリルダウン 79 ビューで、縦の線分 3,100 本以上が枠の側面の上か外にある。
- **柵が green のまま見逃す**: 実モデルの corpus は外側のチャネルを混雑させず、はみ出しは 1,542 ビュー中 1 件しか無かった。飽和させる入力が無ければ、境界の欠落は観測されない（TPL-2598）。

## チェックリスト

枠の中のエッジに通路・レーンを割り当てる仕組みを足す・変えるときに確認する:

- [ ] その資源の境界を測る障害物に、囲む枠の内側の線（タイトル帯の下端・下端・側面）が入っているか。枠を矩形の障害物として数えるだけでは、囲まれた run に対して何も区切らない
- [ ] 枠の外にある物（ghost カード、祖先の枠の外の要素）が、枠の内側の資源の境界になっていないか
- [ ] 余白が足りないとき、枠が広がるか（予約が枠の外側の端の gap にも効くか）。境界だけで容量が無いと、詰め込みになる
- [ ] 同じ資源を測る複数のパスが、同じ境界の値を受け取っているか
- [ ] 柵の corpus に、枠の外側の端の資源を飽和させる合成 fixture があり、修正前のツリーで落ちることを確認したか
- [ ] 縦方向を直したなら、横方向（左右のガター）でも同じことが起きていないか測ったか

## 既知の対処パターン

- **枠の内側の線を高さ 0 の障害物として足す**: `ChannelLimits`（`ceiling` = 枠の y + `CONTAINER_LABEL_HEIGHT`、`floor` = 枠の下端）を、ルーターの `channelBelow` / `channelAbove`、レーンの `collectChannels`、予約の `channelReservations` が共通に受け取る（#3132）。
- **外側の端の gap を予約できるようにする**: 行 0 の上と最終行の下（行序数 `rows.length`）も予約の対象にし、配置は最終行の下の予約分だけ枠の高さを伸ばす（#3132）。
- **横方向は側面を `ChannelLimits` に足し、ガターの基準を枠の内側で測る**: `left` / `right`（枠の側面）を足し、ガターの基準 x を決める `contentBounds` は枠の内側にあるカードだけを数える。4 つのガターのパス（`routeGroupedEdges` / `aggregateGroupTrunks` / `aggregateGroupSourceTrunks` / `distributeGutterLanes`）は同じ `limits` を受け取る。容量は、1 回目の配線で縦の線が枠の側面から `FRAME_SIDE_MARGIN`（12px）より外に出た量を左右それぞれ測り、既存の 2 回目の配置で枠をその分広げる（`gutterReservations`、#3154）。
- **枠の外側の端を測る指標を持つ**: 枠の内側の帯（境界から半ピッチ）から外れる run を数える。実モデルの corpus ではほぼ 0 なので、合成 fixture と組で使う。

## 関連テスト

- `packages/core/src/renderer/routing-parity.test.ts` — `drill-down channels end at the frame (#3132, TPL-3132 / TPL-2598)`。同期と非同期の依存を互いに張った 1 行（4 枚・5 枚）で、全 run が枠の内側に入り枠が広がることと、枠の外の ghost カードが最下段の下のチャネルの境界にならないことを確かめる。修正前のツリーで 3 件が落ちることを確認してから固定した
- `packages/core/src/renderer/routing-parity.test.ts` — `drill-down gutters stay inside the frame (#3154, TPL-3132 / TPL-2598)`。3 行（T / M / B）で各 T が自分の M と全 B を同期・非同期で呼ぶ fixture（4 列・5 列）で、ghost でも循環でもない edge の縦の線がすべて枠の側面から 12px 以上内側にあり、枠が広がることを確かめる。修正前のツリーで 2 件が落ちることを確認してから固定した
- `packages/core/src/renderer/edge-routing-frame-sides.test.ts` — `drill-down gutters are measured inside the frame (#3154, TPL-3132)`。枠の横の ghost カードがガターの基準（`contentBounds`）にならないこと
- `packages/core/src/renderer/edge-routing-lanes.test.ts` — `the enclosing frame bounds the outer channels (#3132)`（#3154 で側面も確かめる）
- `packages/core/src/renderer/layer-layout-logics.test.ts` — `reserves below the last row through the ordinal one past it (#3132)`
