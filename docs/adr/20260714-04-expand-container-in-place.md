---
id: ADR-20260714-04
title: system view のコンテナをその場で展開する（in-place expansion / true mixed-LOD）
status: accepted
date: 2026-07-14
topic: renderer
related_to:
  - ADR-20260711-03
  - ADR-20260712-01
  - ADR-20260630-02
  - ADR-20260403-01
scope:
  packages: [core, app]
assumptions:
  - "symbol: packages/core/src/view/view-extract.ts :: extractView"
  - "symbol: packages/core/src/renderer/svg-renderer.ts :: renderExpandControls"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: resolveGroupBoxes"
  - "symbol: packages/app/src/hooks/useCollapsibleSet.ts :: useCollapsibleSet"
  - "grep: packages/core/src/index.ts :: expandedContainers"
---

# ADR-20260714-04: system view のコンテナをその場で展開する（in-place expansion / true mixed-LOD）

- **日付**: 2026-07-14
- **ステータス**: 決定済み
- **関連**:
  - tracking Issue: [#1815](https://github.com/kompiro/karasu/issues/1815)（親 epic #1817 comprehension）
  - 実装 Issue: #1921（Phase 1 = 単一展開）/ #1923（Phase 2 = 複数同時展開）。PR #1928 / #1947
  - 再利用した機構: [ADR-20260711-03](20260711-03-system-view-group-by-team.md)（group-by team の境界フレーム + 二段レイアウト）, [ADR-20260712-01](20260712-01-category-collapse-retarget-edges.md)（collapse 時の越境エッジ re-target）, [ADR-20260630-02](20260630-02-layer-toggles.md)（on-SVG affordance + interactive-only）, [ADR-20260403-01](20260403-01-drill-down-adapter-hierarchy-node.md)（drill-down）
  - 制約 TPL: [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md)（scoped glance を first-class に保つ）, [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)（再配置時の全要素一度配置 + 端点保持）
  - AT: [AT-1921](../acceptance/1921-single-container-in-frame.md) / [AT-1923](../acceptance/1923-multi-container-expansion.md)
  - コード: `packages/core/src/view/view-extract.ts` / `renderer/layout.ts` / `renderer/edge-routing-groups.ts` / `renderer/svg-renderer.ts`、`packages/app`（`useSystemView` / `useCollapsibleSet` / `PreviewColumn`）

## 背景

comprehension 柱（#1817）が残した壁は「**一部だけ深く見つつ周囲の構造を保つ**」= 単一フレーム内の混在詳細度（mixed level-of-detail）だった。既存の drill-down（#21）は各レベルを独立 render して丸ごと入れ替える **replace-context 型**で、root か掘った先のどちらか一方しか見えず、service の内部を兄弟や越境エッジとの関係のなかで読めない。縦軸は drill-down、横方向の同一 LOD 密度は #1186 / #1821 / #1858 がカバー済みで、残るのがこの混在 LOD だった。

重要な観測: **group-by team（ADR-20260711-03）は既に「子を内包する境界フレームを畳んだ兄弟の隣に描く」機構を持つ**。in-place expansion はこの逆操作（team を 1 stub に畳む代わりに、1 コンテナを実サブレイアウトに開く）とほぼ同型であり、`assignGroupedLayers` / `buildGroupFrames` / エッジ re-target をそのまま再利用できる。

## 決定

**system view の service を、その内部 domain を境界フレームに入れて「その場で」展開する（in-place expansion）機能を実装する。** 展開は view-mode 局所で `.krs` 文法は不変、interactive プレビューのみ。案1（true mixed-LOD, 同一フレーム内で詳細度を混ぜる）を最終目標とし、Phase 1 で単一展開、Phase 2 で複数同時展開まで一般化した。

確定した具体方針:

1. **導出は view-extract**。`extractView(..., expandedContainers)` が展開 service を domain 子へ splice し、越境エッジを再アンカーする（domain 由来の implicit edge は正確な内部 domain へ、explicit service edge / infra edge はフレーム境界へ）。集約された childEdges からは provenance が復元できないため、生の domain edge を持つ view-extract で導出する。
2. **レイアウトは group-band 機構の再利用**。展開 domain を 1 グループとして `assignGroupedLayers` に通し、`buildGroupFrames` で境界フレームを描く。core は複数フレームを最初から扱えるため、Phase 2 は core レイアウト変更ゼロ（app の同時展開上限を外すだけ）で成立した。
3. **エッジは group router で frame 端点対応**（`routeGroupedEdges`）。展開フレームの矩形を渡し、node でないフレーム端点を frame として解決してその frame を当該エッジの障害物から除外する。結果、各エッジは自分のフレーム/domain に接続し他フレームは side gutter で迂回する。trunk 集約・lane 分離・port fan-out（#1859 / #1927）も共有 `resolveGroupBoxes` で frame 端点を解決する。
4. **affordance は on-SVG・interactive-only**（ADR-20260630-02 踏襲）。畳んだ service に ⊕、展開フレームに ⊖（`data-expand-node`）。展開フレームは accent 枠 + 淡い塗りで俯瞰から目立たせる。static 出力・multi-system root・group-by team では出さない。
5. **scoped-glance ガードはソフト**（TPL-20260510-21）。Phase 1 は単一展開で構造的に保護。Phase 2 は「Collapse all」で全展開を畳んで俯瞰へ戻し、同時展開が閾値（4）以上でツールバーに警告ヒントを出す。**ハード上限は設けない**。
6. **深い入れ子展開は不採用**（展開 domain の子をさらに展開するのは drill-down の領域）。

## 理由

- **既存機構の再利用で de-risk**: in-place expansion は group-collapse の逆であり、境界フレーム描画・二段レイアウト・エッジ re-target は ADR-20260711-03 / ADR-20260712-01 の資産をそのまま使える。Phase 1（単一展開）を案1 の最小ケースとして先に作り、難所（サイズ不連続をまたぐ frame 端点ルーティング）を de-risk してから複数展開へ広げた。
- **frame 端点ルーティングが核心**: 展開 domain はフレーム内にあり越境エッジの標的なので、group router の「フレームを障害物として迂回」規則をそのまま使うと標的に届かない。frame 端点を解決して自フレームだけ障害物から除外することで、複数フレームでも各エッジが接続しつつ他フレームを貫通しない、を両立した。
- **scoped glance の保護**: karasu の中核認知モデルは scoped glance（一度に見せる量を絞る、TPL-20260510-21）。複数同時展開はこの原則と緊張するため、無制限展開を既定にせず「戻る導線 + ソフト警告」で牽制した。ハード上限にしなかったのは、比較・探索の自由をユーザーに残すため。
- **B1–B3 計測で gate**: Phase 1 完了時に payment-platform で計測（+1 ノード / エッジ drop ゼロ / 兄弟保持）し、案3 が受け入れバーを満たすことを確認してから Phase 2 に進んだ。

## 却下した案

- **ピン留め詳細パネル近似**: 展開 service の内部を別パネルに描く案。実装は最も安いが、越境エッジを *関係のなかで* 見る（in-frame の B1）を満たせず drill-down と同じ「文脈が別サーフェスに切れる」弱点を引き継ぐため endpoint にしない。
- **展開時に orthogonal router を使う**（Phase 1 初期実装）: frame 端点を skip する group router を避けて orthogonal に流したが、複数フレームで通過エッジが各フレームを貫通した。group router を frame 端点対応に拡張して置き換えた（本 ADR 方針3）。
- **同時展開のハード上限**: scoped glance を最も強く守るが機能を制限する。ソフト警告 + 戻る導線で十分と判断。
- **深い入れ子展開の採用**: モデルが平坦でなくなり scoped glance を崩す。drill-down に委ねる。
