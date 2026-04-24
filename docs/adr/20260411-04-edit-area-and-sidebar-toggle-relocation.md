---
id: ADR-20260411-04
title: "`EditArea` コンポーネント新設と sidebar-toggle のサイドバーエリアへの移動"
status: accepted
date: 2026-04-11
topic: app-ui
related_to:
  - ADR-20260411-08
scope:
  packages:
    - app
---

# ADR-20260411-04: `EditArea` コンポーネント新設と sidebar-toggle のサイドバーエリアへの移動

- **日付**: 2026-04-11
- **ステータス**: 決定済み
- **関連**: Issue #465, Issue #455, [ADR-20260411-08](20260411-08-edit-pane-toolbar.md)

## 背景

PR #457 で `LeftPaneToolbar` が導入されエディタタブのアクションボタン (Format) が専用ツールバーに集約されたが、サイドバー（ファイルツリー）の開閉を制御する `sidebar-toggle` ボタンは依然 `AppShell` に残っており、`.app-shell.has-sidebar` 内で `position: absolute; left: var(--sidebar-w)` として絶対配置されていた。

この構造には、(1) `AppShell` がサイドバーエリアの開閉制御という本来の関心外の責務を持つ、(2) 絶対配置がグリッドレイアウト変更に脆い、という 2 つの問題があった。将来 OutlineView をサイドバーに追加する可能性を考えると、サイドバー自身が自分の開閉を制御する構造にしておくことが望ましい。

## 決定

1. **`EditArea` コンポーネントを新設** — FileTree (`sidebarContent`) と `LeftPane` を内包し、`sidebarCollapsed` 状態を所有する
2. **sidebar-toggle ボタンを EditArea 内の `sidebar-area` に移動** — `AppShell` からは sidebar 関連の状態・ボタンを完全に除去
3. **AppShell の CSS グリッドを 2 列に単純化** — `grid-template-columns: 1fr 1fr`（EditArea | Preview）。サイドバー幅の管理は EditArea 内に閉じる
4. **`LeftPane` の `EditPane` への改名は Issue #465 のスコープから外す** — 先行する別 Issue で対応する

`ProjectSelector`（`sidebarHeaderContent`）は引き続き全幅トップバー (row 1) として AppShell 直下に残す。

## 理由

- **責務の分離**: `sidebarCollapsed` が `EditArea` 一箇所に集約され、`AppShell` がサイドバーの状態を一切知らなくて済む
- **将来の拡張性**: OutlineView を追加する際、`sidebar-area` に FileTree/OutlineView のタブ切り替えと toggle を並べるだけで統合できる
- **CSS の単純化**: `AppShell` が 2 列グリッドとなり、将来のレイアウト変更に強くなる
- **改名を切り離す理由**: `LeftPane` → `EditPane` の改名は import / CSS / テストへの広範な変更を伴うため、EditArea 導入と同じ PR に含めると差分が肥大化する

## 却下した案

### sidebar-toggle を `LeftPaneToolbar` に置く（AppShell に状態を残す）

責務移動が不完全。EditPane がタブに依存しないレイアウト制御ボタンを持つことになり、Chat/Settings タブでの toggle 表示も設計が複雑になる。

### EditArea を `display: contents` で導入し CSS グリッドは現状維持

EditArea が内部レイアウトを管理できないため、サイドバー幅などを EditArea 内で制御しにくい。
