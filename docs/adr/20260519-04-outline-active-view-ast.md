---
id: ADR-20260519-04
title: Outline ビューはアクティブビューの AST に追従する
status: accepted
date: 2026-05-19
topic: app-ui
related_to: [ADR-20260519-01]
scope:
  packages: [app, core]
assumptions:
  - "file: packages/app/src/components/outline-adapters.ts"
  - "symbol: packages/app/src/components/OutlineView.tsx :: OutlineNode"
  - "symbol: packages/core/src/index.ts :: DeployCompileResult"
---

# ADR-20260519-04: Outline ビューはアクティブビューの AST に追従する

- **日付**: 2026-05-19
- **ステータス**: 決定済み
- **関連**:
  - Issue #1410 — Switch the Outline view to the deploy/org AST when those views are active
  - 関連 ADR: [ADR-20260519-01](20260519-01-app-outline-view.md) — Outline ビューの導入
  - 関連 TPL:
    - [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md) — 同一モデルを複数サーフェスに出すとき表示は一致させる
    - [TPL-20260510-08](../test-perspectives/TPL-20260510-08-derived-state-staleness.md) — 派生 view の memoization は source state の変化次元すべてを key に含める
  - コード: `packages/app/src/components/OutlineView.tsx`、
    `packages/app/src/components/outline-adapters.ts`、
    `packages/app/src/components/AppShell.tsx`、
    `packages/core/src/index.ts`（`DeployCompileResult.deployTree`）

## 背景

ADR-20260519-01 で導入した Outline ビューは、常に system AST
（`SystemNode[]`）を描画していた。プレビューが deploy / org ビューを
表示していても Outline は system ツリーのままで、画面に出ている図と
サイドバーのツリーが食い違っていた。

Issue #1410 はこれを「アクティブビューの AST を反映する」ことを求めた。
3 つのビューの AST は構造が異なる:

- system: `KrsNode`（入れ子あり）
- org: `OrganizationBlock` / `TeamNode` / `MemberNode`（入れ子あり）
- deploy: `DeployBlock` / `DeployNode`（入れ子なし、ブロック→ノードの 2 階層）

さらに deploy の解決済み AST は core から公開されておらず、
`DeployCompileResult` は `deployBlocks`（`{id,label}` のみ）しか持って
いなかった。

## 決定

presentational な `OutlineView` をビュー非依存の統一モデル `OutlineNode`
（`{ id, label?, kind, children }`）を描画するよう一般化し、`AppShell` が
`activeView` に応じて 3 つのアダプタ（`toSystemOutline` / `toDeployOutline` /
`toOrgOutline`）で source AST を `OutlineNode[]` に変換して渡す。deploy の
解決済みツリーは `DeployCompileResult.deployTree` として core から新たに
公開する。

## 理由

- **presentational コンポーネントの単一化**: 再帰描画・選択ハイライト・
  アイコン枠といった共通要素を `OutlineView` 1 か所に保てる。ADR-20260519-01
  の「presentational な単一 `OutlineView`」方針を維持する。
- **ビュー固有知識の局所化**: ノード型の違い・drill-down 経路・deploy の
  ブロック選択といったビュー固有の差分は、純関数のアダプタと `AppShell` の
  select / activate ハンドラに閉じ込められる。
- **派生 state の正しい memoization**: Outline の source AST は `activeView`
  依存の派生 state になるため、`outlineNodes` の `useMemo` は `activeView` と
  各 source AST を key に含める（TPL-20260510-08）。
- **core API は追加のみ**: `deployTree` フィールドの追加で、既存 `deployBlocks`
  consumer（block selector・NodeDetailPanel）は無影響。
- **deploy は全ブロックを俯瞰**: deploy 図は `selectedDeployBlockId` で 1
  ブロックずつ描画するが、Outline は全 deploy ブロックをトップレベルに並べる。
  Outline は「何があるか」の俯瞰が役割。別ブロックのノードを activate したら
  `selectedDeployBlockId` をそのブロックに切替える。

ビュー別の select / activate セマンティクス:

- select（single click）: アクティブビュー内でハイライト（`SET_HIGHLIGHTED_NODE`）。
  matrix のみ例外で、per-node ハイライトを持たないため system ビューへ切替える。
- activate（double click）: system / matrix は `nodeMetadata.viewPath`、org は
  `orgPathIndex` で drill-down。deploy は drill 経路を持たず、対象ノードの
  所属ブロックを `selectedDeployBlockId` に切替える。

## 却下した案

- **ビューごとに専用 Outline コンポーネント**（`SystemOutline` /
  `DeployOutline` / `OrgOutline`）: 各コンポーネントが自分のノード型を直に
  扱えるが、presentational な再帰描画ロジックが 3 回複製され、
  ADR-20260519-01 の単一 `OutlineView` 方針から外れる。
