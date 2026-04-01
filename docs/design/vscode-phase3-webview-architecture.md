# VSCode Phase 3 — Webview アーキテクチャ選択

- **日付**: 2026-04-01
- **ステータス**: 決定済み
- **関連**: [Issue #176](https://github.com/kompiro/karasu/issues/176), [VSCode 拡張設計](vscode-extension.md)

## 背景・課題

Phase 3 では `.krs` ファイルの SVG プレビューを VSCode の Webview Panel に表示する。
`packages/app` には既に React ベースの `PreviewPane` コンポーネントが存在しており、
この資産を VSCode Webview でも共用すべきかどうかを判断する必要があった。

## 制約・前提

- `packages/app` の `PreviewPane` は React コンポーネント（Vite dev server 前提）
- VSCode Webview は静的 HTML ファイル（Vite dev server には依存できない）
- SVG のレンダリングロジックは `@karasu/core` に集約済み
- Phase 3 のスコープ: SVG 表示 + ビュー切り替え（System / Deploy / Org）
- Phase 4 以降のスコープ: 双方向ジャンプ（Webview と LSP の結合）

## 検討した選択肢

### 案1: `packages/ui` を切り出して app と vscode で共用

`PreviewPane` などの React コンポーネントを `packages/ui` に移動し、
app と vscode の Webview 両方から利用する。

**メリット：**
- UI コンポーネントの一貫性が保てる
- 将来の機能追加（パン/ズーム、ノード詳細パネル等）を共通化できる

**デメリット：**
- Webview 用に React + 依存ライブラリをすべてバンドルする別ビルド（Vite）が必要
- Phase 3 のスコープに対して過剰な投資になる
- app の `PreviewPane` はパン/ズーム、ドリルダウン、クロスナビゲーション等の
  app 固有のインタラクションを多く含んでおり、そのまま Webview に持ち込む
  コンポーネント設計の整理コストが高い

### 案2: app と独立した軽量 HTML Webview を実装（Phase 3 のみ）

Webview を静的 HTML + 最小限の JavaScript で実装する。
SVG は Extension Host で `@karasu/core` を呼んで生成し、`postMessage` で渡す。

**メリット：**
- 追加のビルド設定が不要（esbuild で Extension Host のみバンドル）
- Phase 3 のスコープを最小限の複雑度で実現できる
- Webview と Extension Host の責務が明確に分離される

**デメリット：**
- app の `PreviewPane` と一部の UI 実装が重複する
- 将来 Webview UI が複雑になった場合、改めてリファクタリングが必要

## 比較

| 観点 | 案1（packages/ui 切り出し） | 案2（独立 HTML Webview） |
|------|---------------------------|------------------------|
| Phase 3 実装コスト | 高（ビルド設定 + コンポーネント整理） | 低 |
| UI の一貫性 | 高 | 中（将来の課題） |
| SVG 生成ロジックの共用 | @karasu/core で既に達成済み | @karasu/core で既に達成済み |
| Phase 4+ への影響 | ゼロから始めない | 拡張が必要になる可能性あり |

## 現時点の方針

**案2（独立 HTML Webview）を採用し、`packages/ui` の切り出しは Phase 4 以降に判断する。**

SVG レンダリングの共用は `@karasu/core` で既に達成されている。
Webview UI 層の共用は Phase 4（双方向ジャンプ）で Webview が複雑化したタイミングで
改めて必要性を評価する。

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

`packages/lsp` と同じく esbuild でバンドルする。
`@karasu/core` は ESM モジュールのため、tsc の CommonJS ビルドと直接混在させられない。

```bash
esbuild src/extension.ts --bundle --platform=node --format=cjs \
  --outfile=out/extension.js --external:vscode
```

## 未解決の問い

- **Phase 4 での再評価**: 双方向ジャンプ実装時に Webview が複雑化した場合、
  React + Vite バンドル構成への移行と `packages/ui` 切り出しを改めて検討する
- **パン/ズーム**: Phase 3 では未対応。app の `PreviewPane` 相当の操作性を
  Webview でも提供するかどうかは Phase 4+ の課題
