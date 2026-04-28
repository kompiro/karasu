---
type: tool
---

# AT-0010: PreviewPane component behavior tests

- **Related Issue**: #40
- **Date**: 2026-03-25

## Overview

Verify that `PreviewPane` component callbacks and highlight behavior work correctly via automated component tests using `@testing-library/react`.

## 受け入れ条件

すべて `packages/app/src/components/PreviewPane.test.tsx` でカバーされる。
ローカル実行は `pnpm --filter @karasu-tools/app test` で行う。

### AC-1: ドリルダウン可能なノードクリック時のハイライト解除

- [x] `data-has-children="true"` のノードをクリックすると `onClearHighlight` と `onDrillDown` がトリガーされる
> ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `it("calls onClearHighlight when a node with children is clicked")`

### AC-2: 葉ノードクリック時のハイライト解除

- [x] `data-has-children="false"` のノードをクリックすると `onClearHighlight` がトリガーされ詳細パネルが開く
> ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `it("calls onClearHighlight when a leaf node is clicked")`

### AC-3: コンテナクリック時はハイライト解除しない

- [x] `data-container-id` 要素をクリックすると `onContainerClick` がトリガーされるが `onClearHighlight` は呼ばれない
> ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `it("does not call onClearHighlight when a deploy container is clicked")`

### AC-4: `highlightedNodeId` が `.karasu-highlighted` を適用する

- [x] `highlightedNodeId` prop を指定して描画すると、該当要素に `.karasu-highlighted` クラスが付与される
> ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `it("applies .karasu-highlighted class to the matching element")`

### AC-5: `highlightedNodeId` が `null` になると `.karasu-highlighted` が外れる

- [x] `highlightedNodeId={null}` で再描画すると、すべての要素から `.karasu-highlighted` が外れる
> ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `it("removes .karasu-highlighted when highlightedNodeId becomes null")`

> 全項目が自動テストで検証されており、手動確認は不要。
