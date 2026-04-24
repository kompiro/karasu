---
id: ADR-20260405-04
title: Reference パネルの図種別コンテキスト対応
status: accepted
date: 2026-04-05
topic: app-ui
scope:
  packages:
    - app
---

# ADR-20260405-04: Reference パネルの図種別コンテキスト対応

- **日付**: 2026-04-05
- **ステータス**: 決定済み
- **関連**: （設計ドキュメントは本 ADR に統合済み）

## 背景

Reference パネルは system diagram の構文情報のみを表示しており、deploy diagram・org diagram を執筆中の構文確認手段がなかった。また Reference ボタンが `BreadcrumbBar` に内包されていたため、deploy 表示中はボタン自体が消えてしまう問題があった。

## 決定

1. Reference ボタンを `BreadcrumbBar` から独立させ、`KarasuPreviewColumn` に常時表示される `ToolBar` に移動する
2. `ReferencePanel` が `activeView` に基づいて表示内容を切り替える
3. `KarasuReference` に `DeployUnitKindInfo`・`OrgKindInfo` 型と対応データを追加する

## 理由

### Reference ボタンを ToolBar に移動

`BreadcrumbBar` はパンくずナビゲーションの責務に集中させ、Reference の管理を `KarasuPreviewColumn` に移すことで、全図種別で Reference を常時利用できるようにする。

### `activeView` による表示切り替え

`activeView = "system" | "deploy" | "org"` はすでに `app-reducer.ts` で統一済みであり、パネル内で `useAppContext()` から直接参照することで prop chain の追加を避けられる。

実装時は `KarasuPreviewColumn` から props 経由で `activeView` を渡す形になったが、機能的には設計意図と同等である。

### タブごとの表示内容

| タブ | system | deploy | org |
|------|--------|--------|-----|
| Syntax | `nodeKinds` テーブル | `deployUnitKinds` テーブル | `orgKinds` テーブル |
| Styles | system 用セレクタ例 | deploy 用セレクタ例 | org 用セレクタ例 |
| Tags & Annotations | 既存一覧 | 未対応を表示 | 未対応を表示 |
| Built-in Theme | 全図種別共通 | 同左 | 同左 |

## 却下した案

### prop chain で `activeView` を渡す

コンポーネント間の結合が増えるうえ、`AppProvider` が既にラップしているためコンテキスト参照で十分。採用しない。
