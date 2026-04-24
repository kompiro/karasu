---
id: ADR-20260407-03
title: "ProjectSelector の Rename 操作 — インライン入力欄パターン"
status: accepted
date: 2026-04-07
topic: app-ui
depends_on:
  - ADR-20260317-02
scope:
  packages:
    - app
---

# ADR-20260407-03: ProjectSelector の Rename 操作 — インライン入力欄パターン

- **日付**: 2026-04-07
- **ステータス**: 決定済み
- **関連**: Issue #357, [ADR-20260317-02](20260317-02-project-and-filesystem.md)

## 背景

`ProjectModeApp` のサイドバー上部にある `ProjectSelector` には、プロジェクトの**切り替え**・**作成**・**削除**は実装済みだったが、**リネーム操作**が欠けていた。バックエンド（`ProjectManager.renameProject`）と状態管理（`RENAME_PROJECT` reducer action）は実装済みで、不足していたのは UI レイヤーのみだった。

## 決定

`+ New` / `Delete` ボタンの隣に `✎ Rename` ボタンを追加する。クリックで現在のドロップダウンがインライン入力欄（現在名が初期値）に切り替わり、Enter で確定、Esc でキャンセルする。

```
通常時:   [ 鴉 ] [ ECプラットフォーム ▼ ] [ + New ] [ ✎ Rename ] [ ✕ Delete ]
リネーム中: [ 鴉 ] [ _ECプラットフォーム_ ] [ OK ] [ Cancel ]
```

`isCreating` と `isRenaming` は独立したフラグとして持ち、一方が true のときは他方を false にする。バリデーション：
- 空文字列・空白のみ → OK ボタン disabled
- 現在名と同じ → OK ボタン disabled（変更なしのため API を呼ばない）

ボタンラベルは幾何学的 Unicode 記号で統一する：`+ New`、`✎ Rename`（U+270E）、`✕ Delete`（U+2715）。絵文字は使わない。

## 理由

- **既存 create フローとの対称性**: インライン入力欄への切替パターンは create で確立済みで、ユーザーが操作を類推できる
- **実装コストが最小**: 既存の `.project-selector-input` / `.project-selector-btn` CSS クラスをそのまま流用でき、CSS 追加が不要
- **発見しやすさ**: ボタンとして常に見えるため、ユーザーがリネーム手段を探す必要がない
- **ブラウザ互換性**: `<select>` のダブルクリック（案2）はブラウザ挙動が不安定

## 却下した案

### 案2: ダブルクリックでリネーム

ボタンを増やさず「名前をダブルクリックで編集」という慣習的操作を採用する案。`<select>` 要素のダブルクリックはブラウザ依存の挙動があり信頼性が低い。またアフォーダンスがなく発見しにくい。

### 案3: ドロップダウンをクリック可能テキスト + 別セレクト UI に分解

現在の `<select>` の大幅な置き換えが必要で、Issue #357 のスコープを大きく超える。
