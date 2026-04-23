---
id: ADR-20260401-04
title: VSCode Phase 3 — 独立 HTML Webview アーキテクチャ
status: accepted
date: 2026-04-01
topic: vscode
depends_on:
  - ADR-20260330-05
scope:
  packages:
    - vscode
  domains:
    - vscode
---

# ADR-20260401-04: VSCode Phase 3 — 独立 HTML Webview アーキテクチャ

- **日付**: 2026-04-01
- **ステータス**: 決定済み
- **関連**: Issue #176, [ADR-20260330-05](20260330-05-vscode-extension-lsp-first.md)

## 背景

VSCode 拡張の Phase 3（ADR-20260330-05）で `.krs` ファイルの SVG プレビューを Webview Panel に表示する必要があった。`packages/app` にはすでに React ベースの `PreviewPane` が存在しており、この資産を VSCode Webview でも共用すべきか、独立した軽量 HTML Webview を実装すべきかを判断する必要があった。

## 決定

**案2（独立 HTML Webview）を採用する**。`packages/ui` の切り出しは Phase 4 以降に判断する。

### Phase 3 の Webview 構成

```
[Extension Host]  packages/vscode/src/extension.ts
  │
  ├── karasu.openPreview コマンド
  ├── onDidChangeTextDocument  ─┐
  └── onDidChangeActiveTextEditor ─┘→ PreviewPanel.update(document)

[PreviewPanel]  packages/vscode/src/preview-panel.ts
  ├── @karasu/core の compile() / compileOrgView() を呼んで SVG 生成
  └── webview.html を再生成して表示更新

[Webview HTML]  静的 HTML（インラインスクリプト）
  ├── [System] [Deploy] [Org] 切り替えボタン
  ├── SVG 表示エリア
  └── ボタンクリック → postMessage({ type: 'switchView' }) → Extension Host
```

### ビルド方針

`packages/lsp` と同じく **esbuild** でバンドルする。`@karasu/core` は ESM モジュールのため、tsc の CommonJS ビルドと直接混在させられない：

```bash
esbuild src/extension.ts --bundle --platform=node --format=cjs \
  --outfile=out/extension.js --external:vscode
```

## 理由

- **Phase 3 スコープとのバランス**: `packages/ui` 切り出し + React + Vite の別ビルド構成は Phase 3（SVG 表示 + ビュー切替）に対して過剰。案2 なら追加ビルド設定不要で最小複雑度で実現できる
- **`@karasu/core` で既に共用達成**: SVG レンダリングロジックは `core` に集約済みなので、UI 層の共用は Phase 3 時点では必須ではない
- **責務の明確な分離**: Webview（静的 HTML + 最小 JS）と Extension Host（SVG 生成）の境界が明確
- **`app` の `PreviewPane` との整理コスト回避**: `PreviewPane` はパン/ズーム、ドリルダウン、クロスナビゲーション等の app 固有インタラクションを多く含んでおり、そのまま Webview に持ち込むにはコンポーネント設計の整理が必要
- **esbuild の選択**: LSP と同じビルド方式で統一でき、ESM/CommonJS 混在問題を回避できる

## 却下した案

### 案1: `packages/ui` を切り出して app と vscode で共用

UI コンポーネントの一貫性と将来の機能追加（パン/ズーム、ノード詳細パネル等）の共通化という利点はあるが、Webview 用の React + Vite バンドル設定が必要で Phase 3 のスコープに対して過剰な投資になる。`PreviewPane` のリファクタリングコストも高い。

## 残課題（Phase 4+ で再評価）

- **Phase 4 での再評価**: 双方向ジャンプ実装時に Webview が複雑化した場合、React + Vite バンドル構成への移行と `packages/ui` 切り出しを改めて検討する
- **パン/ズーム**: Phase 3 では未対応。app の `PreviewPane` 相当の操作性を Webview でも提供するかは Phase 4+ の課題
