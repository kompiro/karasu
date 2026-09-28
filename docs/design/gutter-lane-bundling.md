# ガターを通るエッジを、共有する端ごとに 1 レーンへ束ねる

- **日付**: 2026-09-28
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2958](https://github.com/kompiro/karasu/issues/2958)
  - 前提 Issue: [#2966](https://github.com/kompiro/karasu/issues/2966)（トランク兄弟が共有する端点が兄弟の本数だけ平行移動される）
  - 関連 ADR: [ADR-2330](../adr/2330-ungrouped-routing-parity.md)（#2364 で ungrouped の集約トランクを却下）、[ADR-1859](../adr/1859-system-view-p2c-grouped-edge-routing-and-marks.md)（P2c: ガター・集約トランク・交差マーク）、[ADR-2631](../adr/2631-trunk-legibility-by-count.md)（本数チップ・帯・fan-out トランク）、[ADR-2598](../adr/2598-edge-routing-channel-capacity.md)（チャネル容量・レーン）、[ADR-1185](../adr/1185-parallel-edge-bundling.md)（束ねても edge identity は保つ）、[ADR-2521](../adr/2521-multi-system-pipeline-convergence.md)（共有ヘルパーに寸法フラグを足さない）
  - 関連 TPL: [TPL-2958](../test-perspectives/TPL-2958-bundle-shared-geometry-survives-later-passes.md)（本設計で起こす proactive TPL）、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)、[TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)、[TPL-2631](../test-perspectives/TPL-2631-decoration-must-not-hide-a-crossing-mark.md)
  - コード: `packages/core/src/renderer/edge-routing-groups.ts`（`distributeGutterLanes` / `assignGutterLanes` / `fanOutGutterPorts`）、`edge-routing-lanes.ts`（`collectChannels`）、`crossing-marks.ts`、`edge-routing.ts`（`ownLabelSegment`）、`layout-geometry.ts`（`normalizeCoordinates`）、`layout-edges.ts`（`runRoutingChain`）
  - spike: `spike/2958-ungrouped-trunk-gate`（環境変数 `KRS_LANE_BUNDLES=1` で試作を有効化）

## 背景・課題

reverse した Dify モデルの `Dify.ApiBackend.Knowledge`（usecase 23 → resource 26、エッジ 155 本）を Group by なしで開くと、左右のガターに虹のような平行線の帯ができ、カードが読めない。

| 計測（main @ 6c9b13b1、ungrouped）                    | 値                                                   |
| ----------------------------------------------------- | ---------------------------------------------------- |
| キャンバス                                            | 4563 × 3768 px。カード列は x 1604〜2819 の約 1200 px |
| ガターの縦レーン（カード列の外にある縦線の x の種類） | 135                                                  |
| 交差                                                  | 8344                                                 |
| 総エッジ長                                            | 620,140 px                                           |

どのエッジも、行き先や出元を他と共有していても、ガターに自分専用のレーンを 1 本取る。レーンを共有できるのは、y の範囲が重ならない場合だけである（`assignGutterLanes` の区間分割）。

束ねる仕組み（fan-in / fan-out トランク）は ADR-1859 / ADR-2631 にすでにある。しかし次の 2 つの理由で、この図には効かない。

1. **Group by 軸があるときしか走らない。** #2364 で ungrouped への適用を計測して却下したためである（ADR-2330）。
2. **2 waypoint の素直なガター経路しか扱わない。** `aggregateGroupTrunks` は `isVerticalGutterRoute`（waypoint 2 個で縦 1 本）だけを候補にし、右ガターの spine へ付け替える。

Knowledge 画面の経路の内訳は次のとおりで、2 は決定的に効く。

| waypoint 数 | 本数 | 経路の形                                                               |
| ----------- | ---- | ---------------------------------------------------------------------- |
| 2           | 33   | 素直なガター経路 / 内部 L                                              |
| 3           | 102  | mixed 経路（塞がれた側の端だけ行間チャネルへ逃がしてからガターへ出る） |
| 17〜32      | 19   | 階段経路（#2611）                                                      |
| 0           | 1    | 直線                                                                   |

usecase が 2 列に並ぶと、左列のカードの右には右列のカードがあるので、横へまっすぐガターへ出られない。そのため大半が mixed 経路になる。

## 現状（インベントリ）

| 観点                 | 現状                                                                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 経路の候補チェーン   | 直線 → 内部 channel-L → 内部 corridor / 階段（ungrouped のみ）→ 左右ガター（素直 / mixed）（`runRoutingChain`）                                                                                                                        |
| 集約トランク         | `aggregateGroupTrunks` / `aggregateGroupSourceTrunks`。`groupBands !== null` のときだけ走る。候補は 2 waypoint のガター経路だけで、右ガターの専用 lane へ付け替える                                                                    |
| ガターのレーン       | `distributeGutterLanes` がトランク以外のガター corridor を区間分割でレーンに割る。1 エッジで 1 区間                                                                                                                                    |
| カード際の接続点     | `fanOutGutterPorts` が同じ辺に付く接続を扇状に広げる。同じ `trunkId` / `outTrunkId` を持つ兄弟は 1 スロットにまとめて一緒に動かす                                                                                                      |
| 行間チャネルのレーン | `collectChannels` / `distributeChannelLanes` が水平 run ごとにレーンを割る。x 範囲が重なる run は必ず別レーンになる                                                                                                                    |
| 合流マーク・ラベル   | `crossing-marks.ts` は `trunkId` の合流点を `waypoints[0]`、`outTrunkId` の分岐点を `waypoints[last]` と決め打ちする。`ownLabelSegment` はラベル区間を 0 番目（fan-in）/ 最後（fan-out）と決め打ちする。どちらも 2 waypoint の形が前提 |
| 座標の正規化         | `normalizeCoordinates` は端点・waypoint をエッジごとに平行移動する。兄弟が同じ Point オブジェクトを共有していると、本数分重ねて動く（#2966。main の grouped Dify で既に発生している）                                                  |

## 制約・前提

- **貫通 0 と、兄弟以外の共線ペア 0 を保つ**（TPL-1927 / TPL-1954、`routing-parity.test.ts`）。
- **edge identity を保つ**（ADR-1185）。束ねるのは描画の合流であり、モデル上の集約（`docs/concepts.ja.md` の「集約」、implicit edge）ではない。エッジは 1 本ずつ残り、ホバー・ラベル・diff 状態は個別に持つ。
- **#2364 で却下したことを再びやらない。** 内部の短い経路を右ガターへ引き戻すことはしない。
- **束ねる対象がないモデルは 1 バイトも変えない。**
- モードごとに別の実装を持たない（ADR-2521、TPL-219）。grouped / ungrouped / multi-system root が同じチェーンを通る。
- out of scope: モデルを畳む密度集約（ハブの減光・boundary 単位の集約）。これは #2728 で扱う。

## 検討した選択肢

### 案A: grouped 限定の条件を外すだけ

`runRoutingChain` の `if (grouped)` を外し、既存の 2 つのトランクパスを ungrouped でも走らせる。

**計測（spike）**: Knowledge 画面で束ねられたのは 155 本中 **2 本**。レーン 135 → 102、交差 8344 → 6095 に下がったが、これは配置のやり直しによる副次効果で、束ねた効果ではない。examples 12 本は変化なし。

**メリット**

- 変更が 1 行。ADR-2631 の装飾がそのまま使える。

**デメリット**

- mixed 経路と階段経路が候補にならないので、困っている図にほとんど効かない。
- 右ガターの spine へ付け替えるという、#2364 で問題になった動きそのものを ungrouped に持ち込む。

### 案B: 共有する端が同じガター corridor を、1 レーンに束ねる（採用候補）

経路の形は変えない。ガターのレーン割り当て（`distributeGutterLanes`）で、**corridor より後ろが完全に同じエッジ**（同じ target、同じ入り方）を 1 本の fan-in 束にする。残りのうち **corridor より前が完全に同じエッジ**（同じ source、同じ出方）を 1 本の fan-out 束にする。束は 1 区間（y 範囲は兄弟の和集合）として 1 レーンを取る。

- 束の判定は「corridor 以降の点列（target 側）/ 以前の点列（source 側）が一致すること」で、経路の形は問わない。素直な経路も mixed 経路も同じ規則で束ねられる。2 waypoint の経路では、既存トランクの形（入口 1 点と spine の共有）と一致する。
- fan-in を先に取る。共有 target のほうが強い主張であることは ADR-2631 と同じ。
- 束の兄弟には `trunkId` / `outTrunkId` を付ける。`fanOutGutterPorts` はこれを 1 スロットとして扱うので、カード際でも入口 / 出口は 1 点のまま動く。
- レーンの x を変えるだけなので、貫通しないことは既存のガターと同じく構成的に保証される（レーンは全コンテンツの外側にある）。
- 追加で 2 か所直す（どちらも spike で実際に壊れた）。
  1. **行間チャネル**: `collectChannels` が、同じ束の兄弟が持つ同一の水平 run に同じレーンを割る。直さないと、共有区間がチャネルで別々のレーンに引き剥がされる。
  2. **正規化**: `normalizeCoordinates` が同じ Point オブジェクトを 1 回だけ動かす。これは #2966 の修正そのもので、直さないと束の入口がカードから外れ、貫通が 33 件出た。

**計測（spike、ungrouped。貫通は 0 のまま）**

| Knowledge 画面 | main        | 案B                                 |
| -------------- | ----------- | ----------------------------------- |
| ガターのレーン | 135         | **48**                              |
| 幅 × 高さ      | 4563 × 3768 | **2930 × 2984**                     |
| 総エッジ長     | 620,140     | 431,347（-30%）                     |
| 交差           | 8344        | 6177（-26%）                        |
| 束ねたエッジ   | 0           | 110 / 155（fan-in 67 + fan-out 43） |

レーンが減って幅が空いたので、配置の幅予算の探索（[ADR-2593](../adr/2593-canvas-space-objective.md) / [ADR-2761](../adr/2761-width-budget-ladder-length.md)）が 2 列ではなく 4 列の配置を選んだ。縦に長い図が正方形に近づいたのは、この効果による。

grouped でも効く（既存トランクのパスが先に走り、残ったガター corridor が束の対象になる）。

| grouped（案B の差分だけ）                | main              | 案B                      |
| ---------------------------------------- | ----------------- | ------------------------ |
| Dify root / team: レーン・交差・長さ     | 14 / 108 / 56,366 | 8 / 89 / 57,804（+2.5%） |
| Dify root / boundary: レーン・交差・長さ | 16 / 109 / 47,475 | 9 / 105 / 47,232         |
| getting-started / team: レーン・交差     | 4 / 3             | 3 / 2                    |

examples 12 本の ungrouped ルートビューは 1 バイトも変わらない（ガター corridor を共有端で持つエッジがない）。

core のテストで落ちたのは、数値を固定した柵の 4 件だけだった（貫通・共線の柵は通る）。

- `layout.test.ts`「sizes the canvas around routed edges (#2513)」: ガターが細くなり、キャンバス幅がコンテナより広いという前提が崩れた
- `routing-parity.test.ts`「getting-started (group by team): 4 crossings」: 3 に減った
- `routing-parity.test.ts` 交差アーチの corridor 柵 2 件（TPL-2598）: corpus で最も狭い corridor が広がり、「corpus が限界に届く」という前提が崩れた

**メリット**

- 困っている形（mixed 経路）に効く。経路の形も側も変えないので、#2364 の引き戻しは構成上起きない。
- grouped でも改善する。1 つの仕組みで全モードに効く（ADR-2521）。
- 既存の語彙（`trunkId` / `outTrunkId`、本数チップ、帯）にそのまま乗る。

**デメリット**

- 合流マークとラベル区間の決め打ち（`waypoints[0]` / 区間 0）を一般化する必要がある。
- 数値を固定した柵を 3 件更新し、飽和フィクスチャを 1 件足す必要がある（TPL-2598）。
- 階段経路（19 本）と内部 corridor は対象外のまま残る。

### 案C: 既存トランクのパスを mixed 経路へ一般化する

`aggregateGroupTrunks` を、mixed 経路も右ガターの spine へ付け替えられるように拡張する。

**メリット**

- ADR-1859 の「右ガターの専用 trunk lane」という形を保つ。

**デメリット**

- 経路の側を右に寄せるので、左ガターを使っていた経路が長くなる。#2364 と同じ種類のコストである。
- 付け替えのたびに clearance を検証し直す必要がある。案B はレーンの x を変えるだけなので、その必要がない。

## 比較

| 観点                       | 案A                   | 案B                                               | 案C                            |
| -------------------------- | --------------------- | ------------------------------------------------- | ------------------------------ |
| Knowledge 画面で束ねた本数 | 2 / 155               | 110 / 155                                         | 未計測（右寄せのぶん長くなる） |
| 経路の形・側を変えるか     | 変える（右 spine へ） | 変えない（レーン x のみ）                         | 変える                         |
| #2364 の却下理由との関係   | 同じ動きを持ち込む    | 構成上起きない                                    | 同じ種類のコスト               |
| 変更量                     | 1 行                  | レーン割り当て + チャネル + 正規化 + 装飾の一般化 | トランクパスの大幅な拡張       |

## 現時点の方針

**案B を採用する。** 困っている図の大半を占める mixed 経路に効き、しかも経路の形も側も変えない唯一の案だからである。貫通しないことは既存のガターレーンと同じ根拠（全コンテンツの外側）で構成的に保証され、grouped でも改善する。

### ADR-2330 との関係

ADR-2330 の「ungrouped で集約トランクを使う」の却下は **refine する（supersede しない）**。却下したのは「右ガターの trunk lane へ経路を付け替えて、内部 corridor で短くなった経路を外へ引き戻すこと」で、この判断は正しいまま残る。案B は経路を付け替えず、すでにガターにある corridor のレーンを共有させるだけなので、却下の根拠に当たらない。ADR 昇格時に、新 ADR の frontmatter へ `refines: [ADR-2330]` を置く。

既存の 2 つのトランクパス（grouped 限定、右ガターへの付け替え）はそのまま残す。ここで統合すると grouped の出力が大きく変わり、評価の軸が 2 つ混ざるためである。統合するかどうかは「未解決の問い」に残す。

### 確定したい細部

1. **束の判定**: fan-in は `(target, corridor の下端 y, corridor 以降の点列)` が一致する corridor。fan-out は `(source, corridor の上端 y, corridor 以前の点列)` が一致する corridor。fan-in を先に取り、どちらにも入らないものは今までどおり 1 本 1 区間。
2. **レーン**: 束は兄弟の y 範囲の和集合で 1 区間になる。区間分割とレーン x の決め方は `assignGutterLanes` と同じ（右は既存トランク lane の外側、左は外へ）。
3. **チャネル**: 同じ束の兄弟が持つ「座標が同一の水平 run」は、1 本の run として 1 レーンを取る。
4. **正規化**: 点オブジェクトごとに 1 回だけ平行移動する（#2966）。
5. **合流マーク**: 合流点を「兄弟が spine に乗る点」に一般化する。fan-in は `waypoints[corridor.i]`、fan-out は `waypoints[corridor.i + 1]` で、2 waypoint の経路では今の `waypoints[0]` / `waypoints[last]` と一致する。数字と帯の規則は ADR-2631 のまま。
6. **ラベル区間**: 「そのエッジだけが持つ区間」を合流点の手前（fan-in）/ 分岐点の先（fan-out）の区間に一般化する。2 waypoint の経路では今の区間 0 / 最後と一致する。author の `label-position` / `label-offset` が勝つのは ADR-2631 と同じ。

### 実装の指針

1. #2966 を先に直す（点オブジェクトごとに 1 回だけ平行移動）。単独でも grouped Dify の矢印がカードへ戻るので、先に出荷できる。
2. `distributeGutterLanes` に束の判定を入れる。fan-in → fan-out → 単独の順に区間を作り、`assignGutterLanes` に渡す。兄弟には `trunkId` / `outTrunkId` を付ける。id は束ごとに一意にする（同じ target に入り方の違う束が 2 つありうる）。
3. `collectChannels` で、同じ束の同一 run を 1 レーンにする。
4. `crossing-marks.ts` の合流点と `ownLabelSegment` を、上の「確定したい細部」5・6 のとおり corridor の位置から求める形にする。
5. 柵を更新する。
   - 数値を固定した 3 件（#2513 のキャンバス幅、getting-started team の交差数、交差アーチ corridor 柵）を新しい値にする。#2513 と交差アーチの柵は「限界に届く入力」を失ったので、値を変えるだけでなく入力を差し替える（TPL-2598）。
   - **飽和フィクスチャを足す**: usecase 2 列 → 共有 resource へ多数のエッジ（Knowledge 画面を縮小した合成モデル）。このフィクスチャについて次を assert する。main のツリーで落ちることも確認する。
     - ガターのレーン数が「束の数 + 単独の数」以下であること
     - 貫通 0、兄弟以外の共線ペア 0
     - 全チェーン後に、兄弟の共有区間が同一座標のまま残っていること（TPL-2958）
6. `pnpm bench:render` で Dify の描画時間が悪化していないことを確認する（束の判定は corridor ごとの点列比較で、O(E)）。
7. AT: `docs/acceptance/2958-gutter-lane-bundling.md`。usecase 2 列 → resource の合成モデルを `index.krs` として app で開き、次を確認する。
   - ガターの束が本数チップと帯付きで 1 本に見える
   - 束の中の 1 本をホバーすると、そのエッジだけが強調される
   - 各エッジのラベルが自分の区間に出る
8. ADR 昇格: 実装完了後に `docs/adr/2958-gutter-lane-bundling.md` として昇格し、本 Design Doc は同じ PR で削除する。新 ADR は `refines: [ADR-2330]` とする。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: ガターに共有端を持つエッジが複数ある図だけ、描画が変わる（束になり、図が縮む）。`.krs` の構文は変えない。
- ドキュメント更新: なし（仕様の変更ではなく描画の変更）。
- テスト・examples への影響: examples の ungrouped ルートビューは不変。grouped の getting-started(team) と、数値を固定した柵 3 件を更新する。

## 未解決の問い / 決めないこと

- **既存トランクパスとの統合。** grouped の `aggregateGroupTrunks` / `aggregateGroupSourceTrunks`（右 spine への付け替え）を案B に置き換えるかどうか。本設計では置き換えない。置き換えると grouped の出力が大きく変わるので、別 Issue で計測する。
- **階段経路と内部 corridor の束ね。** Knowledge 画面で束ねられずに残る 45 本の大半がこれにあたる。これらは内部に claim 済みの列を持つので、レーンの x を動かすだけでは束ねられない。本設計では扱わない。
- **1 本だけのエッジ。** 束ではない単独の corridor はこれまでどおり扱い、描画も変えない。
- **密度集約**（ハブの減光・boundary 単位の集約）は #2728 で扱う。
