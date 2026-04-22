---
id: ADR-20260405-08
title: "プロジェクト URL ナビゲーション — `/projects/<uuid>` パスネーム方式"
status: accepted
date: 2026-04-05
depends_on:
  - ADR-20260404-05
  - ADR-20260330-04
scope:
  packages:
    - app
  domains:
    - navigation
---

# ADR-20260405-08: プロジェクト URL ナビゲーション — `/projects/<uuid>` パスネーム方式

- **日付**: 2026-04-05
- **ステータス**: 決定済み
- **関連**: Issue #321, [ADR-20260404-05](20260404-05-browser-history-navigation.md), [ADR-20260330-04](20260330-04-permanent-link.md)

## 背景

ADR-20260404-05（#278）でプロジェクト内のドリルダウンナビゲーション（`viewPath` / `activeView`）を URL hash に同期したが、**ProjectMode では「どのプロジェクトを開いているか」が URL に反映されない**という課題が残った。プロジェクト切り替えは React state の更新のみで `window.history` が変更されず、ブラウザの戻る/進むボタンがプロジェクト切り替えをまたいで機能せず、特定プロジェクト＋特定ビューへのパーマネントリンクが作れなかった。

## 決定

URL のパスネーム（`/projects/<uuid>`）でプロジェクト識別子を表現する。`history.pushState` / `replaceState` で手動更新し、ルーティングライブラリは導入しない。`useProjectNavigation` カスタムフックを新設して `ProjectModeApp` で使用する。

```
/                           → プロジェクト未選択
/projects/abc123            → プロジェクト abc123
/projects/abc123#krs-system-Payment  → プロジェクト + ドリルダウン位置
```

### 初期化フロー

`listProjects()` は非同期なので、`useProjectNavigation` は `projects.length > 0` になるまで URL 解析を遅延する（`initialized` ref で二重実行防止）。

```
1. URL の /projects/<id> → 2. localStorage["karasu-last-project-id"] → 3. projects[0]
```

で優先順位を付け、決定後に `history.replaceState` で正規化する（hash は保持）。

### プロジェクト切替時

`navigateToProject` が `pushState` でパスを変え hash をリセットする。別プロジェクトに同じ nodeId が存在する保証がないため、hash 引き継ぎは意図が不明確。

### popstate 時

URL のパスから project id を取り出して `currentProject` を同期。`useHistoryNavigation` は変更不要で、`AppShell` 再マウント時に hash を読み取って状態を復元する。

## 理由

- **SPA フォールバック済み**: `karasu serve` (`packages/cli/src/serve.ts`) は既に SPA フォールバックを実装しており、サーバー設定変更が一切不要
- **URL の意味的明確さ**: `/projects/<id>` はリソースを表す標準的な形式で、`?project=<uuid>` より読みやすい
- **クエリ文字列を汚染しない**: `?mode=memory`（MemoryMode）等との棲み分けが明確になる
- **ルーティングライブラリ不要**: `history.pushState` + `popstate` パターンの踏襲で実装コストが最小
- **hash との独立性**: 既存の `#krs-*` hash ナビゲーションと干渉しない

## 却下した案

### 案1: クエリパラメータ `?project=<uuid>`

既存の `?mode=memory` パターンと一致するが、URL が `?project=<long-uuid>` とやや読みにくい。`/projects/<id>` の方がリソース表現として自然。

### 案3: hash の先頭にプロジェクト識別子を含める

`#project-<uuid>/krs-system-Payment` のように hash 全体で表す案。`useHistoryNavigation` の hash 解析ロジックを大幅に変更する必要があり、既存 hash パターンとの後方互換性が崩れる。popstate で `projectId` の変更か `viewPath` の変更かを区別しにくい。

## 残課題

- プロジェクトが削除された状態で古い URL を開いたときのユーザー通知は今回スコープ外（現状は `projects[0]` にフォールバック）
