---
type: product
---

# AT: 層をまたぐエッジが内部の列を通る（#2611）

- **日付**: 2026-09-09
- **関連 Issue**: [#2611](https://github.com/kompiro/karasu/issues/2611)（slice D。親: [#2598](https://github.com/kompiro/karasu/issues/2598)）
- **設計**: [#2611](https://github.com/kompiro/karasu/issues/2611) の Design Doc（実装完了後に ADR-2611 へ昇格し、本欄をその ADR に差し替える）
- **Related TPLs**: [TPL-2611](../test-perspectives/TPL-2611-feedback-key-survives-the-next-pass.md)（フィードバックの鍵は次のパスで動かない構造キーで持つ）, [TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)（新しい経路形が重なり回避に参加する）, [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)（交差と貫通を両方測る）, [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)（柵の corpus は限界に達していること）, [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（同じ規則を 2 箇所に書き分けない）
- **対象ファイル**:
  - `packages/core/src/renderer/edge-routing-groups.ts`（回廊への進入 / staircase / 資源キーの claim / fan-out の裁定）
  - `packages/core/src/renderer/layout.ts`（`columnReservations`）
  - `packages/core/src/renderer/layer-layout-logics.ts`（`extraGapBeforeCard` / `ROW_END_COLUMN`）
  - `packages/core/src/renderer/layout-geometry.ts`（予約した gap を保つ中央寄せ）

> 層をまたぐエッジは、行の間に空いている列があってもそこへ「入る方法」が無く、外側のガターへ落ちていた。
> 進入規則をガター経路と共有し（側面 stub が塞がれていれば上下ポート + 行間チャネル）、行の隙間を
> 1 つずつ辿る staircase を足し、列が 1 本も無い行にだけ列を 1 本予約する。dify（20 view / 1,102 edge）で
> ガター送り 987 → 597、共線ペア 3/13 → **0/0**、交差 -18.7%、経路長 -13.0%、キャンバス面積 -9.7%。

## 受け入れ条件

### AC-1: 層をまたぐエッジが配置の内部を通る

- [x] TC-A1: 内部の列を使い切る混雑モデルで、内部回廊を通るエッジが 24 本以上・ガター送りが 4 本以下になる（main は 18 / 10）

  > ✅ Automated — `packages/core/src/renderer/edge-routing-groups.test.ts` › layer-spanning edges reach the interior (#2611) › takes the columns between the cards instead of running out to a gutter (TC-A1)

- [x] TC-A2: 内部を使うことで幅が増えない（同モデルのキャンバス幅が main の 1628 以下に収まる）

  > ✅ Automated — `packages/core/src/renderer/edge-routing-groups.test.ts` › layer-spanning edges reach the interior (#2611) › does not pay for the columns with width — the canvas gets narrower (TC-A2)

- [x] TC-A3: 配線が要らない図は 1 バイトも変わらない（waypoint 0 本・配置 1 パス）

  > ✅ Automated — `packages/core/src/renderer/edge-routing-groups.test.ts` › layer-spanning edges reach the interior (#2611) › leaves a diagram that needs no routing exactly where it was (never worse) (TC-A3)

### AC-2: 貫通 0 と共線 0 が両軸で保たれる（TPL-1927 / TPL-1954）

- [x] TC-B1: 混雑モデルで貫通 0、共線ペアが縦横とも 0

  > ✅ Automated — `packages/core/src/renderer/edge-routing-groups.test.ts` › layer-spanning edges reach the interior (#2611) › keeps penetration and collinear overlap at zero on both axes (TPL-1927) (TC-B1)

- [x] TC-B2: 内部の列を使い切る入力（柵 corpus に追加）で、貫通 0・共線 0 が両軸で保たれる

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › exhausted interior corridors — column fence (#2611, TPL-2598) › no two edges share a collinear corridor on either axis / no column spills into a card (TC-B2)

- [x] TC-B3: 既存 12 モデルの貫通 0・共線 0、grouped のピン留め値が不変

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › shared routing chain — ungrouped fences / grouped output is unchanged（既存の柵。値の変更なしで通過）(TC-B3)

- [ ] TC-B4: dify（20 view / 1,102 edge）で共線ペアが縦横とも 0、貫通が悪化しない

  > 🔍 Manual — 外部モデル（`/workspaces/dify/index.krs`）は repo に無いため CI では回せない。`reports/layer-spanning-edge-columns` の生成物で確認する（今回の測定値: 共線 3/13 → 0/0、貫通 7 → 7）

### AC-3: 予約の鍵が 2 パス目で壊れない（TPL-2611）

- [x] TC-C1: 予約を与えたときと与えないときで `rows`（行の構成と順序）が完全に一致する

  > ✅ Automated — `packages/core/src/renderer/layer-layout-logics.test.ts` › placeNodesInLayers > column reservation (#2611, TPL-2611) › keeps the rows a reservation was measured on (the key stays valid) (TC-C1)

- [x] TC-C2: 予約が指すカードがその行に居ない場合、予約は破棄され既定の配置に戻る

  > ✅ Automated — `packages/core/src/renderer/layer-layout-logics.test.ts` › placeNodesInLayers > column reservation (#2611, TPL-2611) › drops a reservation whose card is not in that row — never worse (TC-C2)

- [x] TC-C3: 予約が空なら配置はバイト単位で不変。行末の列（`ROW_END_COLUMN`）はカードを動かさずに行幅だけ広げる

  > ✅ Automated — `packages/core/src/renderer/layer-layout-logics.test.ts` › placeNodesInLayers > column reservation (#2611, TPL-2611) › leaves the placement byte-identical without a reservation / appends at the row end for ROW_END_COLUMN (TC-C3)

### AC-4: 決定性とパス数の上限（ADR-2593 / ADR-2598）

- [x] TC-D1: 同じ入力を 2 回レイアウトして、ノード座標・エッジの点列・キャンバスが完全に一致する

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › exhausted interior corridors — column fence (#2611, TPL-2598) › gives the same canvas twice — the reservation is deterministic (TC-D1)

- [x] TC-D2: 列を使い切る入力でも `placementPasses` が 2 を超えない

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › exhausted interior corridors — column fence (#2611, TPL-2598) › re-places at most once (ADR-2598's bound holds on the other axis) (TC-D2)

### AC-5: 目視（実機確認）

- [ ] TC-E1: dify の `Knowledge` / `Workflow` view を app で開き、右端に寄っていた帯が薄くなり、エッジが列の間を通っていること（測定値: 幅 85% より右の waypoint は Knowledge 58 → 54、Workflow 42 → 34、キャンバス幅は 4995 → 4573 / 3653 → 3080）
- [ ] TC-E2: [#2490](https://github.com/kompiro/karasu/issues/2490) の再現手順（`S1`/`S2`/`S3` を app で in-place 展開）で、2 本の `S1 -> S3` が回廊もアンカーも共有しないこと
- [ ] TC-E3: `examples/` のサンプルをいくつか app で開き、経路が読みづらくなっていないこと（スナップショットは通るが、見た目の劣化は自動では測れない）
