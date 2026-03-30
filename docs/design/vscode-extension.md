# VSCode 拡張設計

- **日付**: 2026-03-30
- **ステータス**: 検討中
- **関連**: なし

## 背景・課題

karasu は現在 Web UI（packages/app）と CLI（packages/cli）を提供しているが、
開発者が普段いる場所（エディタ）に karasu を置くことができない。

VSCode 拡張として提供することで：

- .krs ファイルをリポジトリに置き、エディタを離れずアーキテクチャを確認・編集できる
- LSP による開発体験（補完・エラー表示・ジャンプ）を実現できる
- karasu の核心コンセプトである「ドリルダウン型把握」をエディタ上で体験できる

## 制約・前提

- `packages/core` は Pure TS であり Node.js から呼び出し可能（CLI で実績あり）
- VSCode の Extension Host は Node.js プロセスとして動作する
- Webview は静的バンドルが必要（Vite dev server には依存できない）
- packages/app の Monaco 組み込みは不要（VSCode では editor 本体が Monaco）

## 検討した選択肢

### 案1: LSP なし（Extension 内蔵ロジック）

Extension Host 内に位置解決ロジックを自前実装する。

**メリット：**
- 実装がシンプル（プロセス間通信なし）
- デバッグが容易

**デメリット：**
- 後から LSP に移行する場合は実質的な書き直し
- クロスファイル参照が難しい
- VSCode 専用（Vim/Neovim 等では使えない）

### 案2: LSP-first（Minimum Viable LSP から開始）

LSP サーバーを先に作り、段階的に標準 LSP 機能を追加する。

**メリット：**
- 双方向ジャンプがセマンティックに正確（AST ベースの位置解決）
- クロスファイル参照を自然に扱える
- LSP サーバーは将来 Vim/Neovim/Emacs でも再利用可能
- 標準 LSP 機能（補完・定義ジャンプ等）を加算的に追加できる

**デメリット：**
- プロセス間通信（IPC）のデバッグが複雑
- 初期実装コストが高い

## 比較

| 観点 | 案1（LSP なし） | 案2（LSP-first） |
|------|----------------|----------------|
| 初期実装コスト | 低 | 中〜高 |
| 双方向ジャンプの正確さ | 低（テキスト解析） | 高（AST ベース） |
| クロスファイル参照 | 困難 | 自然に対応 |
| 将来の拡張性 | LSP 移行時に書き直し | 加算的に拡張可能 |
| エディタ非依存性 | VSCode 専用 | LSP 対応エディタすべて |

## 現時点の方針

**案2（LSP-first）を採用する。**

まず Minimum Viable LSP（診断 + 双方向ジャンプ用カスタムリクエストのみ）を実装し、
その後標準 LSP 機能を段階的に追加する。

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

**エディタ → プレビュー：**

```
カーソル移動
  → Extension が LSP に karasu/nodeAtPosition(uri, position) を送信
  → LSP が AST から node_id を返す
  → Extension が Webview に postMessage({ type: 'highlight', nodeId })
  → SVG 上のノードがハイライト
```

**プレビュー → エディタ：**

```
SVG ノードをクリック
  → Webview が postMessage({ type: 'navigate', nodeId })
  → Extension が LSP に karasu/positionOfNode(uri, nodeId) を送信
  → LSP が AST から Range を返す
  → vscode.window.activeTextEditor.revealRange(range)
```

## フェーズ計画

### Phase 1 — Extension 骨格 ＋ シンタックスハイライト

**目的：** 拡張としての土台を作り、.krs ファイルを「karasu ファイル」として認識させる

- `packages/vscode` 新設
- `.krs` / `.krs.style` の言語定義登録
- TextMate grammar によるシンタックスハイライト
- LSP なし

**完了の定義：** .krs ファイルを開くとキーワードに色がつく

---

### Phase 2 — LSP コア ＋ 診断

**目的：** `packages/lsp` を新設し、パースエラーをエディタ上に表示する

- `packages/lsp` 新設（`vscode-languageserver` ベース）
- ドキュメント同期（`didOpen` / `didChange` / `didClose`）
- `publishDiagnostics`（パースエラーを赤波線で表示）
- Extension に Language Client を追加

**完了の定義：** .krs に構文エラーがあると赤波線が出る

> フェーズ境界の意図：LSP サーバーをプロセスとして起動・通信できる状態を確立する。
> 双方向ジャンプのカスタムリクエストはまだ追加しない。

---

### Phase 3 — SVG プレビュー Webview

**目的：** core を使って SVG を Webview に表示する（LSP とは独立）

- Webview Panel の実装
- `packages/core` を Extension Host から呼んで SVG 生成
- ドキュメント変更を検知してリアルタイム更新
- ビュー切り替え（System / Deploy / Org）

**完了の定義：** .krs を編集するとプレビューがリアルタイム更新される

> フェーズ境界の意図：Webview が LSP から独立して動くことを確認してから、
> 次フェーズで結合する。Phase 2 と並行開発が可能。

---

### Phase 4 — 双方向ジャンプ

**目的：** Phase 2（LSP）と Phase 3（Webview）を結合し、karasu の核心体験を作る

- LSP に `karasu/nodeAtPosition`（カーソル位置 → ノード ID）を追加
- LSP に `karasu/positionOfNode`（ノード ID → テキスト Range）を追加
- Extension でカーソル移動を検知 → LSP → Webview にハイライト指示
- Webview でノードクリック → Extension → LSP → エディタジャンプ

**完了の定義：** エディタのカーソルを動かすとプレビューのノードがハイライトされ、プレビューのノードをクリックするとエディタがジャンプする

---

### Phase 5 — 標準 LSP 機能（加算的）

- `textDocument/completion`（キーワード・識別子補完）
- `textDocument/definition`（定義ジャンプ、クロスファイル）
- `textDocument/hover`（ノード説明の表示）
- `textDocument/documentSymbol`（Outline 表示）

**フェーズ境界の原則：**

| 原則 | 理由 |
|------|------|
| Phase 2 と 3 は並行開発可能 | LSP と Webview の依存関係がない |
| Phase 4 は 2 と 3 が完了してから | 結合テストが両方の前提を要求する |
| Phase 5 はいつでも追加可能 | 標準 LSP 機能は加算的で既存機能を壊さない |

## 未解決の問い

- `packages/ui` の分離タイミング：app と vscode で SVG プレビューコンポーネントを共用するための `packages/ui` 切り出しは、vscode 開発を始めたタイミングで判断する
- Webview のバンドル戦略：Vite でビルドした静的ファイルを extension に同梱する形が有力だが、詳細は Phase 3 で検討
- PNG エクスポート：SVG → canvas → blob の変換は Phase 5 以降で検討
