---
id: ADR-20260405-07
title: クロスシステム参照の Ghost System レンダリング
status: accepted
date: 2026-04-05
topic: renderer
scope:
  packages:
    - core
---

# ADR-20260405-07: クロスシステム参照の Ghost System レンダリング

- **日付**: 2026-04-05
- **ステータス**: 決定済み
- **関連**: Issue #328, Issue #285

## 背景

Issue #285 でドット記法によるクロスシステムエッジ（`OrderService -> PaymentGateway.PaymentService`）の構文を導入したが、`view-extract.ts` の `childIds.has(e.to)` フィルタにより描画時に除外されていた。Issue #328 はこのクロスシステム参照を画面上に表現することを目的とする。

## 決定

`ViewSlice` を拡張し、ルートビューでは複数システムを並列描画、サービスビューでは外部システムを「ghost system」として主システム境界の外側に半透明で描画する。ghost システムは `GhostSystem` 型（`systemNode` + `visibleServices`）で表現する。

### ViewSlice の追加フィールド

| フィールド | 用途 | ビューレベル |
|---|---|---|
| `systems: KrsNode[]` | 並列表示する全システム | ルート (`path = []`) |
| `crossSystemEdges: KrsEdge[]` | システム間をまたぐエッジ | ルート |
| `ghostSystems: GhostSystem[]` | 参照先の外部システム | サービス (`path.length === 1`) |
| `ghostSystemEdges: KrsEdge[]` | ゴーストへのエッジ | サービス |

`childNodes` / `childEdges` は後方互換のため `systems[0]` ベースで維持する。

### Phase 分割

- **Phase 1（本決定）**: `systems[0]` 制約を維持しつつ複数システム描画に対応
- **Phase 2（将来）**: `ViewPath` の先頭セグメントをシステム ID にする根本的な解決

## 理由

- `GhostSystem` 型として「外部システム名 + 表示すべきサービス群」を保持することで、レンダラーが「どのサービスを表示すべきか」を再計算する必要がなくなる（責務分離）
- `ghostSystems` / `ghostSystemEdges` を新フィールドに分離することで、レンダラーが「主システムの子」と「ゴースト」を明確に区別でき、スタイル適用・レイアウト計算で不整合が生じない
- `childNodes` / `childEdges` を `systems[0]` ベースで残すことで、新フィールドを認識しないレンダラーも既存動作を継続できる
- `path` へのシステム ID 包含は `app/`、VS Code 拡張、`nodePathIndex`、LSP に波及するため Phase 2 に分離

## 却下した案

### 案A: 別関数 `extractMultiSystemView` を追加

パス解決ロジックが重複する。呼び出し元が両者を使い分ける必要が生じる。

### 案B: `childNodes` にゴーストシステムを追加

`kind: "system"` で識別する案。レンダラーが「主システムの子」と「ゴースト」を区別できなくなり、スタイル・レイアウトに不整合が生じる。

### 案C: `ghostSystems: KrsNode[]` のみ（`GhostSystem` 型を作らない）

レンダラー側で「どのサービスを表示すべきか」を再計算する必要があり、`extractView` の責務がレンダラーに漏れる。
