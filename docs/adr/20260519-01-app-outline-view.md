---
id: ADR-20260519-01
title: App サイドバーに AST Outline ビューを追加する
status: accepted
date: 2026-05-19
topic: app-ui
scope:
  packages: [app]
assumptions:
  - "file: packages/app/src/components/OutlineView.tsx"
  - "symbol: packages/app/src/components/EditArea.tsx :: ActivityBarButton"
  - "symbol: packages/core/src/shapes/shape-registry.ts :: renderPictogram"
---

# ADR-20260519-01: App サイドバーに AST Outline ビューを追加する

- **日付**: 2026-05-19
- **ステータス**: 決定済み
- **関連**:
  - Issue #1408 — Add an AST Outline view to the App sidebar
  - フォローアップ Issue: #1410（deploy/org 表示時の Outline 切り替え）、
    #1411（Ctrl/Cmd+B でサイドバー開閉）、#1415（タグ由来アイコンバリアント）
  - 関連 TPL: TPL-20260518-01（involutive toggle）、TPL-20260516-01（control a11y）、
    TPL-20260510-20（id-not-label）
  - コード: `packages/app/src/components/OutlineView.tsx`、
    `packages/app/src/components/EditArea.tsx`、
    `packages/app/src/components/AppShell.tsx`

## 背景

App のサイドバーはプロジェクトのファイルシステム（FileTree）しか表示せず、
`.krs` ドキュメントの構造的な形 — system / 入れ子の component / relation —
を一覧する手段がなかった。大きな図ほど「どんなノードがあるか」を把握しづらい。

解決済みの AST（`SystemNode[]`）は `useAppViews` の
`views.system.resolvedSystems` として利用可能で、プレビューの
`highlightedNodeId` 機構も既にある。これらを使い、ナビゲート可能なツリー型の
Outline をサイドバーに追加するか、追加するならサイドバーのレイアウトと
ノード操作の挙動をどう設計するかを検討した。

## 決定

ActivityBar を「単一の collapse toggle」から VS Code 型のマルチビューバー
（Files / Outline の 2 ボタン）に拡張し、`SystemNode[]` を再帰描画する
presentational な `OutlineView` をサイドバーに追加する。Outline ノードは
シングルクリックでハイライト、ダブルクリックで drill-down + ハイライトする。

## 理由

- **サイドバーのレイアウト**: ActivityBar の各ボタンが「アクティブなビューの
  再クリック = サイドバー開閉トグル」「非アクティブなビューのクリック = 切替 +
  展開」を担う。`sidebarView`（`"files" | "outline"`）で表示を 1 ビューに
  切り替える VS Code 型が、Outline を Files の下に常時スタックするより
  画面領域を有効に使え、挙動も既知のメンタルモデルに沿う。
- **ノード操作の 2 段階化**: `highlightedNodeId` のハイライトは現描画 SVG への
  視覚効果のみで `viewPath` を変えない。Outline は AST の入れ子をすべて見せる
  ため、シングルクリックだけだと現 `viewPath` 外のノードで静かに失敗する。
  VS Code に倣いシングル = ハイライト / ダブル = drill-down と分けた。
- **drill-down の祖先解決**: `nodeMetadata.viewPath` は `service` / `domain` /
  top-level infra とその子にしか付与されない（`buildNodePathIndex`）。leaf
  ノード（`usecase` / `resource` / `user` / `client`）は潜る先の sub-diagram
  を持たないため、Outline が持つ祖先チェーンを辿り `viewPath` を持つ最も近い
  祖先へ移動して leaf を子として描画させる。これで全ノード種別で機能する。
- **アイコン**: ノード種別を Icon Mode のアイコン名に対応づけ、core の
  `renderPictogram` でピクトグラムを描画する。プレビューの Icon Mode と同じ
  グリフを使うことで一貫性が保てる。
- **a11y / toggle 契約**: ActivityBar ボタンは `ActivityBarButton` に集約し
  `aria-pressed` + `aria-label` + 可視ラベルを 1 箇所で担保（TPL-20260516-01）。
  開閉トグルは Files / Outline 双方で両結果状態をテストで検証（TPL-20260518-01）。

## 却下した案

- **Outline を Files の下に常時スタック表示する**: Issue の素朴な読みでは
  「Files の下に Outline」だったが、サイドバー幅で 2 ツリーを縦に並べると
  各々が狭く、ActivityBar のビュー切替という確立した UX も活かせない。
  1 ビュー切替型を採用した。
- **シングルクリックで drill-down も行う**: 操作が 1 つで完結するが、ハイライト
  だけしたいケースと drill-down したいケースを分離できず、leaf ノードの挙動も
  分かりにくい。VS Code 同様の 2 段階に分けた。
- **タグ由来アイコンバリアントを本対応に含める**: `client[mobile]` /
  `resource[table]` 等は Icon Mode では解決されるが、`(kind, tags)→icon` の
  解決 API が core から export されていない。base 種別アイコンに留め、
  フォローアップ #1415 に切り出した。
