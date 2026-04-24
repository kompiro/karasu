---
id: ADR-20260330-05
title: VSCode 拡張 — LSP-first アーキテクチャと段階的フェーズ計画
status: accepted
date: 2026-03-30
topic: vscode
scope:
  packages:
    - lsp
    - vscode
---

# ADR-20260330-05: VSCode 拡張 — LSP-first アーキテクチャと段階的フェーズ計画

- **日付**: 2026-03-30
- **ステータス**: 決定済み
- **関連**: `packages/lsp/`, `packages/vscode/`

## 背景

karasu は Web UI（`packages/app`）と CLI（`packages/cli`）を提供していたが、開発者が普段いる場所（エディタ）に karasu を置く手段がなかった。VSCode 拡張として提供することで、`.krs` ファイルをリポジトリに置き、エディタを離れずアーキテクチャを確認・編集できる体験、LSP による補完・エラー表示・ジャンプ、「ドリルダウン型把握」のエディタ統合が実現できる。

## 決定

**LSP-first アーキテクチャ**（案2）を採用する。Minimum Viable LSP から始めて、段階的に標準 LSP 機能を追加する。

### パッケージ構成

```
packages/
├── core/       ← パーサー・レンダラー（既存）
├── lsp/        ← Language Server（新設）
└── vscode/     ← Extension = Language Client + Webview（新設）
```

### 双方向ジャンプのアーキテクチャ

```
[VSCode]
  ├── Extension Host (packages/vscode)
  │     ├── Language Client         ← LSP と IPC 通信
  │     └── Webview Panel           ← SVG プレビュー
  │           ↕ postMessage
  │
  └── Language Server Process (packages/lsp)
        ├── core のパーサーを呼ぶ
        ├── 標準 LSP リクエストを処理
        └── karasu 独自リクエストを処理
```

**エディタ → プレビュー**: カーソル移動 → Extension が `karasu/nodeAtPosition(uri, position)` を LSP に送信 → AST から node_id を返す → Extension が Webview に `postMessage({ type: 'highlight', nodeId })` → SVG 上のノードがハイライト。

**プレビュー → エディタ**: SVG ノードクリック → Webview が `postMessage({ type: 'navigate', nodeId })` → Extension が `karasu/positionOfNode(uri, nodeId)` を LSP に送信 → AST から Range を返す → `vscode.window.activeTextEditor.revealRange(range)`。

### フェーズ計画

| Phase | 目的 | 完了の定義 |
|---|---|---|
| **1** | Extension 骨格 + シンタックスハイライト | `.krs` を開くとキーワードに色がつく |
| **2** | LSP コア + 診断（`publishDiagnostics`） | パースエラーが赤波線で表示 |
| **3** | SVG プレビュー Webview（LSP と独立） | `.krs` を編集するとプレビューがリアルタイム更新 |
| **4** | 双方向ジャンプ（Phase 2 と 3 を結合） | カーソル移動でハイライト、ノードクリックでジャンプ |
| **5** | 標準 LSP 機能（加算的） | completion / definition / hover / documentSymbol |

**フェーズ境界の原則**:

- Phase 2 と 3 は並行開発可能（LSP と Webview の依存関係がない）
- Phase 4 は 2 と 3 が完了してから（結合テストが両方の前提を要求）
- Phase 5 はいつでも追加可能（標準 LSP 機能は加算的で既存機能を壊さない）

## 理由

- **LSP による双方向ジャンプの正確性**: AST ベースの位置解決で、テキスト解析に頼らない
- **クロスファイル参照の自然な対応**: LSP は複数ドキュメントを扱う仕組みを最初から持つため、マルチファイルプロジェクトに自然に拡張できる
- **将来のエディタ非依存性**: Vim/Neovim/Emacs でも LSP サーバーを再利用でき、karasu の対象エコシステムが広がる
- **標準 LSP 機能の加算的追加**: Phase 5 で completion / definition / hover / documentSymbol を順次追加でき、既存機能を壊さない
- **`packages/lsp` の分離**: Extension から独立させることで、Extension Host のプロセスとは別プロセスで動作し、パフォーマンスとデバッグが分離できる

## 却下した案

### 案1: LSP なし（Extension 内蔵ロジック）

実装がシンプルでデバッグが容易だが、後から LSP に移行する場合は実質的な書き直しになる。クロスファイル参照が難しく、VSCode 専用になる。

## 残課題

- `packages/ui` の分離タイミング（app と vscode で SVG プレビューコンポーネントを共用するため）
- Webview のバンドル戦略（Vite でビルドした静的ファイルを extension に同梱する形が有力、詳細は Phase 3 で検討）
- PNG エクスポート（Phase 5 以降で検討）
