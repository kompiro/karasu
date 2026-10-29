---
id: ADR-3309
title: 同じ行の経路が stub の席の取り合いで拒否されたとき、最後の候補で席をカードの幅いっぱいまで広げて試す
status: accepted
date: 2026-10-29
topic: renderer
refines: [ADR-3026]
related_to: [ADR-2330, ADR-2598, ADR-2611, ADR-3133]
scope:
  packages:
    - core
assumptions:
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: StubSeats"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: channelStub"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: trySameRowChannelRoute"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: fanOutGutterPorts"
  - "grep: packages/core/src/renderer/edge-routing-groups.ts :: \"whole-side\""
  - "grep: packages/core/src/renderer/edge-routing-same-row.test.ts :: same-row route when the seats beside each card's centre are taken"
  - "file: docs/test-perspectives/TPL-3026-candidate-chain-covers-every-endpoint-relation.md"
  - "file: docs/acceptance/3309-same-row-whole-side-stubs.md"
---

# ADR-3309: 同じ行の経路が stub の席の取り合いで拒否されたとき、最後の候補で席をカードの幅いっぱいまで広げて試す

- **日付**: 2026-10-29
- **ステータス**: 決定済み
- **関連**:
  - Issue #3309（起点。#3154 の計測中に見つかった）、Design Doc PR #3322、実装 PR #3324
  - [ADR-3026](3026-same-row-channel-route.md)（同じ行の候補。本 ADR はその stub の席の探索範囲を最後の候補でだけ広げる）、[ADR-3133](3133-side-column-last-resort-corridor.md)（最後の候補を置く先例。呼び出し側が引数で範囲を選ぶ形も同じ）、[ADR-2611](2611-layer-spanning-edge-columns.md)（`channelStub` と縦線の claim）、[ADR-2598](2598-edge-routing-channel-capacity.md)（never worse と「上限は明示する」）、[ADR-2330](2330-ungrouped-routing-parity.md)（計測柵で保証する）
  - TPL: [TPL-3026](../test-perspectives/TPL-3026-candidate-chain-covers-every-endpoint-relation.md)（本件の失敗モードと対処パターンを追記した）、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)
  - AT: `docs/acceptance/3309-same-row-whole-side-stubs.md`
  - コード: `packages/core/src/renderer/edge-routing-groups.ts`（`routeGroupedEdges` の最後の候補、`trySameRowChannelRoute`、`channelStub` / `StubSeats`）

## 背景

逆生成した Twenty モデルの `Twenty.TwentyServer` ドリルダウンで、同じ行の `ConnectedAccounts → Calendar`（sync）が、間の `Messaging` を貫通する直線のまま残っていた。同じ組の async エッジは行の下を U 字に回れていた。

Issue は「同じ行の候補が上下とも塞がれたら、ガター経路や列の corridor へ fallback する」ことを示唆していた。調べると、上下とも塞がれていたのは経路ではなく **stub の席**だった。

- 同じ行の候補（ADR-3026）は、上下それぞれで polyline を組み、(a) 経路の縦線（stub）が claim 済みの縦線とぶつからないこと、(b) polyline がカードを横切らないこと、を確かめる。
- `channelStub` は stub の x を、カードの中央、その左右 1 レーン（24px）、左右 2 レーンの 5 か所から、中央に近い順に選ぶ。5 か所とも claim 済みなら、中央に置いたまま返す。
- `TwentyServer` は 1 つのカードに多くのエッジが集まる。上側では `ConnectedAccounts` の 5 か所、下側では `Calendar` の 5 か所が、同じ行間チャネルへ降りる他の経路の縦線で埋まっていた。stub が中央（claim 済み）に残り、(a) で上下とも拒否された。polyline 自体は上下とも clear だった。

ほかの候補は同じ行の組に効かない（ADR-3026 の表）。ガター経路は遠い側の横 stub が間のカードを横切り、mixed route は端点が縦に重なると成立せず、staircase は 2 行以上離れた組だけ、ADR-3133 の最後の候補は端点の間の縦の範囲が空なので対象外になる。そのため never worse で直線のまま残った。

#3308 で枠の内側を基準にした結果、このビューの幅の予算が 1 行 3 枚に変わり、`Messaging` が 2 枚の間に入った。stub の席の上限は #3308 より前からある。

## 決定

**ガターも mixed route も成立しなかった、ungrouped の同じ行の組に限り、stub の席をカードの幅いっぱいまで探して、同じ行の候補をもう一度試す。**

1. **席の範囲は呼び出し側が選ぶ**: `channelStub` は `StubSeats`（`near-centre` / `whole-side`）を引数で受ける。既定は `near-centre` で、従来と同じ 5 か所を同じ順で試す。`whole-side` は同じ順（中央、左右に 1 レーンずつ外へ）で、カードの幅いっぱいまで続ける。どちらも、空きが無ければ中央を返し、呼び出し側が拒否する。席の規則は 1 つの関数に残る（TPL-219）。
2. **`trySameRowChannelRoute` は `seats` を受け、両端の `channelStub` に渡す。** 既定は `near-centre`。
3. **位置**: `routeGroupedEdges` の最後の候補（`if (!pick)` の中、エッジを直線のまま残す直前）。ungrouped で端点が縦に重なる組なら、`whole-side` で同じ行の候補を試す。縦に重ならない組は従来どおり ADR-3133 の空き列を試す。
4. **ほかの呼び出しはすべて `near-centre` のまま。** mixed route の端、corridor の端、最初に試す同じ行の候補は、席の範囲も順も変わらない。

## 理由

- **原因は候補の欠落ではなく、ある候補の資源の探索範囲だった。** 位置関係の表の上では候補があるので、新しい候補の形は要らない。範囲を広げれば既存の U 字のまま成立し、レーン分け・容量予約・ポートの配り直しがそのまま効く（TPL-1954）。
- **最後に置くので、候補の選択が変わるのは直線のまま残っていたエッジだけになる。** 4 つの逆生成モデル（umami / dify / twenty / wordpress、4,626 ビュー × グルーピング none / team / boundary）で、変わるのは `Twenty.TwentyServer` の 1 ビュー × 3 グルーピングだけだった。このビューの子には team も boundary も無いので、3 つとも枠の無いキャンバスになる。貫通は 4 → 1、交差は 592,701 → 592,320（−381）、collinear overlap は縦横とも 0 のまま、`examples/en` は変化なし。
- **ただし同じビューのほかのエッジの座標は変わりうる。** U 字の経路が 1 本増えると行間の予約が変わり、2 回目の配置でカードが動く。`TwentyServer` では 284 本中 254 本の座標が動き、キャンバスは 2608×2233 → 2584×2247 になった。「動かさない」のは候補の選択であって、最終座標ではない。
- **中央から離れた席の多くは、後で配り直される。** 同じ辺にほかのポートもあれば、`fanOutGutterPorts` が辺の全体（attachable span）に配り直すので、描かれる位置は同じ辺の他のポートと並ぶ。辺にこのポートだけなら `fanOutGutterPorts` は手を出さず（2 本以上の辺だけを配り直す）、席はそのまま残る。そのときは `seatPortsOnOutline` が外形へ寄せるだけになる。この区別は実装 PR のレビューで見つかり、コメントと TPL-3026 に反映した。

### 柵

- `edge-routing-same-row.test.ts`「same-row route when the seats beside each card's centre are taken (#3309)」: 手で置いたカードで、両端のカードの 5 か所を、行の上下とも他の経路の縦線（どのカードにも属さない中間の線分）が使っているとき、外側の席で回り、stub は自分のカードの上にあること。最後の候補を外すと落ちる。もう 1 本は、中央だけが使われているとき、従来どおり中央の左 1 レーンを使うこと（席の順を固定する）。
- **席の範囲そのもの（ほかの呼び出しが 5 か所に留まること）はテストで固定していない。** `whole-side` も同じ 5 か所から始まるので、空いた近い席がある限り両方の結果は一致する。全呼び出しを `whole-side` にしても routing のテストは全部通る（実装 PR のレビューで確かめた）。固定するには `channelStub` を export する（knip がテスト専用の export を拒む）か、前の候補が遠い席でだけ成立する fixture が要る。範囲は呼び出し 1 か所のリテラルで決まり、影響は上の計測（変わるのは 1 ビューだけ）で確かめた。

### 既知の限界

席がカードの幅いっぱいまで埋まった組は、本件の後もなお直線のまま残る（ADR-2598 の「上限は明示する」）。TPL-3026 の失敗モードにも同じ限界を書いた。grouped キャンバスの同じ行の組（wordpress の `WordPressApp` の boundary グルーピングの `Database → Taxonomy` で 1 件）は、同じ行の候補自体が使われないので対象外のまま残る（ADR-3026 決定 2）。

## 却下した案

### `channelStub` の席を、全経路でカードの幅いっぱいまで広げる

規則が 1 つのまま上限が無くなる。ただし mixed route と corridor も同じ関数を使うので、今は後ろの候補（ガターなど）で成立しているエッジが前の候補で成立するようになり、経路が変わる。4 モデルで 180 ビュー・18,267 本が変わり、交差は 592,701 → 609,644（+16,943）になった。貫通は同じく 4 → 1 で、得るものが同じなので採らなかった。

### Issue の示唆どおり、ガター経路や列の corridor へ fallback する

既存のガター経路は、遠い側の横 stub が間のカードを横切るので成立しない（ADR-3026 が却下した理由と同じ）。両端をチャネル stub にしてガターでつなぐ新しい形を作っても、stub はこのカードの上下の辺から出るので、同じ席の取り合いで拒否される。列の corridor は、端点の間の縦の範囲が空なので定義できない（ADR-3133 決定 5）。

### 同じ行の候補の中で、5 か所で上下とも拒否されたらすぐ席を広げて再試行する

変更が同じ行の候補の中で閉じる。ただし同じ行の候補はガターと mixed route より前に試されるので、この位置で再試行すると、後ろの候補で成立していたはずの組も U 字に変わりうる。同じ行で間にカードがある組では後ろの候補は成立しないので、corpus では採用案と同じ結果だった。ただし「直線のまま残るエッジだけが変わる」ことが候補の並びに頼った偶然になるので、最後の候補に置いた。

## 影響

- 既存ユーザー: Group by を使っていないキャンバスで、同じ行の組が間のカードを貫通していたビューだけ、その組の経路が U 字に変わる。同じビューの他のエッジは、2 回目の配置で座標が変わりうる。それ以外のビューは変わらない。`.krs` の構文は変えない。
- stub の席の配り方そのもの（`fanOutGutterPorts` の配り直しを含む）を見直すなら、全経路で席を広げる案と合わせて別に扱う。
- grouped キャンバスの同じ行の組は、#3132 / #3154 で枠の内側の境界ができたので、同じ行の候補を grouped で使えるかは別 Issue で検討する。
