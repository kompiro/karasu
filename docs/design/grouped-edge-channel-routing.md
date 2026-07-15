# Grouped edge の mixed 帯間チャネル routing — 貫通ゼロと overlap ゼロを同時に達成する

- **日付**: 2026-07-15
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1954](https://github.com/kompiro/karasu/issues/1954)
  - PR: [#1963](https://github.com/kompiro/karasu/pull/1963)
  - 親 Issue: [#1859](https://github.com/kompiro/karasu/issues/1859)（P2c）· epic [#1817](https://github.com/kompiro/karasu/issues/1817)
  - 関連 ADR: [ADR-20260429-01](../adr/20260429-01-orthogonal-edge-routing-skip-layer.md)（ungrouped skip-layer routing の帯間チャネル）· [ADR-20260428-10](../adr/20260428-10-auto-layout-actor-row-by-target.md)（actor-row 配置 / #966）
  - 関連 Design Doc: `docs/design/system-view-grouping.md` § P2c-A
  - 関連 TPL: [TPL-20260711-02](../test-perspectives/TPL-20260711-02-routing-measures-crossings-and-penetrations.md)（交差＋貫通の二重計測）· [TPL-20260623-04](../test-perspectives/TPL-20260623-04-tier-split-no-edge-penetration.md)
  - コード: `packages/core/src/renderer/edge-routing-groups.ts`

## 背景・課題

Group by → Team の system view で、**一部の grouped edge がノードカードを直線で貫通する**。線が接続していないノードを突き抜けて見え、P2c-A（#1859）が掲げた「貫通ゼロ」と TPL-20260711-02 の二重計測柵に反する。

`examples/en/getting-started/index.krs`（single system `ECPlatform`）を Group by → Team でレイアウトし、確定ジオメトリに対して貫通を計測すると:

```
node/frame penetrations: 3（2 edges）
  ECommerce -> OrderEvents   pen=2  wps=0   (直線のまま)
  Seller    -> ECommerce     pen=1  wps=0   (直線のまま)
```

- **`ECommerce → OrderEvents`**（service → infra queue）は `platform` フレームから真下に降り、`commerce` フレーム内の `Notification` カードと `commerce` フレームを貫通して infra tier に達する。
- **`Seller → ECommerce`**（actor → service）は真下の `MobileApp` を貫通する（古い actor-bypass 課題 #966 と同根）。

両者とも `wps=0` — `routeGroupedEdges` がリルートに失敗し、直線のまま残している。

### 根本原因（貫通）

`routeGroupedEdges` は各 edge について **右ガター 1 本と左ガター 1 本**（`maxRight + GUTTER_GAP` / `minLeft − GUTTER_GAP`）だけを試す。ガター経由の経路は次の 3 セグメントで構成される:

```
sourcePort(side, mid-height) → (gutterX, srcY) → (gutterX, tgtY) → targetPort(side, mid-height)
```

障害物は端点のいずれも囲まないノード/フレーム全て。上の経路の**横 stub は端点の中央高さ (mid-height) で水平に伸びる**ため、**同じ行（row/tier）に並ぶ兄弟ノードを横切ると両ガターとも塞がる**:

- `ECommerce → OrderEvents`: target `OrderEvents` は infra tier で左右を `ECommerceDB`（左）・`MediaStorage`（右）に挟まれる。**side entry stub がどちらの兄弟も横切る** → 両ガター不成立。
- `Seller → ECommerce`: source `Seller` の side exit stub が actor row の兄弟（`Customer` / `Admin`）を横切る → 両ガター不成立。

両ガターが塞がると現状は「直線のまま（never worse）」で終わり、直線は貫通する。

`system-view-grouping.md` § P2c-A は「候補経路を障害物に再判定し、残れば**より外側のガターへ退避**（最外ガターは構成上必ず空くので貫通ゼロを保証）」と書いたが:

1. その progressively-outer gutter fallback は**実装されていない**（1 side 1 lane のみ）。
2. さらに重要なのは、**その退避では挟まれたノードを救えない**こと。ガターをいくら外側へ動かしても、target の side に入る横 stub は依然として隣の兄弟ノードを横切る。「最外ガターは構成上必ず空く」は縦セグメントについては真だが、**端点へ入る横 stub の貫通は残る**。P2c-A のこの主張は挟まれノードに対して誤り。

一方、同じ § P2c-A は「必ず空く経路」として **帯間チャネル（隣接帯の間の横帯）** も列挙していた。これは実装されず、ガターだけが shipped された。挟まれ端点は **top/bottom port で隣接空き帯（channel）へ出入りすれば同 row 兄弟を横切らない**。プロトタイプで channel routing を足すと `getting-started` の貫通は **3 → 0**。

### 貫通とオーバーラップの結合（計測で判明）

だが「両ガター不成立なら channel で top/bottom 出入りする」だけの素朴実装は**別の可読性欠陥＝ collinear overlap（#1927）を新たに 2 件生む**。channel route は 4 waypoint になり、`isVerticalGutterRoute`（`waypoints.length === 2` gate）に該当せず、既存の overlap 回避パス（`distributeGutterLanes` / `fanOutGutterPorts`）が**素通りしてしまう**ため:

```
collinear vertical overlaps: 2
  ECommerce->OrderEvents ~ ECommerce->Inventory  @x=771  (両者ガター x=771 を縦に共有 → 別 edge が 1 本線に見える)
  Seller->ECommerce      ~ MobileApp->ECommerce  @x=405.5 (channel の top-entry drop が別 edge と同列で ECommerce 上辺に入る)
```

- 1 件目は真の **false-connection**（接続していない中間を 2 edge が 1 本の縦線として通る）。#1927 が `distributeGutterLanes` を作って潰したのと同型。
- 2 件目は同一 target（ECommerce）へ入る 2 edge の port 束ね。

**貫通ゼロと overlap ゼロは結合している** — 素朴 channel は片方（貫通）を直して他方（overlap）を悪化させる。TPL-20260711-02 の二重計測（交差＋貫通）に加え、#1927 の overlap ゼロも同時に満たす設計が要る。

### 鍵となる観察: port style は edge 単位でなく端点単位で決める

計測すると、2 件の貫通はいずれも**片方の端点だけ**が channel 待遇を要していた:

- `Seller → ECommerce`: source（Seller）は actor row 兄弟に塞がれる → channel。target（ECommerce）は**帯内で単独**なので **side entry が clear**。ECommerce に top ではなく **side（右, mid-height）から入れば 2 件目の overlap は消える**。
- `ECommerce → OrderEvents`: source（ECommerce）は side exit が clear。target（OrderEvents）だけが挟まれ → channel。

→ **端点ごとに「side stub が clear ならそれを使い、塞がれた端点だけ top/bottom channel stub にする」mixed route** にすると、貫通ゼロを保ちつつ overlap を最小化でき、残る overlap は**すべて既存 #1927 パスが 2-waypoint route 用に既に解いている形**（side-port stub の collinearity ＋ ガター corridor の y 重複）に一致する。プロトタイプで mixed routing 適用後の貫通 = 0、残 overlap は上記 2 パスの一般化で解ける形であることを確認済み。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| レイアウト構造 | `assignGroupedLayers`（group-layout.ts）が全ノードに **row index** を振り、row を縦に積む。同 row のノードは同じ y 帯、隣接 row の間には**ノードのない空き帯（inter-row channel）が全幅で存在**する（actor → client → service band → infra → external の順） |
| `routeGroupedEdges` | grouped で `routeOrthogonalEdges の代わりに呼ばれる。右→左ガターを試し、両方塞がれば直線のまま |
| ガター route の形 | `waypoints.length === 2`・両 waypoint 同一 x（縦回廊）。`isVerticalGutterRoute` がこれを判定 |
| 後段パス | `aggregateGroupTrunks` / `distributeGutterLanes` / `fanOutGutterPorts` はいずれも `isVerticalGutterRoute`（= 2 waypoint・両 waypoint 同一 x）の edge のみ対象。直線 edge（0 waypoint）や multi-waypoint route は無視 |
| `distributeGutterLanes`（#1927） | 非トランクのガター corridor を y 区間の greedy interval partitioning でレーン分離。corridor x が重なり y も重なる 2 edge を別 x へ。`waypoints[0].x`/`[1].y` を直接読む前提 |
| `fanOutGutterPorts`（#1927） | 同一ノード・同一 side に付く gutter stub の port anchor を node 辺高さに沿って分散（side-port の collinearity 解消）。**縦 port（top/bottom）軸の fan-out は無い** |
| 貫通判定 | `polylineClearOf`（早期 return）と `countPolylinePenetrations`（計数）が同一の strict-interior 判定（`segmentCrossesRect`, 1e-6 epsilon）を共有。route を採否する側と test で貫通を assert する側が食い違わない |
| overlap 計測 | test は `collinearVerticalOverlaps` / `collinearHorizontalOverlaps`（distinct edge・trunk sibling 除外で縦/横 collinear 重複を計数）を持ち、既存 fixture で **== 0** を assert |
| 既存 test | `edge-routing-groups.test.ts` は synthetic 2-team fixture `SYS` で `totalPenetrations == 0`・overlap == 0 を assert。だが**実サンプル `getting-started` は未カバー**で、上記貫通が漏れていた |

## 制約・前提

- **AC-1（never worse）**: リルートは strictly monotonic。候補経路を確定障害物集合に対し全セグメント検証し、完全に clear なときだけ適用する。塞がれたら直線のまま（今より悪化させない）。
- **AC-5（Group by: none 不変）**: ungrouped パイプライン（`routeOrthogonalEdges`）は byte-identical に温存する。本変更は grouped の `routeGroupedEdges` + grouped 後段パス内のみ。
- **overlap ゼロも同時に満たす（#1927）**: 貫通ゼロと引き換えに collinear overlap を増やさない。`getting-started` で `totalPenetrations == 0` **かつ** `collinearVerticalOverlaps == 0` **かつ** `collinearHorizontalOverlaps == 0`。
- **決定論**: 全座標をノード/フレームのジオメトリから導出（乱数・DOM 非依存）。snapshot 安定。
- **既存 2-waypoint route の回帰を防ぐ**: `SYS` / `TRUNKS` fixture の既存 route・overlap ゼロ assert はすべて green のまま。後段パスの一般化は 2-waypoint route の挙動を変えないことを既存 test で担保する（＝ 一般化の回帰柵）。
- **A\* / ELK は採らない**（ADR-20260429-01 案 B1/B3 で却下済み）。帯 + ガター + チャネルの stub-and-bend で構成的に解く。
- **out of scope**: #966 の配置レベル改善（actor を target 直前 row に降ろす、ADR-20260428-10）。本設計は routing レベルで `Seller → ECommerce` の貫通を解消するが、配置最適化は別課題。export 面（Show All Layers / drill-down）への波及も本設計外。trunk（`aggregateGroupTrunks`）への mixed route 参加も範囲外（必要になれば follow-up）。

## 検討した選択肢

### 案1: progressively-outer gutter（design § P2c-A の当初案）

両ガターが塞がれたら、より外側の lane（`maxRight + GUTTER_GAP + k·LANE_GAP`）を順に試す。

**メリット**
- 既存 2-waypoint route 形（`isVerticalGutterRoute`）をそのまま拡張でき、後段パスと整合。

**デメリット**
- **挟まれノードを救えない**（本設計の根本原因）。target/source の side stub が同 row 兄弟を横切る失敗は、ガターの x をどれだけ外へ動かしても消えない。`getting-started` の 2 件はどちらも side stub 起因なので**この案では貫通が残る**。→ 却下。

### 案2a: 素朴 channel routing（top/bottom port 固定・後段パス非参加）

両ガター不成立の edge を**両端とも top/bottom port** で出入りさせる 4-waypoint fallback を足すだけ（後段の lane/fan-out には参加させない）。

**メリット**
- 実装が小さい。貫通は 0 になる。

**デメリット**
- **overlap を 2 件増やす**（上記「貫通とオーバーラップの結合」）。ガター corridor が既存 2-waypoint route と衝突し false-connection を生む。#1927 の overlap ゼロ規律に反する。→ 却下。

### 案2b: mixed route（端点単位 side-if-clear）＋ #1927 パス一般化 — 採用

**routing（端点単位）**: 両ガター不成立の edge に対し、**端点ごとに独立に**「side stub が clear ならそれを使い、塞がれた端点だけ top/bottom channel stub」で経路を組む。取りうる形:

```
both side   : [sPort_side, (gx, sMidY), (gx, tMidY), tPort_side]                                  (= 既存 2-wp)
src channel : [sPort_top/bottom, (scx, exitY), (gx, exitY), (gx, tMidY), tPort_side]              (3-wp)
tgt channel : [sPort_side, (gx, sMidY), (gx, entryY), (tcx, entryY), tPort_top/bottom]            (3-wp)
both channel: [sPort_top/bottom, (scx, exitY), (gx, exitY), (gx, entryY), (tcx, entryY), tPort..] (4-wp)
```

- `exitY`/`entryY` = 端点に隣接する空き帯の中央（隣接 row のノード top/bottom から算出、= ADR-20260429-01 の `channelY` と同型）。forward/backward で top/bottom を反転。
- どの形でも**中央に 1 本のガター corridor（x = gutter x の縦セグメント）**を持つ。横セグメントは空き帯（全幅 clear）、縦はガター（content 外で clear）。候補は `polylineClearOf` で全検証し clear なときのみ適用（右→左ガター）。

**#1927 パスの一般化（overlap ゼロ維持）**: mixed route を既存の overlap 回避パスに載せる。

- `isVerticalGutterRoute`（2-wp 限定）に代えて、route から **ガター corridor（極値 x の縦セグメント）を取り出すヘルパ**を導入し、`distributeGutterLanes` を「corridor を持つ全 grouped route」で動かす。corridor x を動かすときは corridor 両端 waypoint と、それに繋がる channel 横セグメントの gutter 端も一緒に更新する（2-wp route は従来どおり）。
- `fanOutGutterPorts` を **side-port stub（従来）＋ top/bottom-port stub（新軸）**の両方で fan-out できるよう一般化。同一ノード同一辺に付く複数 anchor を辺に沿って分散する処理は軸が変わるだけ。
- 2-wp route の結果は不変（既存 test が回帰柵）。

**メリット**
- 貫通ゼロ・overlap ゼロを**同時に**達成（プロトタイプで `getting-started` 貫通 0、残 overlap は上記 2 パス一般化で解ける形）。
- side-if-clear なので top/bottom entry を最小化 — `Seller → ECommerce` は ECommerce 帯内単独ゆえ side entry になり、素朴案の 2 件目 overlap が構造的に消える。
- ADR-20260429-01 の帯間チャネル pattern と #1927 の lane/fan-out 規律の**両方に整合**。design § P2c-A の未実装「帯間チャネル」レグの完成。

**デメリット**
- **well-tested な #1927 パス（`distributeGutterLanes` / `fanOutGutterPorts`）を一般化する必要があり、実装コストは案2a より大きい**。既存 2-wp test を回帰柵にして慎重に進める。

### 案3: 配置レベルで解消（#966 / ADR-20260428-10 の拡張）

infra tier に挟まれるノードや actor の row 配置そのものを変え、直線で貫通しない位置に置く。

**デメリット**
- infra tier の挟まれ（`OrderEvents` が `ECommerceDB`/`MediaStorage` に挟まれる）は配置改善だけでは一般に解けない（共有 infra は複数 service から参照され、どこに置いても誰かの直下に来うる）。→ 配置改善は補完的だが本課題の解にはならない。out of scope とし、routing で構成的に解く。

## 比較

| 観点 | 案1 outer gutter | 案2a 素朴 channel | 案2b mixed＋一般化（採用） | 案3 配置 |
| --- | --- | --- | --- | --- |
| 挟まれノードの貫通を救う | ✗ | ✓ | ✓ | △ |
| actor-bypass の貫通を救う | ✗ | ✓ | ✓ | ○ |
| overlap ゼロ維持（#1927） | — | ✗（2 件増） | ✓ | — |
| 既存 2-wp route への影響 | 中 | 小 | 小（結果不変・柵で担保） | 大 |
| 実装コスト | 小 | 小 | 中（パス一般化） | 大 |
| 過去決定との整合 | — | ADR-20260429-01 のみ | ADR-20260429-01 ＋ #1927 | ADR-20260428-10 |

## 現時点の方針

**案2b（mixed route ＋ #1927 パス一般化）を採用する** — 貫通ゼロと overlap ゼロを同時に満たす唯一の案。素朴 channel（案2a）は貫通を直すが overlap を悪化させ #1927 規律に反する。端点単位 side-if-clear と既存 lane/fan-out パスの一般化で、両方の可読性軸を構成的に守る。ADR-20260429-01（帯間チャネル）と #1927（lane/fan-out）の双方に整合する。

### 実装の指針

1. `packages/core/src/renderer/edge-routing-groups.ts`（routing）:
   - `channelBelow(box, nodes)` / `channelAbove(box, nodes)` を足す（隣接 row のノード top/bottom から空き帯中央 y を算出。隣接ノードが無ければ `GUTTER_GAP` オフセット）。
   - `tryMixedRoute(edge, from, to, gutter, obstacles, nodes)`: 端点ごとに side stub の clear 判定（`segmentCrossesAnyRect` で mid-height stub を検査）→ clear なら side、塞がれれば channel stub を組み、`polylineClearOf` で全検証し clear なら適用（右→左）。
   - `routeGroupedEdges` の fallback 連鎖: `tryGutterRoute(right) || tryGutterRoute(left) || tryMixedRoute(right) || tryMixedRoute(left)`（既存 2-wp 成功ケースはそのまま `tryGutterRoute` で終わる）。
2. `packages/core/src/renderer/edge-routing-groups.ts`（後段パス一般化）:
   - ガター corridor 抽出ヘルパ（route の極値 x を持つ縦セグメント）を導入。
   - `distributeGutterLanes` を corridor ベースに一般化（2-wp・mixed 双方を lane 分離）。corridor x 変更時に接続 channel 横セグメント gutter 端も更新。
   - `fanOutGutterPorts` を side＋top/bottom 両軸の port fan-out に一般化。
   - モジュール doc を更新（mixed route・貫通/overlap ゼロの構成的根拠）。
3. `packages/core/src/renderer/edge-routing-groups.test.ts`:
   - 既存 `SYS` / `TRUNKS` fixture の route・overlap ゼロ assert が **green のまま**（一般化の回帰柵）。
   - 新 test: `getting-started` fixture を Group by team でレイアウトし `totalPenetrations == 0` **かつ** `collinearVerticalOverlaps == 0` **かつ** `collinearHorizontalOverlaps == 0` を assert（`straightCenterPenetrations > 0` で fixture が router を駆動していることも固定）。
   - `ECommerce → OrderEvents`（tgt channel）/ `Seller → ECommerce`（src channel）が期待どおり mixed route になることを assert。
   - ungrouped（Group by none）で同 fixture が不変であることを確認。
4. AT: `docs/acceptance/` に 1 件（人間確認）:
   - `examples/en/getting-started/index.krs` を app で開き Group by → Team。`ECommerce → Order events` が `Notification` を貫通せず、どのノード/フレームも直線貫通せず、2 本の線が 1 本に重なって見えない。
5. changeset: `@karasu-tools/core` + `karasu` を `patch`（利用者に見えるレイアウト修正）。
6. ADR 昇格: 実装完了後、本 Design Doc を `docs/adr/YYYYMMDD-NN-grouped-edge-channel-routing.md` に昇格し同 PR で削除。または P2c 一連（P2b/P2c）の ADR 昇格にまとめる（申し送りに従う）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: Group by team で従来ノードを貫通していた一部 edge が空き帯 + ガター経由の直交線に変わる（可読性改善）。ungrouped は不変。
- ドキュメント更新: `system-view-grouping.md` § P2c-A の「最外ガターで貫通ゼロ保証」記述を「mixed route（帯間チャネル + ガター）＋ lane/fan-out で構成的に貫通・overlap ゼロ」に訂正（実装 PR 側で）。
- テスト・examples への影響: `getting-started` の grouped snapshot が更新される（貫通していた 2 edge の経路変化＋ lane 再配分の可能性）。既存 `SYS`/`TRUNKS` の route は不変。examples ファイル自体は不変。

## Related TPLs

- [TPL-20260711-02](../test-perspectives/TPL-20260711-02-routing-measures-crossings-and-penetrations.md) — 交差＋貫通の二重計測。本設計の柵。**今回の bug は、この TPL の柵（貫通 0 assert）が synthetic fixture `SYS` にしか適用されておらず、実サンプル `getting-started` に及んでいなかったために漏れた**。実装 PR で実サンプルにも柵を広げる（貫通に加え overlap ゼロも）。
- [TPL-20260623-04](../test-perspectives/TPL-20260623-04-tier-split-no-edge-penetration.md) — tier 分割時のエッジ貫通ゼロ。同系の観点。
- **proactive TPL 検討**: 「新しい route 形（waypoint 構成）を足したら、既存の overlap 回避パス（lane/fan-out）がその形を素通りしていないか確認する」という観点は、まさに本 bug の構造（新 route 形が `isVerticalGutterRoute` gate を外れて overlap パスに載らなかった）を一般化したもの。3-Yes（横展開しうる＝将来の新 route 形／構造的に再発しうる＝gate が waypoint 数依存／既存 TPL 未掲載）を満たすため、**実装 PR で proactive TPL を 1 件起こす**候補とする（`test-perspective` スキル、`root_cause_file: packages/core/src/renderer/edge-routing-groups.ts`）。

## 決めないこと（スコープ確定）

- **channel route の trunk（`aggregateGroupTrunks`）参加** — 本 PR では lane/fan-out のみ一般化し、trunk 束ねへの mixed route 参加は扱わない。`getting-started` の貫通・overlap ゼロには不要。必要になれば follow-up。
- **#966（actor-bypass の配置レベル解消）との統合** — 本設計は routing レベルで `Seller → ECommerce` を解くに留め、配置最適化（ADR-20260428-10 の拡張）は #966 に委ねる。
