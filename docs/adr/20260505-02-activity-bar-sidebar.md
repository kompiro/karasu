---
id: ADR-20260505-02
title: アクティビティバー + サイドバー構造の導入
status: accepted
date: 2026-05-05
topic: app-ui
related_to: [ADR-20260405-02]
assumptions:
  - "file: packages/app/src/components/EditArea.tsx"
  - "symbol: packages/app/src/components/EditArea.tsx :: EditArea"
  - "grep: packages/app/src/styles/app.css :: \\.activity-bar"
---

# ADR-20260505-02: アクティビティバー + サイドバー構造の導入

- **日付**: 2026-05-05
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1108](https://github.com/kompiro/karasu/issues/1108)
  - PR [#1115](https://github.com/kompiro/karasu/pull/1115)
  - `packages/app/src/components/EditArea.tsx`
  - `packages/app/src/styles/app.css`（`.activity-bar`, `.sidebar-area`, `.sidebar-resize-handle`）

## 背景

これまで `.edit-area` の左側にあった「ファイルツリー」は、サイドバーという概念が
明確に定義されないまま、`sidebarContent` という単一スロットとして組み込まれていた。
collapse / expand は中央に絶対配置されたボタンで操作する形で、視覚的にも構造的にも
「サイドバーの位置付け」が曖昧だった。

#1108 でこの UX を整える過程で、以下の3案を比較した上で VSCode 風の構造を採用した：

- A. 細いアクティビティバーを常時表示し、その右にパネル領域を配置する（VSCode 型）
- B. ヘッダーに collapse/expand ボタンを置く
- C. collapse 時に薄いガターを残してクリックで再展開（IntelliJ 型）

A を採用したことで、「サイドバー」という独立した UI 領域がアプリ構造に明示的に
導入された。今後 Outline、Search、Source Control 相当などの追加パネルを増やしていくため、
その構造を ADR として明文化しておく。

## 決定

`.edit-area` 直下に **アクティビティバー（44px の縦帯ナビゲーション）** と
**サイドバー（可変幅のパネル領域）** の2層構造を導入する。アクティビティバーは
現在および将来のサイドバーパネルを切り替えるエントリポイントとなり、サイドバーは
1つのパネルを描画する slot として振る舞う。

```
┌──────────┬──────────────────────────┬────────────────┐
│ Activity │  Sidebar (panel slot)    │   Editor       │
│  Bar     │   Files / Outline / ...  │                │
│ (44px)   │   (resizable 180–480px)  │                │
└──────────┴──────────────────────────┴────────────────┘
```

## 理由

- **collapse 時のエントリポイントが固定される**: アクティビティバーは常時表示されるため、
  パネルを閉じても「再度開く方法」が画面上に常に存在し、ユーザーが迷わない。
- **拡張余地が一次元（縦方向）に揃う**: Outline、Search、Source Control などのパネル追加は
  アクティビティバーに項目を増やすだけで済み、ヘッダー領域や絶対配置の追加で破綻しない。
- **既存ユーザー（特に VSCode 利用者）の学習コストが低い**: パネル切替・collapse の操作モデルが
  既知のメンタルモデルと一致する。
- **テーマ・スタイルとの相性**: 44px 幅は karasu の `--bg-void` ベースの暗色テーマに馴染み、
  既存のツールバーボタン規約（ADR-20260405-02）と独立した別レイヤーとして共存できる。

## サイドバーパネルを追加する手順

1. アクティビティバーに新しいボタン（icon + text label, ADR-20260405-02 のラベル規約に従う）を追加する。
2. パネルコンポーネントを作成し、`EditArea` の `sidebarContent` slot に渡せる ReactNode として用意する。
3. アクティビティバーの選択状態に応じて `sidebarContent` に渡すパネルを切り替える。
4. パネル幅は `localStorage` キー `karasu:sidebar:width` で全パネル共通に永続化する（180–480px）。

> 当面の実装範囲は Files パネルのみ。複数パネル間の切替は最初の追加パネル（Outline 想定）が
> 入る時点で具体化する — どのアクティビティを「最後に開いていたか」の永続化、collapse 時の
> アクティブ状態の扱いなど、API は実装直前に詰める。

## 却下した案

- **B. ヘッダーに collapse/expand を置く**: 拡張時に追加パネルへの切替手段を別途用意する必要があり、
  collapse 時はそのヘッダー自体が消えるため再展開のエントリが弱い。
- **C. collapse 時のガター + クリックで再展開**: 8px 幅のガターは hover/focus が見つけにくく、
  「何ができるか」が画面から分からない（user feedback at #1108: "Expand 時の振る舞いが予測できない"）。
  また、追加パネルが入ったときの UI が縮退してしまう。

## 参考

- VSCode の Activity Bar / Side Bar 構造
- ADR-20260405-02（toolbar button のラベル規約）— アクティビティバーボタンも icon + text label を保持する
