# 同じ行の 2 枚を結ぶエッジを、行の上下の行間チャネルで回す

- **日付**: 2026-10-12
- **ステータス**: 検討中
- **PR**: [#3135](https://github.com/kompiro/karasu/pull/3135)
- **関連**:
  - 引き金 Issue: [#3026](https://github.com/kompiro/karasu/issues/3026)（Umami の `UmamiApp` drill-down で 5 本が間のカードを貫通する）
  - 発見の経緯: [#3022](https://github.com/kompiro/karasu/issues/3022)（edge label disclosure の計測中に見つかった）
  - 関連 ADR: [ADR-968](../adr/968-orthogonal-edge-routing-skip-layer.md)（行間チャネルの直交ルーティング。「同層は対象外」を本設計で広げる）, [ADR-1859](../adr/1859-system-view-p2c-grouped-edge-routing-and-marks.md)（ガター / mixed route、交差は表現で無害化する）, [ADR-2330](../adr/2330-ungrouped-routing-parity.md)（両モードが 1 本の候補列を共有し、計測柵で保証する）, [ADR-2611](../adr/2611-layer-spanning-edge-columns.md)（corridor のチャネル stub と staircase）, [ADR-3088](../adr/3088-channel-lane-order-by-turn.md)（チャネルのレーン順）
  - 関連 TPL: [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md), [TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md), [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md), [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md), [TPL-3026](../test-perspectives/TPL-3026-candidate-chain-covers-every-endpoint-relation.md)（本 PR で起こす）
  - コード: `packages/core/src/renderer/edge-routing-groups.ts`（`routeGroupedEdges`）, `packages/core/src/renderer/layout-edges.ts`（`runRoutingChain`）, `packages/core/src/renderer/edge-routing-channels.ts`

## 背景・課題

drill-down で同じ行に並んだ 2 枚のカードを結ぶエッジが、間に立つカードを直線で突き抜けて描かれる。カードの下に隠れた区間は見えないので、読み手には間のカードに 2 本の短い線が刺さっているように見え、そのカード自身のエッジだと読める。

`runRoutingChain` の候補は「直線（すでに clear なら触らない）→ 行間チャネルの L → corridor → staircase → 側面ガター / mixed」の順で、最初に clear になった候補を採る。ところが各候補は端点の位置関係に前提条件を持ち、**端点が縦に重なる組（同じ行）を受け付ける候補が 1 つも無い**。

| 候補 | 同じ行の組で失敗する理由 |
| --- | --- |
| channel-L（`routeOrthogonalEdges`） | 下向きのエッジだけを扱う |
| corridor（`tryCorridorRoute`） | 2 本の側面 stub が corridor に届くには、間にカードが無いことが要る。塞がれた stub のチャネル迂回は `!forward && !backward` で null |
| staircase（`tryStaircaseRoute`） | 2 行以上離れた組だけ |
| 側面ガター（`planGutterRoute`） | 遠い側の端点の横 stub が間のカードを横切る |
| mixed（`planMixedRoute`） | 冒頭の `!forward && !backward` で null |

どれも clear にならないので、エッジは直線のまま残る（never worse の原則どおりの結果）。

### 計測

routing-parity と同じオプションで、4 つの逆生成モデルの全ビュー（system ビューと全 drill-down 階層、計 1,542 ビュー）を main で測った。貫通は TPL-1927 と同じ `countPolylinePenetrations`（端点以外のカードが対象）。

| モデル | ビュー | 貫通（全体） | うち同じ行の組 | 該当ビュー |
| --- | --- | --- | --- | --- |
| umami | 95 | 5 | 5 | `UmamiApp` |
| dify | 285 | 17 | 3 | `DifyDB`（残り 14 は別類型、[#3133](https://github.com/kompiro/karasu/issues/3133)） |
| twenty | 448 | 3 | 3 | `CoreDB` |
| wordpress | 714 | 8 | 8 | `WordPressApp`（6）, `WpDB`（2） |

`examples/` 全体では同じ行の貫通は 0 件で、routing-parity の柵が green のまま見逃していた（TPL-2598 の「corpus がその形に届いていない」）。

計測スクリプトと結果は `reports/3026-same-row-chord/`（gitignore、ADR-2419）。umami のモデルは `https://karasu-nest.kompiro.dev/g/42963-bg390asxhh4w?format=krs` から取れる。

## 制約・前提

- **貫通 0 が正しさの柵**（TPL-1927、ADR-2330）。交差は hop で無害化する方針で、交差数は pin しない（ADR-1859）。
- **never worse**（AC-1）: 新しい候補は、全体の polyline が clear なときだけ適用する。
- **新しい route 形は overlap 回避パスに参加する**（TPL-1954）: チャネルの run は `distributeChannelLanes`、カード辺のアンカーは `fanOutGutterPorts`、縦 stub の衝突は claim register。
- **ノードを動かしてエッジを通す案は採らない**（ADR-968 却下案 B4）。
- grouped / ungrouped は 1 本の候補列を共有する（ADR-2330）。ただし枠の内側の幾何を見ない候補は ungrouped に限る（corridor / staircase と同じ扱い、実装レビューで変更。「実装の指針」1 を参照）。
- 対象外: ghost / cyclic エッジ（ADR-968 から変わらず）。同じ行ではない貫通（dify の 14 件）。

## 検討した選択肢

### 案1: 側面ガターへ逃がす（Issue の示唆）

Issue は「この密度ではガターしか clear にならないかもしれない」と書いている。しかし素のガター経路は、遠い側の端点に入る横 stub が間のカードを横切るので clear にならない。両端をチャネル stub にしてガターの縦回廊でつなぐ mixed 型にすれば clear にはできる。

**メリット**

- ガターは content の外側で、構成上 clear。

**デメリット**

- 経路が content の端まで出て戻るので長い。行の上下どちらかのチャネルを往復する分に加えて、ガターまでの横走りが 2 本付く。
- 横走りが長いほど、行間を縦に通る他のエッジと多く交差する。
- 隣にある 2 枚の組でも、ガターまで出ることになる（端の行でなければ）。

### 案2: 行のすぐ上か下の行間チャネルで U 字に回す（採用）

片方のカードの上辺（または下辺）から出て、行の上（または下）の行間チャネルを横に走り、もう片方のカードの上辺（または下辺）に入る。

```
  ┌─────────────────────────────┐   ← 行の上のチャネル
  │                             ▼
┌───┐        ┌───┐            ┌───┐
│ A │        │ B │            │ C │
└───┘        └───┘            └───┘
```

ADR-968 の channel-L と同じ「stub → チャネルの run → stub」の形で、端点が同じ行にある場合への拡張にあたる。stub の x は mixed / corridor のチャネル stub と同じ規則（カード中央、claim 済みなら lane pitch ずつ横へ）で決める。この規則を `channelStub` に切り出して 3 者で共有する（TPL-219）。

**メリット**

- 間のカードを回る最短の形。
- run は既存のチャネル run なので、レーン分けと容量予約（ADR-2598）がそのまま効く。アンカーも `fanOutGutterPorts` が上下辺のアタッチとして扱う（TPL-1954）。
- 試作で 4 モデルの同じ行の貫通 19 件がすべて 0 になり、collinear overlap は増えなかった。

**デメリット**

- チャネルを横走りするので、そのチャネルを縦に通るエッジとは交差する。直線のときはカードの下に隠れていた交差が見えるようになる（次の節）。

### 案3: 配置を変えて、結ぶ 2 枚を隣に置く

ADR-968 の却下案 B4 と同じで採らない。加えて、3 枚が互いに依存する行（本設計のテスト fixture）では、どう並べても 1 組は隣にならない。

## 上下どちらのチャネルを使うか

案2 では上下の 2 候補があり、どちらも clear なことが多い。試作で選び方を 5 通り測った。数字は main からの交差数の増分（4 モデルの全ビュー合計、交差は線分の真の交差）。

| 選び方 | umami | dify | twenty | wordpress | 合計 |
| --- | --- | --- | --- | --- | --- |
| 常に上 | +50 | +102 | +92 | +117 | +361 |
| 常に下 | +32 | +4 | +21 | +94 | +151 |
| 時計回り（右向きは上、左向きは下） | +51 | +98 | +76 | +91 | +316 |
| 反時計回り | +36 | +18 | +53 | +113 | +220 |
| その時点の他のエッジとの交差が少ない側、同数なら時計回り | +13 | +22 | +19 | +95 | +149 |
| **同上。ただし数える相手は経路が確定したエッジだけ（採用）** | +13 | +4 | +19 | +95 | **+131** |

- 固定の側は、どれも 4 モデルすべてで最少にはならない。「常に下」は合計で近いが、umami と twenty では交差の少ない側を選ぶ方式の 2 倍以上増える。
- 交差の少ない側を選ぶ方式は、判定の時点で他のエッジがまだ配線途中であるため最適ではない。初版はまだ配線されていない直線（これから回り道に変わる弦）まで数えていて、dify では「常に下」に負けた。数える相手を、waypoint を持つエッジと、すでに clear で動かない直線に絞ると、dify は +22 から +4 に下がり、合計も最少になった（実装レビューで変更）。
- ADR-1859 は「交差数の最小化を追う」案を却下している。本設計は交差数を最小化しない。clear な 2 候補のどちらを採るかを決める基準として交差数を使うだけで、候補を増やしたり経路を最適化したりはしない。柵も従来どおり「全交差に hop が付く」で、交差数は pin しない。
- 同数のときに時計回りにするのは、両方向のエッジがある 2 枚（静かな行での A → C と C → A）を 1 つのループにするため。同じ側に送ると入れ子になり、一方が他方をカードの手前で横切る（試作の初版で umami の 2 組に出た）。

## 現時点の方針

**案2 を採用し、側は「経路が確定した他のエッジとの交差が少ない側、同数なら時計回り」で選ぶ。**

### 実装の指針

1. `routeGroupedEdges` の corridor の後、staircase の前に、端点が縦に重なる組だけを対象とする候補 `trySameRowChannelRoute` を置く。直線が clear な組と ghost / cyclic は従来どおり先に抜ける。
   - **ungrouped（枠の無いキャンバス）に限る。** チャネルの y はカードだけから測るので、grouped では枠の見出しや、両端が属する枠の外に落ちうる。corridor / staircase が ungrouped に限られているのと同じ理由で、grouped の同じ行の組は従来どおり直線のまま残る（never worse）。
   - チャネルの y は、2 枚と縦に重なる全カード（行全体）の縦の範囲から測る。2 枚だけで測ると、間に背の高いカードがあるとき、下側のチャネルがそのカードの縁や内側に落ちる。
   - 2 候補それぞれについて、claim と衝突せず polyline が clear なものだけを残す。両方残ったときだけ、経路が確定した他のエッジ（waypoint を持つもの、clear で動かない直線）との交差を数え、少ない方を適用して claim に登録する。
2. mixed / corridor のチャネル stub 決定を `channelStub` に切り出して共有する。
3. 交差の数え方を `edge-geometry.ts` の `countPolylineCrossings` に置く（真の交差だけを数える。端点の接触と共線の重なりは数えない）。
4. `distributeChannelLanes`: 片側にしか境界の無いチャネル（最上段の上、最下段の下）では、レーンを中心から両側へ広げず、行から離れる向きに積む。中心に置いていたため、同じ行を回る経路が 5 本並ぶとレーンがカードの上端に載り、6 本で内側に入った。2 行の間のチャネルは従来どおり（既存のスナップショットは無変更）。
5. 柵: `routing-parity.test.ts` に、互いに両方向で依存する domain を 1 行に並べた合成 fixture を 3 種足す（3 枚、中央だけ背の高い 3 枚、5 枚）。
   - 前提: 全カードが同じ行にあり、中心どうしの直線はカードを貫通する（`straightCentrePenetrations > 0`）。**修正前のツリーで落ちることを確認してから固定する**（TPL-2598）。
   - 貫通 0、両軸の collinear overlap 0。行を回る経路の折れ点はすべて行の外（5 枚でレーン配置の修正を外すと落ちる）。
   - 3 枚の 2 種で、両端の組の 2 本が行の上と下に分かれてループになる（背の高い方は、行全体で測る修正を外すと落ちる）。
   - 5 枚で、行を回る経路どうしが交差し、hop が付く。
6. AT: `docs/acceptance/3026-same-row-channel-route.md`。自動化できる項目は上の柵へ紐づける。人の目で見る項目は「app で fixture を開き、2 本がループとして読める」だけにする。
7. changeset: `@karasu-tools/core` と `karasu` に patch（描画が変わるバグ修正）。
8. ADR 昇格: 実装のマージ後に `docs/adr/3026-same-row-channel-route.md` として昇格し、本 Design Doc を同じ PR で削除する。ADR-968 の「同層は対象外」には、本 ADR で広げたことを関連欄から辿れるようにする（ADR 本文は書き換えない）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 同じ行の組が間のカードを貫通していたビューだけ、経路が U 字に変わる。4 モデル 1,542 ビューで変わるのは 5 ビュー。容量予約で行間が広がるビューでは、カードの位置もずれる。
- `examples/` とスナップショット: 変化なし（試作で core の全テストが無変更で通った）。
- ドキュメント更新: なし（仕様に route の形は書いていない）。

## 未解決の問い / 決めないこと

- **最下段の下を回るレーンが、drill-down の枠に寄る**: `UmamiApp` の Teams ⇄ Administration は最下段の下を回る。このチャネルは枠の外にある ghost カード（`McpTools`）までを帯として測られ、2 本のレーンが枠の下端（y 762）の内側 3px（y 759）に載り、ラベルが枠線の外にはみ出す。帯の計算から ghost を外す案は twenty の `TwentyServer` に新しい貫通を 8 件出したので本設計では採らない。チャネルの帯が drill-down の枠をまたぐ問題として [#3132](https://github.com/kompiro/karasu/issues/3132) で扱う（mixed route の下向き stub にも同じ形がありうる）。
- **dify の system ビューに残る 14 件**（`Dify` と root の 2 ビューに 7 件ずつ）は、同じ行ではなく、下段の `Gateway` へ向かう長い斜めの直線が複数のカードを横切るもの。候補列が何も clear にできなかったのか、試されなかったのかは本設計では調べない。[#3133](https://github.com/kompiro/karasu/issues/3133) で扱う。
- `UmamiApp` には main の時点で縦の collinear overlap が 2 件ある（両方向の staircase の組。`SessionReplay ⇄ TrackedEntities`, `Sharing ⇄ Teams`）。本設計で数は変わらない。[#3134](https://github.com/kompiro/karasu/issues/3134) で扱う。
