---
id: ADR-3132
title: ドリルダウンの最上段の上と最下段の下のチャネルを、枠の内側で測る
status: accepted
date: 2026-10-17
topic: renderer
refines: [ADR-2598, ADR-3026]
related_to: [ADR-968, ADR-3133]
scope:
  packages:
    - core
assumptions:
  - "symbol: packages/core/src/renderer/edge-routing-lanes.ts :: ChannelLimits"
  - "symbol: packages/core/src/renderer/edge-routing-lanes.ts :: channelLimitsOf"
  - "symbol: packages/core/src/renderer/edge-routing-lanes.ts :: NO_CHANNEL_LIMITS"
  - "symbol: packages/core/src/renderer/edge-routing-lanes.ts :: collectChannels"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: channelBelow"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: channelAbove"
  - "symbol: packages/core/src/renderer/layout-reservations.ts :: channelReservations"
  - "grep: packages/core/src/renderer/layout-edges.ts :: enclosure: Rect \\| undefined"
  - "grep: packages/core/src/renderer/routing-parity.test.ts :: drill-down channels end at the frame"
  - "file: docs/test-perspectives/TPL-3132-resource-inside-a-frame-measured-against-the-frame.md"
---

# ADR-3132: ドリルダウンの最上段の上と最下段の下のチャネルを、枠の内側で測る

- **日付**: 2026-10-17
- **ステータス**: 決定済み
- **関連**:
  - Issue #3132（#3026 の試作中に発見。Issue のコメントで、片側が開いたチャネルも同じ種類だと追記）、design PR #3151、実装 PR #3156
  - [ADR-2598](2598-edge-routing-channel-capacity.md)（チャネルのレーンと 2 パスの予約。本 ADR は予約先に行 0 の上と最終行の下を足す）、[ADR-3026](3026-same-row-channel-route.md)（同じ行を回る経路と、片側が開いたチャネルの積み方。本 ADR はその積み方を枠の無いビューに限る。ghost カードを帯から外す案の却下もここ）、[ADR-968](968-orthogonal-edge-routing-skip-layer.md)（行間チャネルを使う経路）、[ADR-3133](3133-side-column-last-resort-corridor.md)（同じ `channelBelow` / `channelAbove` を使う）
  - TPL: [TPL-3132](../test-perspectives/TPL-3132-resource-inside-a-frame-measured-against-the-frame.md)（本件で起こした retrospective TPL）、[TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-3026](../test-perspectives/TPL-3026-candidate-chain-covers-every-endpoint-relation.md)
  - AT: `docs/acceptance/3132-frame-bounded-channels.md`
  - コード: `packages/core/src/renderer/edge-routing-lanes.ts`（`ChannelLimits` / `channelLimitsOf` / `collectChannels` / `distributeChannelLanes`）、`edge-routing-groups.ts`（`channelBelow` / `channelAbove`）、`layout-edges.ts`（`runRoutingChain` の `enclosure`）、`layout.ts`（`channelReservations`）、`layer-layout-logics.ts`（`placeNodesInLayers`）

## 背景

ドリルダウンのビューでは、表示中のコンテナ（例: `UmamiApp`）が 1 つの枠になってカードを囲む。最上段の上と最下段の下にある行間チャネルは、この枠を見ずに測られていた。そのため、レーンが枠の線に載るか、枠の外に出た。

- **最下段の下に ghost カードがある場合（Issue 本文）**: Umami の `UmamiApp` では最下段が y 642 で終わり、枠の下端が y 762、枠の外の ghost カード `McpTools` が y 822 から始まる。チャネルは最下段と `McpTools` の間として測られ、中心が約 732 になる。2 本のレーンは y 745 と 759 に置かれ、759 の run のラベルは y 768（枠の外）に描かれた。
- **片側が開いている場合（Issue のコメント）**: 最上段の上・最下段の下に何も無いと、チャネルは片側が開いたものとして扱われ、レーンは行から離れる向きに 14px ずつ積まれる（ADR-3026 決定 6）。枠は障害物ではないので、本数が増えると枠を越える。`UmamiApp` の最上段の上では 7 本目から枠の外に出た。

同期と非同期の依存を互いに張った 5 枚の 1 行（`S/App` のドリルダウン）で測ると、main では run が枠の上端（y 84）を越えて y 40 まで、下端（y 340）を越えて y 414 まで伸び、枠の内側の帯からはみ出す run が 14 本あった。

チャネルを測る場所は 3 つあり、どれも枠を見ていなかった。

| 場所 | 何を決めるか | 境界の取り方（変更前） |
| --- | --- | --- |
| `channelBelow` / `channelAbove`（`edge-routing-groups.ts`） | mixed 経路・corridor 経路・同じ行を回る経路が、カードの上下からチャネルへ出るときの y | 隣の行で最も近いカードとの中点。無ければカードから `GUTTER_GAP`（28px）。ghost カードも数える |
| `collectChannels` の帯（`edge-routing-lanes.ts`） | run をどのチャネルに入れるか（キー）、レーンの中心 | カードと group 枠の上下で最も近いもの。ドリルダウンの枠は全 run を囲むので、障害物としては何も区切らない |
| `channelReservations`（`layout.ts`） | 2 パス目で広げる行間 | 両側が閉じたチャネルだけ。片側が開いたもの、行 0 の上は対象外 |

## 決定

**ドリルダウンの枠の内側にある 2 本の線（タイトル帯の下端と枠の下端）を、カードと同じくチャネルの境界として扱い、router・レーン・予約の 3 か所で同じ値を使う。**

1. **境界の値**: `ChannelLimits`（`ceiling` = 枠の y + `CONTAINER_LABEL_HEIGHT`、`floor` = 枠の下端）を `channelLimitsOf(frame)` で作る。枠が無ければ両方とも無限大（`NO_CHANNEL_LIMITS`）で、変更前と同じ挙動になる。
2. **router**: `channelBelow` / `channelAbove` は、隣の行で最も近いカードと枠の線のうち近いほうとの中点を返す。最下段の下に枠の外の ghost カードがあっても、枠の下端が先に来る。mixed / corridor / 同じ行の経路は `limits` を引き回す。
3. **レーン**: `collectChannels` / `distributeChannelLanes` は `limits` を必須の引数で受け取り、2 本の線を高さ 0 の障害物として帯の計算に入れる。枠の中では最上段の上・最下段の下のチャネルも両側が閉じるので、レーンは帯の中心に `LANE_PITCH` で並ぶ。**ADR-3026 決定 6（行から離れる向きに積む）は、枠の無いビューの片側が開いたチャネルだけに残る。**
4. **呼び出し元が枠を答える**: `runRoutingChain` の `opts` に `enclosure: Rect | undefined` を必須の項目として足す（TPL-219）。単一 system の `layoutInner` は表示中のコンテナの枠を渡す。複数 system の root（予約の仕組みが無い、ADR-2598 決定 4）と deploy ビューは `undefined` を渡す。
5. **予約**: `channelReservations` は同じ枠でチャネルを測る。**ADR-2598 決定 3 の予約先に、最終行の下と行 0 の上を足す。**
   - 帯が `floor` で閉じたチャネルは、最終行の下の gap（行序数 `rows.length`）を広げる。`placeNodesInLayers` はその予約を `childMaxHeight` に足すので、カードは動かず枠だけが伸びる。
   - 行 0 の上は、**帯がタイトル帯の下端から行 0 の上端そのものまで続くときだけ**広げる。帯は x を見ないので、枠の脇の ghost カードが行 0 の上の帯を閉じることがある。その ghost カードは枠を基準に置かれ、行 0 を下げても帯は広がらず、2 回目の配置が無駄になるだけだからである（実装 PR のレビュー中に足した条件）。

## 理由

- **1 つの規則で Issue 本文とコメントの両方が直る。** 枠を「何も区切らない障害物」ではなく「内側に 2 本の線を持つもの」として測れば、枠の外の物（ghost カード）や何も無い空間でチャネルの幅が決まることが無くなる。
- **境界が決まれば、行間チャネルの仕組みがそのまま使える。** 帯が枠の中で閉じるので、中心に並べる・足りなければ予約する、という ADR-2598 の扱いを新しい配置規則なしで適用できる。
- **3 か所が同じ値を使う。** router が置く y、レーンの中心、予約の量を別々の境界で測ると、また食い違う（TPL-219）。`enclosure` を必須にしたので、新しい呼び出し元も枠の有無を答えないとコンパイルが通らない。
- **変わるビューが少ない。** 4 つの逆生成モデル（umami / dify / twenty / wordpress、1,542 ビュー、7,659 本）で、経路が変わるのは 3 ビューの 5 本。貫通（14、dify の root view の既存分）、共線（垂直 5 / 水平 0）、交差（196,175）、キャンバスの大きさは変わらない。枠の内側の帯から外れる run は 1 → 0。
- **飽和させる入力で効く。** 実モデルには外側チャネルを混雑させるものが無いので、TPL-2598 に従い合成フィクスチャで測った。1 行の N 枚で、main の帯の外の run は N = 4 で 4 本、N = 5 で 14 本。変更後はどちらも 0 で、枠は 2 回目の配置で上下に伸び（N = 5 で 70〜446）、レーンは 14px 間隔のまま枠の中に収まる。N = 3 は配置 1 回のまま変わらない。

### 柵

- `routing-parity.test.ts`「drill-down channels end at the frame」: 1 行の 4 枚・5 枚のフィクスチャで、予約の無い配置の余白に収まらないこと（限界に届いていること）、全 run が枠の内側の帯に入り配置が 2 回走ること、貫通 0・両軸の共線 0。枠の下に ghost カードを置くフィクスチャで、最下段の下の run が行と枠の下端の中点に置かれること。system ビューの開いたチャネルは従来どおり行から離れる向きに積むこと。main で 3 件落ちることを確かめてから固定した。
- `edge-routing-lanes.test.ts`: 枠の線が帯を閉じること、枠の無いときは従来の積み方のまま。`layer-layout-logics.test.ts`: 最終行の下の予約がカードを動かさずに枠を伸ばすこと。

## 却下した案

### 今の位置を保ち、枠を越える分だけ押し戻す

router の y と ADR-3026 の積み方は変えず、レーンが枠の線に近づいたときだけ行の側へずらすか間隔を詰める。枠を越えないビューは変わらないが、同じチャネルに 2 つの規則（積む／押し戻す）ができ、どちらが効いたかが位置から読めない。押し戻す場所が無いとき（本数が帯を超えたとき）は結局予約が要り、その判定には採用案と同じ境界が必要になる。変化を抑える利点も、採用案で動くのがコーパスで 5 本だけなので小さい。

### ghost カードを帯の計算から外す

ADR-3026 で試して却下した。帯から外しても router の `channelBelow` が ghost を数えるので umami の run は動かない。router からも外すと、twenty の `TwentyServer` で貫通が 8 件増えた。開いたチャネルの件（Issue のコメント）はそもそも直らない。

### 予約せず、枠の内側の帯にレーンを詰める

ADR-2598 の「予約の無い経路では帯に圧縮する」を枠の中にも使う形。間隔が 14px を割ると線とラベルが重なって読めなくなる。ADR-2598 が「ピッチと予約は組でしか機能しない」として却下した形と同じなので採らない。

## 影響

- 既存ユーザー: ドリルダウンで最上段の上・最下段の下を通る経路の y が、行と枠の中点へ変わる（最上段の上の 1 本は y 152 から 140、最下段の下の 1 本は 710 から 722 など）。外側チャネルが混雑するビューは枠が伸びる。`.krs` の構文は変えない。
- 枠の無いビュー（system ビュー、複数 system の root、deploy ビュー）は変わらない。

## 残る限界

- **横方向の同じ欠陥**: ガターのレーンは `maxRight + GUTTER_GAP + レーン × 24` で外へ伸び、枠の左右の余白（40px）を見ない。枠の幅は配線の前に決まるので、直すには横方向の予約が要る。同じ「枠の内側で測る」規則だが仕組みが別なので #3154 に分けた。
- **ラベルの衝突回避が枠の線を見ない**: `UmamiApp` の `Administration -> Teams` のラベルは、他のラベルを避けて run から 35px 下に押され、枠の下端の線に載る。run の位置は直っているので、ラベル配置の障害物に枠の線を加える件として #3155 に分けた。
- **group 枠の内側**: 同じ行を回る経路は ungrouped に限ったまま（ADR-3026 決定 2）。group 枠の内側のチャネルを枠で測る件は、その制限を外すときに扱う。
- **複数 system の root の system 枠**: 行序数が無く予約できない（ADR-2598 決定 4）。境界だけ足すと詰める以外の手が無いので、`enclosure` は渡していない。
