# Grouped edge の帯間チャネル routing — 貫通ゼロを構成的に達成する

- **日付**: 2026-07-15
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1954](https://github.com/kompiro/karasu/issues/1954)
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

### 根本原因

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

一方、同じ § P2c-A は「必ず空く経路」として **帯間チャネル（隣接帯の間の横帯）** も列挙していた。これは実装されず、ガターだけが shipped された。本設計はこの**未実装の「帯間チャネル」レグを完成させて貫通ゼロを構成的に達成する**。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| レイアウト構造 | `assignGroupedLayers`（group-layout.ts）が全ノードに **row index** を振り、row を縦に積む。同 row のノードは同じ y 帯、隣接 row の間には**ノードのない空き帯（inter-row channel）が全幅で存在**する（actor → client → service band → infra → external の順） |
| `routeGroupedEdges` | grouped で `routeOrthogonalEdges の代わりに呼ばれる。右→左ガターを試し、両方塞がれば直線のまま |
| ガター route の形 | `waypoints.length === 2`・両 waypoint 同一 x（縦回廊）。`isVerticalGutterRoute` がこれを判定 |
| 後段パス | `aggregateGroupTrunks` / `distributeGutterLanes` / `fanOutGutterPorts` はいずれも `isVerticalGutterRoute`（= 2 waypoint）の edge のみ対象。直線 edge（0 waypoint）は無視 |
| 貫通判定 | `polylineClearOf`（早期 return）と `countPolylinePenetrations`（計数）が同一の strict-interior 判定（`segmentCrossesRect`, 1e-6 epsilon）を共有。route を採否する側と test で貫通を assert する側が食い違わない |
| 既存 test | `edge-routing-groups.test.ts` は synthetic 2-team fixture `SYS` で `totalPenetrations == 0` を assert。だが**実サンプル `getting-started` は未カバー**で、上記貫通が漏れていた |

## 制約・前提

- **AC-1（never worse）**: リルートは strictly monotonic。候補経路を確定障害物集合に対し全セグメント検証し、完全に clear なときだけ適用する。塞がれたら直線のまま（今より悪化させない）。
- **AC-5（Group by: none 不変）**: ungrouped パイプライン（`routeOrthogonalEdges`）は byte-identical に温存する。本変更は grouped の `routeGroupedEdges` 内のみ。
- **決定論**: 全座標をノード/フレームのジオメトリから導出（乱数・DOM 非依存）。snapshot 安定。
- **既存 2-waypoint route を壊さない**: 現状ガター routing で成功している edge（`SYS` fixture の `Billing → *` 等）の経路・snapshot は変えない。新経路は**両ガターが塞がれた場合のみ**発火する fallback とする。
- **A\* / ELK は採らない**（ADR-20260429-01 案 B1/B3 で却下済み）。帯 + ガター + チャネルの stub-and-bend で構成的に解く。
- **out of scope**: #966 の配置レベル改善（actor を target 直前 row に降ろす、ADR-20260428-10）。本設計は routing レベルで `Seller → ECommerce` の貫通を解消するが、配置最適化は別課題。export 面（Show All Layers / drill-down）への波及も本設計外。

## 検討した選択肢

### 案1: progressively-outer gutter（design § P2c-A の当初案）

両ガターが塞がれたら、より外側の lane（`maxRight + GUTTER_GAP + k·LANE_GAP`）を順に試す。

**メリット**
- 既存 2-waypoint route 形（`isVerticalGutterRoute`）をそのまま拡張でき、後段パスと整合。

**デメリット**
- **挟まれノードを救えない**（本設計の根本原因）。target/source の side stub が同 row 兄弟を横切る失敗は、ガターの x をどれだけ外へ動かしても消えない。`getting-started` の 2 件はどちらも side stub 起因なので**この案では貫通が残る**。→ 却下。

### 案2: 帯間チャネル routing（top/bottom port 経由）— 採用

両ガターが塞がれた edge に対し、**端点を side ではなく top/bottom port で出入りさせ、隣接する空き帯（inter-row channel）を横に走ってからガターで縦断する** fallback を足す。forward edge（target が source より下）の経路:

```
S.bottomPort → (Scx, exitY) → (gutterX, exitY) → (gutterX, entryY) → (Tcx, entryY) → T.topPort
```

- `exitY` = source の直下の空き帯の中央、`entryY` = target の直上の空き帯の中央（隣接 row のノード top/bottom から算出、= ADR-20260429-01 の `channelY` と同型）。
- backward edge は top/bottom を反転（S.top / T.bottom、`exitY` = 直上帯、`entryY` = 直下帯）。
- 横セグメントは空き帯（全幅 clear）を、縦セグメントはガター（content 外で clear）を走る。端点への drop は隣接空き帯から自分のカードへ入るだけで clear。
- 候補経路は `polylineClearOf` で全セグメント検証し、clear なときのみ適用（右ガター → 左ガターの順に試す）。

**メリット**
- **挟まれノード・actor row の両方を救う**（端点への出入りが side ではなく top/bottom なので同 row 兄弟を横切らない）。プロトタイプで `getting-started` の貫通が **3 → 0**。
- ADR-20260429-01 が ungrouped 用に既に採用・sanction 済みの帯間チャネル pattern と同型。design § P2c-A が列挙しながら未実装だった「帯間チャネル」レグの完成でもある。
- 追加的（additive）: 両ガターが塞がれた edge のみ発火。既存 2-waypoint route は不変。

**デメリット**
- route が 4 waypoint（6 点）になり `isVerticalGutterRoute`（2 waypoint 判定）に該当しない → **後段の trunk / lane / fan-out パスの対象外**になる。ただしこれは**現状の直線 edge（0 waypoint）と同じ扱い**であり、退行ではない（詳細は下記「未解決の問い」で検討）。

### 案3: 配置レベルで解消（#966 / ADR-20260428-10 の拡張）

infra tier に挟まれるノードや actor の row 配置そのものを変え、直線で貫通しない位置に置く。

**メリット**
- routing を触らずに済むケースがある。

**デメリット**
- infra tier の挟まれ（`OrderEvents` が `ECommerceDB`/`MediaStorage` に挟まれる）は配置改善だけでは一般に解けない（共有 infra は複数 service から参照され、どこに置いても誰かの直下に来うる）。routing の頑健性が別途要る。→ 配置改善は補完的だが本課題の解にはならない。out of scope とし、routing で構成的に解く。

## 比較

| 観点 | 案1 progressively-outer gutter | 案2 帯間チャネル（採用） | 案3 配置レベル |
| --- | --- | --- | --- |
| 挟まれノードを救えるか | ✗（side stub 貫通が残る） | ✓ | △（共有 infra は不可） |
| actor-bypass を救えるか | ✗ | ✓ | ○（#966 本来の解） |
| 既存 route/snapshot への影響 | 中（route 形は同じだが lane 番号が動く） | 小（fallback のみ・既存 2-wp 不変） | 大（全 grouped 配置が動く） |
| 過去決定との整合 | — | ADR-20260429-01 と同型 | ADR-20260428-10 の拡張 |
| 決定論 | ○ | ○ | ○ |

## 現時点の方針

**案2（帯間チャネル routing）を採用する** — 挟まれノードと actor row の両方の貫通を構成的に解消でき、ADR-20260429-01 が既に sanction した帯間チャネル pattern と同型で、design § P2c-A が列挙しながら未実装だったレグの完成にあたる。既存ガター route を温存する additive fallback なので AC-1 / AC-5 を保てる。

### 実装の指針

1. `packages/core/src/renderer/edge-routing-groups.ts`:
   - `channelBelow(box, nodes)` / `channelAbove(box, nodes)` を足す（隣接 row のノード top/bottom から空き帯中央 y を算出。隣接ノードが無ければ `GUTTER_GAP` オフセット）。
   - `tryChannelRoute(edge, from, to, gutter, obstacles, nodes)` を足す。forward/backward を `from`/`to` の y 関係で判定し、上記 6 点経路を生成、`polylineClearOf` で検証、clear なら `fromPoint`/`toPoint`/`waypoints`（4 点）を書き換えて `true`。
   - `routeGroupedEdges` の fallback 連鎖を拡張:
     `tryGutterRoute(right) || tryGutterRoute(left) || tryChannelRoute(right) || tryChannelRoute(left)`。
   - モジュール doc を更新（帯間チャネル fallback の説明・貫通ゼロの構成的根拠）。
2. `packages/core/src/renderer/edge-routing-groups.test.ts`:
   - 新 test: `getting-started` fixture（実サンプル）を Group by team でレイアウトし `totalPenetrations == 0` を assert（`straightCenterPenetrations > 0` で fixture が router を実際に駆動していることも固定）。
   - `ECommerce → OrderEvents` / `Seller → ECommerce` が multi-waypoint（channel）route を得ることを assert。
   - ungrouped（Group by none）で同 fixture が不変（既存 2-waypoint route も不変）であることを確認。
3. AT: `docs/acceptance/` に 1 件（人間確認）:
   - `examples/en/getting-started/index.krs` を app で開き Group by → Team。`ECommerce → Order events` が `Notification` カードを貫通しない／どのノード・フレームも直線貫通しない。
4. changeset: `@karasu-tools/core` + `karasu` を `patch`（利用者に見えるレイアウト修正）。
5. ADR 昇格: 実装完了後、本 Design Doc を `docs/adr/YYYYMMDD-NN-grouped-edge-channel-routing.md` に昇格し同 PR で削除。または P2c 一連（P2b/P2c）の ADR 昇格にまとめる（申し送りに従う）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: Group by team で従来ノードを貫通していた一部 edge が空き帯 + ガター経由の直交線に変わる（可読性改善）。ungrouped は不変。
- ドキュメント更新: `system-view-grouping.md` § P2c-A の「最外ガターで貫通ゼロ保証」記述を「帯間チャネル + ガターで構成的に貫通ゼロ」に訂正（実装 PR 側で）。
- テスト・examples への影響: `getting-started` の grouped snapshot が更新される（貫通していた 2 edge の経路変化）。examples ファイル自体は不変。

## Related TPLs

- [TPL-20260711-02](../test-perspectives/TPL-20260711-02-routing-measures-crossings-and-penetrations.md) — 交差＋貫通の二重計測。本設計の柵。**今回の bug は、この TPL の柵（貫通 0 assert）が synthetic fixture `SYS` にしか適用されておらず、実サンプル `getting-started` に及んでいなかったために漏れた**。実装 PR で実サンプルにも柵を広げる。新規 TPL は起こさない（既存 TPL の consumer 拡張で足りる）。
- [TPL-20260623-04](../test-perspectives/TPL-20260623-04-tier-split-no-edge-penetration.md) — tier 分割時のエッジ貫通ゼロ。同系の観点。

## 未解決の問い / 決めないこと

- **channel route を後段パス（trunk / lane / fan-out）に載せるか** — 現状は 4 waypoint なので `isVerticalGutterRoute` に該当せず対象外（= 直線 edge と同じ）。`getting-started` では channel route が 2 本だけで縦セグメントの y 重複が無く collinear overlap は生じないため、貫通ゼロ達成には不要。多数の channel route が同一ガター x で縦重複するケースの lane 分離は、必要になった時点で follow-up（本 PR では扱わない）。
- **#966（actor-bypass の配置レベル解消）との統合** — 本設計は routing レベルで `Seller → ECommerce` を解くに留め、配置最適化（ADR-20260428-10 の拡張）は #966 に委ねる。
