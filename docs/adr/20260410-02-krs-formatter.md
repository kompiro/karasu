# ADR-20260410-02: `.krs` フォーマッター — トークン列ベースでコメント保持

- **日付**: 2026-04-10
- **ステータス**: 決定済み
- **関連**: Issue #438

## 背景

`.krs` ファイルを書くときのインデント・スペーシング・プロパティ順序が作者によってバラバラで、`gofmt` / `prettier` のように「フォーマッターを通せば常に同じ出力になる」仕組みが求められていた。コメントはアーキテクチャの意図・注記を記述する重要な情報のため、フォーマット後も必ず保持する必要があった。

現状の `Lexer.skipWhitespaceAndComments()` はコメントを完全に破棄しており、AST（`KrsFile`）にコメントノードは存在しない。コメント保持にはレキサーの拡張が必要だった。

## 決定

### 1. コメント保持は **トークン列ベース**（案B）

レキサーに `tokenizeWithComments()` を追加する。AST は変更せず、フォーマッターが AST（構造）＋コメントトークン列（位置情報）を組み合わせて出力する。

### 2. コメント配置アルゴリズム

| 種類 | 判定 | 出力位置 |
|---|---|---|
| **leading comment** | コメントが次の非コメントトークンと別の行にある | その直前（同インデント） |
| **trailing comment** | コメントが直前の非コメントトークンと同一行にある | その行末に追記 |

処理フロー：

1. `tokenizeWithComments(src)` でコメント入りトークン列を取得
2. 各コメントを直前の非コメントトークンの行番号で leading / trailing に分類
3. `Parser.parse(src)` で AST を取得（既存 `tokenize()` を使うため影響なし）
4. AST を再帰 walk して出力文字列を構築。各ノードの出力前に「そのノードが始まる行より前」の leading コメントを探して出力

### 3. フォーマットルール

- `@import` はまとめて先頭、最後の `@import` 後に 1 空行
- キーワード + id（+ タグ + アノテーション）+ `{` は同一行
- 2 スペースインデント、プロパティは 1 行 1 つ
- プロパティブロック内に空行なし
- 兄弟ブロック間・トップレベルブロック間に 1 空行
- タグ・アノテーションはスペース区切り（`service Foo [external] @deprecated {`）
- エッジは `->` / `-->` の前後に 1 スペース

### 4. 冪等性の保証

`format(format(src)) === format(src)`。パースエラーがある入力にはフォーマットを適用しない（`FormatError` を throw、壊れた入力を上書きしない）。スタイル設定ファイルは持たない（opinionated）。

### 5. 新規トークン

`TokenType` に `LineComment` / `BlockComment` を追加。`Lexer` に `tokenizeWithComments()` を追加し、`skipWhitespaceAndComments` を `skipWhitespace` + `readComment` に分離する。既存の `tokenize()` は変更しない（パーサーへの影響ゼロ）。

### 6. フェーズ分割

```
Phase 1 (Lexer)
  └─ Phase 2 (Core Formatter)
       ├─ Phase 3 (CLI: karasu fmt)
       ├─ Phase 4 (LSP: textDocument/formatting)
       └─ Phase 5 (App: toolbar + Shift+Alt+F)
```

Phase 2 完了後、Phase 3〜5 は並行実装可能。

### 7. `karasu fmt` CLI

```
karasu fmt [files...]          # in-place
karasu fmt --check [files...]  # CI 用、差分あれば exit 1
karasu fmt --stdin             # pipe 用、stdout 出力
```

- デフォルト: カレントディレクトリの `**/*.krs`
- exit code: 0 = 成功、1 = `--check` で差分あり、2 = parse エラー / 読み取りエラー

### 8. LSP 統合

`documentFormattingProvider: true` を capabilities に追加し、`onDocumentFormatting` で `format(text)` を呼んで full-document replacement の `TextEdit` を返す。`FormatError` の場合は空配列を返す（エラーを上書きしない）。

### 9. App 統合

`AppShell` に `handleFormat` callback を追加し、`LeftPane` / `EditorPane` に `onFormat` prop を渡す。`EditorPane.handleMount` で `editor.addCommand(KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF, onFormat)` を登録。ツールバーボタンはパースエラー時 `disabled`。

## 理由

- **トークン列ベース（案B）**: `KrsNode` の型定義を変更するとパーサー全体・ビューアー・SVG レンダラーへの影響が広い。フォーマッター専用の処理を `core` の共有 AST 型に混入しない方が関心の分離が明確。コメントの「所属ノード」を決める責務をフォーマッター側に閉じられる
- **既存 `tokenize()` を変更しない**: パーサーへの影響ゼロで、既存のすべてのテスト・ビューアー・レンダラーが無変更で動く
- **冪等性の保証**: `format(src)` が出力する文字列は既にルール通りなので、再度 format しても変化しない
- **パースエラー時は書き換えない**: 壊れた `.krs` をフォーマット結果で上書きすると入力がさらに壊れる可能性がある。`FormatError` を throw して呼び出し側に判断させる
- **opinionated**: スタイル設定ファイルを持たないことで `gofmt` / `prettier` と同じ「通せば常に同じ出力」の体験を実現する

## 却下した案

### 案A: AST 拡張（`KrsNode` に `leadingComments` / `trailingComments` を追加）

パーサー全体・ビューアー・SVG レンダラーへの影響が広く、フォーマッター専用の処理が `core` の共有 AST 型に混入する。

## 残課題

- ブロックコメント `/* */` が複数行にまたがる場合のインデント正規化（v1 では行ごとそのまま出力し先頭インデントのみ差し替える方針）
- `karasu fmt` のデフォルトグロブ範囲（再帰検索 vs 明示ファイル必須）
