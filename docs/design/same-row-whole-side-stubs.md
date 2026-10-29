# 同じ行の経路が stub の席の取り合いで拒否されたとき、最後の候補で席を広げて試す

- **日付**: 2026-10-22
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3309](https://github.com/kompiro/karasu/issues/3309)（#3154 の計測中に発見）
  - 関連 ADR: [ADR-3026](../adr/3026-same-row-channel-route.md)（同じ行の候補）、[ADR-3133](../adr/3133-side-column-last-resort-corridor.md)（最後の候補を置く先例）、[ADR-2611](../adr/2611-layer-spanning-edge-columns.md)（`channelStub` と claim）、[ADR-2598](../adr/2598-edge-routing-channel-capacity.md)（never worse と「上限は明示する」）
  - 関連 TPL: [TPL-3026](../test-perspectives/TPL-3026-candidate-chain-covers-every-endpoint-relation.md)（実装 PR で失敗モードを 1 つ足す）、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)
  - コード: `packages/core/src/renderer/edge-routing-groups.ts`（`routeGroupedEdges`、`trySameRowChannelRoute`、`channelStub`）

## 背景・課題

逆生成した Twenty モデルの `Twenty.TwentyServer` ドリルダウンで、同じ行の `ConnectedAccounts → Calendar`（sync）が、間の `Messaging` を貫通する直線のまま残る。同じ組の async エッジは行の下を U 字に回れている。

Issue は「同じ行の候補が上下とも塞がれたら、ガター経路や列の corridor へ fallback する」ことを示唆している。調べると、上下とも塞がれていたのは経路ではなく **stub の席**だった。

- 同じ行の候補（ADR-3026）は、上下それぞれで polyline を組み、(a) 経路の縦線（stub）が claim 済みの縦線とぶつからないこと、(b) polyline がカードを横切らないこと、を確かめる。
- `channelStub` は stub の x を、カードの中央、その左右 1 レーン（24px）、左右 2 レーンの 5 か所から、中央に近い順に選ぶ。5 か所とも claim 済みなら、中央に置いたまま返す。
- `TwentyServer` は 1 つのカードに多くのエッジが集まる。上側では `ConnectedAccounts` の 5 か所、下側では `Calendar` の 5 か所が、同じ行間チャネルへ降りる他の経路の縦線で埋まっていた。stub が中央（claim 済み）に残り、(a) で上下とも拒否された。polyline 自体は上下とも clear だった。

ほかの候補は同じ行の組に効かない（ADR-3026 の表）。ガター経路は遠い側の横 stub が間のカードを横切り、mixed route は端点が縦に重なると null、staircase は 2 行以上離れた組だけ、#3133 の最後の候補は端点の間の縦の範囲が空なので対象外。そのため never worse で直線のまま残った。

#3308 で枠の内側を基準にした結果、このビューの幅の予算が 1 行 3 枚に変わり、`Messaging` が 2 枚の間に入った。stub の席の上限は #3308 より前からある。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| stub の席 | `channelStub`: 中央 ±0 / ±24 / ±48 の 5 か所。すべて claim 済みなら中央（claim 済み）のまま返し、呼び出し側が拒否する |
| 席を使う経路 | mixed route の端（`mixedEnd`）、corridor の端、同じ行の候補。1 つの規則を共有する（TPL-219） |
| 席のその後 | `fanOutGutterPorts` が、同じ辺に付く経路のポートを辺の全体（attachable span）に配り直す。routing 中に決めた x は仮の席で、描かれる位置ではない |
| claim | 縦線は、端が入る行間チャネルの帯の全体まで伸ばして claim する（#2611）。混んだチャネルでは同じ x を多くの経路が取り合う |

## 制約・前提

- **今 clear な経路は動かさない**（ADR-3133 と同じ方針）。候補の選択を変えるのは、どの候補も成立せずに直線のまま残っていたエッジだけにしたい。ここで言う「動かさない」は候補の選択のことで、最終座標ではない。U 字の経路が 1 本増えると行間の予約が変わり、2 回目の配置で同じビューの他のエッジの座標も変わりうる
- 同じ行の候補は ungrouped に限る（ADR-3026 決定 2）。grouped キャンバスの同じ行の組は本件の対象外
- 席の規則は 1 つの関数で持つ（TPL-219）

## 検討した選択肢

### 案A: `channelStub` の席を、全経路でカードの幅いっぱいまで広げる

**メリット**

- 規則が 1 つのまま、上限が無くなる

**デメリット**

- mixed route と corridor も同じ関数を使うので、今は後ろの候補（ガターなど）で成立しているエッジが、前の候補で成立するようになり経路が変わる。4 つの逆生成モデル（4,626 ビュー × グルーピング）で **180 ビュー・18,267 本**が変わり、交差は 592,701 → 609,644（+16,943）。貫通は twenty の 3 件が消えるだけ

### 案B: Issue の示唆どおり、ガター経路や列の corridor へ fallback する

**デメリット**

- 既存のガター経路は、遠い側の横 stub が間のカードを横切るので成立しない（ADR-3026 が却下した理由と同じ）。両端をチャネル stub にしてガターでつなぐ新しい形を作っても、stub はこのカードの上下の辺から出るので、同じ席の取り合いで拒否される
- 列の corridor は、端点の間の縦の範囲が空なので定義できない（ADR-3133 決定 5）

### 案C: 同じ行の候補の中で、5 か所で上下とも拒否されたら、すぐ席を広げて再試行する

**メリット**

- 変更が同じ行の候補の中で閉じる

**デメリット**

- 同じ行の候補は、ガターと mixed route より前に試される。この位置で再試行すると、後ろの候補で成立していたはずの組も U 字に変わりうる。同じ行で間にカードがある組では後ろの候補は成立しないので、corpus では案 D と同じ結果だった。ただし「直線のまま残るエッジだけが変わる」ことは、候補の並びに頼った偶然になる

### 案D: 最後の候補として、席をカードの幅いっぱいにして同じ行の候補をもう一度試す（採用）

ガターも mixed route も成立しなかったエッジだけに、`routeGroupedEdges` の最後（#3133 の最後の候補の隣）で、`channelStub` の席を `whole-side`（中央から外側へ、カードの幅いっぱいまでのレーン）にして同じ行の候補を試す。`channelStub` は `StubSeats`（`near-centre` / `whole-side`）を引数で受け、既定は今と同じ `near-centre`。

**メリット**

- 届くのは、ほかのどの候補も成立しなかったエッジだけなので、今 clear な経路の候補の選択は変わらない（ADR-3133 と同じ形）。座標が変わりうるのは、そのエッジを含むビューだけ
- 経路の形は既存の U 字のままで、レーン分け・容量予約・ポートの配り直しがそのまま効く（TPL-1954）
- 席の規則は 1 つの関数に残り、広げるかどうかだけを呼び出し側が選ぶ（ADR-3133 の `ChannelBasis` と同じ形）

**デメリット**

- 中央から離れた席の stub ができる。ただし `fanOutGutterPorts` が辺の全体に配り直すので、描かれる位置は同じ辺の他のポートと並ぶ

## 比較

逆生成 4 モデル（umami / dify / twenty / wordpress、4,626 ビュー × グルーピング none / team / boundary）。`main` は bb6da78c。

| 観点 | 案A | 案D |
| --- | --- | --- |
| 貫通 | 4 → 1 | 4 → 1 |
| 変わるビュー / 本数 | 180 / 18,267 | 3 / 762（`Twenty.TwentyServer` の 1 ビュー × 3 グルーピング。このビューの子には team も boundary も無く、3 つとも枠の無い ungrouped のキャンバスになる） |
| 交差 | +16,943 | −381 |
| collinear overlap（縦 / 横） | 0 / 0 | 0 / 0 |
| `examples/en` | （未計測） | 変化なし |

案D で変わる 762 本は、`TwentyServer` で U 字の経路が 1 本増えて行間の予約が変わり、2 回目の配置でカードが動いたことによる（キャンバスは 2608×2233 → 2584×2247）。

残る 1 件は wordpress の `WordPressApp` の boundary グルーピング（`Database → Taxonomy`）で、grouped キャンバスなので同じ行の候補自体が使われない（ADR-3026 決定 2）。

## 現時点の方針

**案D を採用する。** 原因は候補の欠落ではなく、ある候補の資源（stub の席）の探索範囲である。範囲を広げる場所を最後の候補に置けば、変わるのは直線のまま残っていたエッジのビューだけになる。

### 実装の指針

1. `channelStub` に `seats: StubSeats = "near-centre"` を足す。`near-centre` は今と同じ 5 か所を同じ順で試す。`whole-side` は同じ順で、カードの幅いっぱいまで続ける。どちらも、空きが無ければ中央を返す（呼び出し側が拒否する）
2. `trySameRowChannelRoute` に `seats` を足し、両端の `channelStub` に渡す
3. `routeGroupedEdges` の最後の候補（`if (!pick)` の中）で、ungrouped かつ端点が縦に重なる組なら、`whole-side` で同じ行の候補を試す。縦に重ならない組は従来どおり #3133 の空き列
4. テスト（`edge-routing-same-row.test.ts`、手で置いたカード）
   - 両端のカードの 5 か所を、行の上下とも他の経路の縦線（どのカードにも属さない中間の線分）が使っているとき、外側の席で回り、stub は自分のカードの上にあること。最後の候補を外すと落ちることを確かめる
   - 中央付近に空いた席があれば、従来どおりその席を使うこと
5. TPL-3026: 失敗モード「候補はあるのに、資源の取り合いで拒否される」と、対処パターン「最後の候補で探索範囲だけを広げる」を足す
6. AT: `docs/acceptance/3309-same-row-whole-side-stubs.md`。すべて自動テストで判定できる
7. ADR 昇格: 実装のマージ後、`docs/adr/3309-same-row-whole-side-stubs.md` として昇格し、本 Design Doc を削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 枠の無いキャンバスで、同じ行の組が間のカードを貫通していたビューだけ、その組の経路が U 字に変わる。同じビューの他のエッジは、2 回目の配置で座標が変わりうる
- ドキュメント更新: TPL-3026
- テスト・examples への影響: 既存のスナップショット・routing fence は変わらない

## 未解決の問い / 決めないこと

- **grouped キャンバスの同じ行の組**（wordpress の boundary グルーピングで 1 件）は扱わない。同じ行の候補を grouped で使うには、チャネルを枠の内側で測る必要がある（ADR-3026 の却下案）。#3132 / #3154 で枠の内側の境界ができたので、別 Issue で検討する
- **全経路の席を広げる**（案A）のは、交差が増えビューが広く動くので採らない。stub の席の配り方そのものを見直すなら、`fanOutGutterPorts` の配り直しと合わせて別に扱う
- それでも成立しない組（席がカードの幅いっぱいまで埋まる）は直線のまま残る。ADR-2598 の「上限は明示する」に従い、ADR 昇格時に既知の限界として ADR-3309 に書き、TPL-3026 の失敗モードにも添える
