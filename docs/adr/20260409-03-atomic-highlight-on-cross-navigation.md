---
id: ADR-20260409-03
title: クロスナビゲーション時のアトミックなハイライト適用
status: accepted
date: 2026-04-09
topic: navigation
depends_on:
  - ADR-20260320-01
scope:
  packages:
    - app
  domains:
    - navigation
    - rendering
---

# ADR-20260409-03: クロスナビゲーション時のアトミックなハイライト適用

- **日付**: 2026-04-09
- **ステータス**: 決定済み
- **関連**: Issue #422, [ADR-20260320-01](20260320-01-interactive-svg-rendering.md), [node-click-ux.md](../design/node-click-ux.md)

## 背景

D ボタン（サービス → Deploy 図）やチームラベル（サービス → Org 図）をクリックした際、ビュー切り替えと同時に対象ノードをハイライトする挙動が期待されていたが、現状では適用されていなかった。

原因は、ハンドラが `navigateActiveView("deploy")` と `dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId })` を順番にディスパッチする一方で、`SET_ACTIVE_VIEW` の reducer が `highlightedNodeId` を常に `null` にリセットしていた点にある。React 18 の自動バッチングにより 2 つの dispatch が 1 回のレンダリングにまとめられると、`highlightedNodeId` が `null` の状態でレンダリングされてしまう。

## 決定

`SET_ACTIVE_VIEW` アクション型にオプションフィールド `highlightNodeId?: string | null` を追加し、reducer で 1 回の状態遷移としてビュー切り替えとハイライト設定を処理する。呼び出し側は `navigateActiveView + SET_HIGHLIGHTED_NODE` の 2 段 dispatch を単一 dispatch に統合する。

```ts
case "SET_ACTIVE_VIEW":
  return {
    ...state,
    activeView: action.activeView,
    viewPath: [],
    highlightedNodeId: action.highlightNodeId ?? null,
  };
```

## 理由

- 状態遷移が 1 回のレンダリングで完結するためアトミック性が保証される
- `highlightNodeId` を省略した場合は従来どおり `null` にリセットされ、タブ手動クリック時の動作は維持される
- `navigateActiveView` のシグネチャ変更が不要で、History API 連携コードに影響しない
- 変更範囲が reducer 1 行と呼び出し側 4 箇所に収まる

## 却下した案

### 専用の `NAVIGATE_WITH_HIGHLIGHT` アクションを追加

責務は明確化するが、ボイラープレートが増える。「ナビゲーション + ハイライト」と「ナビゲーションのみ」を別アクションにすることで、今後ハンドラ追加時に選択を誤るリスクがある。

### `SET_ACTIVE_VIEW` での `null` リセットを削除

ハイライトリセットが必要な全呼び出し箇所を洗い出す必要があり、見逃しによりハイライトが残り続けるバグのリスクがある。

## 関連 Issue

- ブラウザバック/フォワード時のハイライト復元（Issue #425 → ADR-20260411-03）は本決定の後続で別途対応
